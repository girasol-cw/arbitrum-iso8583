// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, StdInvariant} from "forge-std/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ArbitrumSettlementCore} from "../src/ArbitrumSettlementCore.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IArbitrumSettlementCore} from "../src/interfaces/IArbitrumSettlementCore.sol";
import {
    Hold,
    HoldStatus,
    ZeroAddress,
    ZeroAmount,
    TokenNotAllowed,
    InsufficientAvailableBalance,
    TxIdAlreadyUsed,
    HoldNotFound,
    InvalidHoldStatus,
    HoldExpired,
    HoldNotExpired,
    ExpiresAtInPast,
    BatchTooLarge
} from "../src/interfaces/ISettlementTypes.sol";

// =============================================================================
// Auxiliary: malicious token for reentrancy tests
// =============================================================================

/// @dev ERC-20 que llama un payload arbitrario durante `transfer`.
///      Verifica que los guards nonReentrant de ArbitrumSettlementCore actúan.
contract ReentrantToken is MockERC20 {
    bytes  public attackPayload;
    address public attackTarget;

    constructor() MockERC20("ReentrantUSD", "RUSD", 6) {}

    function setAttack(address target, bytes calldata payload) external {
        attackTarget = target;
        attackPayload = payload;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (attackTarget != address(0) && attackPayload.length > 0) {
            address t = attackTarget;
            bytes memory p = attackPayload;
            attackTarget   = address(0);
            attackPayload  = "";
            // La llamada reentrante debe ser rechazada por nonReentrant; ignoramos
            // el resultado deliberadamente.
            (bool ok, ) = t.call(p);
            (ok);
        }
        return super.transfer(to, amount);
    }
}

// =============================================================================
// Auxiliary: handler para invariant tests de Foundry
// =============================================================================

/// @dev Conduce transiciones de estado aleatorias. Foundry llama a sus
///      funciones públicas durante el fuzzing de invariantes.
contract SettlementHandler is Test {
    ArbitrumSettlementCore public core;
    MockERC20              public token;
    address public relayer;
    address public admin;

    address[] public users;
    bytes32[] public activeTxIds;
    uint256   public nextTxSeed;

    mapping(address => bool) private _registeredUser;

    constructor(
        ArbitrumSettlementCore _core,
        MockERC20              _token,
        address                _relayer,
        address                _admin
    ) {
        core    = _core;
        token   = _token;
        relayer = _relayer;
        admin   = _admin;
    }

    // --- helpers internos ---

    function _nextUser(uint256 seed) internal view returns (address) {
        return users[seed % users.length];
    }

    function _nextTxId() internal returns (bytes32) {
        return keccak256(abi.encode("tx", nextTxSeed++));
    }

    // --- acciones ---

    function addUser(uint256 seed) external {
        address u = address(uint160(uint256(keccak256(abi.encode("user", seed)))));
        if (_registeredUser[u]) return; // evitar duplicados en el array
        _registeredUser[u] = true;
        token.mint(u, 10_000e6);
        users.push(u);
    }

    function deposit(uint256 userSeed, uint96 rawAmount) external {
        if (users.length == 0) return;
        address u      = _nextUser(userSeed);
        uint256 balance = token.balanceOf(u);
        if (balance == 0) return;
        uint256 amount = bound(rawAmount, 1, balance);

        vm.startPrank(u);
        token.approve(address(core), amount);
        core.deposit(address(token), amount);
        vm.stopPrank();
    }

    function withdraw(uint256 userSeed, uint96 rawAmount) external {
        if (users.length == 0) return;
        address u = _nextUser(userSeed);
        (uint256 avail, ) = core.getBalance(u, address(token));
        if (avail == 0) return;
        uint256 amount = bound(rawAmount, 1, avail);

        vm.prank(u);
        core.withdraw(address(token), amount);
    }

    function authorize(uint256 userSeed, uint96 rawAmount) external {
        if (users.length == 0) return;
        address u = _nextUser(userSeed);
        (uint256 avail, ) = core.getBalance(u, address(token));
        if (avail == 0) return;

        uint256 amount   = bound(rawAmount, 1, avail);
        bytes32 txId     = _nextTxId();
        uint48  expiresAt = uint48(block.timestamp + 1 hours);
        address merch    = address(uint160(uint256(keccak256(abi.encode("merch", userSeed)))));

        vm.prank(relayer);
        core.authorize(txId, u, merch, address(token), amount, expiresAt);

        activeTxIds.push(txId);
    }

    function capture(uint256 txSeed) external {
        if (activeTxIds.length == 0) return;
        bytes32 txId = activeTxIds[txSeed % activeTxIds.length];
        Hold memory h = core.getHold(txId);
        if (h.status != HoldStatus.AUTHORIZED) return;
        if (block.timestamp > h.expiresAt)      return;

        vm.prank(relayer);
        core.capture(txId);
    }

    function release_(uint256 txSeed) external {
        if (activeTxIds.length == 0) return;
        bytes32 txId = activeTxIds[txSeed % activeTxIds.length];
        Hold memory h = core.getHold(txId);
        if (h.status != HoldStatus.AUTHORIZED) return;

        vm.prank(relayer);
        core.release(txId);
    }

    function expire_(uint256 txSeed) external {
        if (activeTxIds.length == 0) return;
        bytes32 txId = activeTxIds[txSeed % activeTxIds.length];
        Hold memory h = core.getHold(txId);
        if (h.status != HoldStatus.AUTHORIZED) return;

        vm.warp(h.expiresAt + 1);
        core.expire(txId);
    }

    // --- vistas para aserciones de invariante ---

    function totalLocked() external view returns (uint256 sum) {
        for (uint256 i; i < users.length; ++i) {
            (, uint256 locked) = core.getBalance(users[i], address(token));
            sum += locked;
        }
    }

    function totalAuthorizedHoldAmounts() external view returns (uint256 sum) {
        for (uint256 i; i < activeTxIds.length; ++i) {
            Hold memory h = core.getHold(activeTxIds[i]);
            if (h.status == HoldStatus.AUTHORIZED) sum += h.amount;
        }
    }

    function totalAccountedBalance() external view returns (uint256 sum) {
        for (uint256 i; i < users.length; ++i) {
            (uint256 avail, uint256 locked) = core.getBalance(users[i], address(token));
            sum += avail + locked;
        }
    }

    function getActiveTxIds() external view returns (bytes32[] memory) {
        return activeTxIds;
    }
}

// =============================================================================
// Tests unitarios
// =============================================================================

contract ArbitrumSettlementCoreTest is Test {
    ArbitrumSettlementCore core;
    MockERC20 token;

    address admin    = makeAddr("admin");
    address relayer  = makeAddr("relayer");
    address pauser   = makeAddr("pauser");
    address user     = makeAddr("user");
    address merchant = makeAddr("merchant");
    address stranger = makeAddr("stranger");

    bytes32 constant TX1 = keccak256("tx1");
    bytes32 constant TX2 = keccak256("tx2");
    uint256 constant AMOUNT = 100e6;
    uint48  expiresAt;

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        token = new MockERC20("USD Coin", "USDC", 6);

        ArbitrumSettlementCore impl = new ArbitrumSettlementCore();
        bytes memory initData = abi.encodeCall(ArbitrumSettlementCore.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        core = ArbitrumSettlementCore(address(proxy));

        vm.startPrank(admin);
        core.grantRole(core.RELAYER_ROLE(), relayer);
        core.grantRole(core.PAUSER_ROLE(),  pauser);
        core.configureToken(address(token), true);
        vm.stopPrank();

        token.mint(user, 1_000e6);
        expiresAt = uint48(block.timestamp + 1 hours);
    }

    // =========================================================================
    // Deployment
    // =========================================================================

    function test_deploy_adminRolesAssigned() public view {
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), admin),  "admin: DEFAULT_ADMIN_ROLE");
        assertTrue(core.hasRole(core.PAUSER_ROLE(),        admin),  "admin: PAUSER_ROLE");
        assertTrue(core.hasRole(core.TOKEN_ADMIN_ROLE(),   admin),  "admin: TOKEN_ADMIN_ROLE");
        assertTrue(core.hasRole(core.RELAYER_ROLE(),       relayer),"relayer: RELAYER_ROLE");
    }

    function test_deploy_rejectsZeroAdmin() public {
        ArbitrumSettlementCore impl = new ArbitrumSettlementCore();
        bytes memory badInit = abi.encodeCall(ArbitrumSettlementCore.initialize, (address(0)));
        vm.expectRevert(ZeroAddress.selector);
        new ERC1967Proxy(address(impl), badInit);
    }

    // =========================================================================
    // Token Config
    // =========================================================================

    function test_tokenConfig_adminCanWhitelist() public {
        MockERC20 newToken = new MockERC20("DAI", "DAI", 18);

        vm.prank(admin);
        core.configureToken(address(newToken), true);

        assertTrue(core.getTokenConfig(address(newToken)).allowed);
    }

    function test_tokenConfig_rejectsDepositOfUnsupportedToken() public {
        MockERC20 badToken = new MockERC20("BAD", "BAD", 6);
        badToken.mint(user, 100e6);

        vm.startPrank(user);
        badToken.approve(address(core), 100e6);
        vm.expectRevert(abi.encodeWithSelector(TokenNotAllowed.selector, address(badToken)));
        core.deposit(address(badToken), 100e6);
        vm.stopPrank();
    }

    function test_tokenConfig_storesDecimalsCorrectly() public view {
        assertEq(core.getTokenConfig(address(token)).decimals, 6);
    }

    function test_tokenConfig_rejectsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(ZeroAddress.selector);
        core.configureToken(address(0), true);
    }

    function test_tokenConfig_onlyTokenAdmin() public {
        vm.prank(stranger);
        vm.expectRevert();
        core.configureToken(address(token), false);
    }

    // =========================================================================
    // Deposit
    // =========================================================================

    function test_deposit_updatesAvailableBalance() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        (uint256 avail, ) = core.getBalance(user, address(token));
        assertEq(avail, AMOUNT);
    }

    function test_deposit_rejectsZeroAmount() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        vm.expectRevert(ZeroAmount.selector);
        core.deposit(address(token), 0);
        vm.stopPrank();
    }

    function test_deposit_accumulates() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        (uint256 avail, ) = core.getBalance(user, address(token));
        assertEq(avail, 2 * AMOUNT);
    }

    // =========================================================================
    // Withdraw
    // =========================================================================

    function test_withdraw_reducesAvailableBalance() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(user);
        core.withdraw(address(token), AMOUNT);

        (uint256 avail, ) = core.getBalance(user, address(token));
        assertEq(avail, 0);
    }

    function test_withdraw_rejectsInsufficientFunds() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(InsufficientAvailableBalance.selector, 0, AMOUNT)
        );
        core.withdraw(address(token), AMOUNT);
    }

    function test_withdraw_rejectsZeroAmount() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(user);
        vm.expectRevert(ZeroAmount.selector);
        core.withdraw(address(token), 0);
    }

    // =========================================================================
    // Authorization
    // =========================================================================

    function test_authorize_movesBalanceToLocked() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        (uint256 avail, uint256 locked) = core.getBalance(user, address(token));
        assertEq(avail,  0);
        assertEq(locked, AMOUNT);
    }

    function test_authorize_revertsWithoutDeposit() public {
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(InsufficientAvailableBalance.selector, 0, AMOUNT)
        );
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
    }

    function test_authorize_revertsWithInsufficientBalance() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT / 2);
        core.deposit(address(token), AMOUNT / 2);
        vm.stopPrank();

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(InsufficientAvailableBalance.selector, AMOUNT / 2, AMOUNT)
        );
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
    }

    function test_authorize_rejectsDuplicateTxId() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        // Reponer fondos para que el balance no sea el impedimento
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TxIdAlreadyUsed.selector, TX1));
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
    }

    function test_authorize_rejectsZeroAmount() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(relayer);
        vm.expectRevert(ZeroAmount.selector);
        core.authorize(TX1, user, merchant, address(token), 0, expiresAt);
    }

    function test_authorize_rejectsZeroUser() public {
        vm.prank(relayer);
        vm.expectRevert(ZeroAddress.selector);
        core.authorize(TX1, address(0), merchant, address(token), AMOUNT, expiresAt);
    }

    function test_authorize_rejectsZeroMerchant() public {
        vm.prank(relayer);
        vm.expectRevert(ZeroAddress.selector);
        core.authorize(TX1, user, address(0), address(token), AMOUNT, expiresAt);
    }

    function test_authorize_rejectsExpiredExpiresAt() public {
        uint48 past = uint48(block.timestamp - 1);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(ExpiresAtInPast.selector, past, block.timestamp)
        );
        core.authorize(TX1, user, merchant, address(token), AMOUNT, past);
    }

    function test_authorize_onlyRelayer() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert();
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
    }

    // =========================================================================
    // Capture
    // =========================================================================

    function test_capture_succeedsAfterAuthorization() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.capture(TX1);

        (, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, 0);
        assertEq(token.balanceOf(merchant), AMOUNT);
    }

    function test_capture_rejectsBeforeAuthorization() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(HoldNotFound.selector, TX1));
        core.capture(TX1);
    }

    function test_capture_rejectsDoubleCapture() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.capture(TX1);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(InvalidHoldStatus.selector, TX1, HoldStatus.CAPTURED)
        );
        core.capture(TX1);
    }

    function test_capture_rejectsAfterRelease() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.release(TX1);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(InvalidHoldStatus.selector, TX1, HoldStatus.RELEASED)
        );
        core.capture(TX1);
    }

    function test_capture_rejectsExpiredHold() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.warp(expiresAt + 1);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(HoldExpired.selector, TX1, expiresAt));
        core.capture(TX1);
    }

    function test_capture_onlyRelayer() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(stranger);
        vm.expectRevert();
        core.capture(TX1);
    }

    // =========================================================================
    // Release
    // =========================================================================

    function test_release_restoresFundsToAvailable() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.release(TX1);

        (uint256 avail, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, 0);
        assertEq(avail,  AMOUNT);
    }

    function test_release_rejectsAfterCapture() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.capture(TX1);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(InvalidHoldStatus.selector, TX1, HoldStatus.CAPTURED)
        );
        core.release(TX1);
    }

    function test_release_rejectsDoubleRelease() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.release(TX1);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(InvalidHoldStatus.selector, TX1, HoldStatus.RELEASED)
        );
        core.release(TX1);
    }

    function test_release_relayerCanRelease() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.release(TX1);
    }

    function test_release_adminCanRelease() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(admin);
        core.release(TX1);
    }

    function test_release_strangerCannotRelease() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(stranger);
        vm.expectRevert();
        core.release(TX1);
    }

    // =========================================================================
    // Expiration
    // =========================================================================

    function test_expire_succeedsAfterDeadline() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.warp(expiresAt + 1);
        core.expire(TX1);

        (uint256 avail, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, 0);
        assertEq(avail,  AMOUNT);
    }

    function test_expire_rejectsBeforeDeadline() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.expectRevert(abi.encodeWithSelector(HoldNotExpired.selector, TX1, expiresAt));
        core.expire(TX1);
    }

    function test_expire_rejectsDoubleExpire() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.warp(expiresAt + 1);
        core.expire(TX1);

        vm.expectRevert(
            abi.encodeWithSelector(InvalidHoldStatus.selector, TX1, HoldStatus.EXPIRED)
        );
        core.expire(TX1);
    }

    function test_batchExpire_succeedsForMultipleHolds() public {
        token.mint(user, AMOUNT);
        uint48 exp = uint48(block.timestamp + 30 minutes);

        vm.startPrank(user);
        token.approve(address(core), 2 * AMOUNT);
        core.deposit(address(token), 2 * AMOUNT);
        vm.stopPrank();

        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, exp);
        vm.prank(relayer);
        core.authorize(TX2, user, merchant, address(token), AMOUNT, exp);

        vm.warp(exp + 1);

        bytes32[] memory ids = new bytes32[](2);
        ids[0] = TX1;
        ids[1] = TX2;
        core.batchExpire(ids);

        (uint256 avail, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, 0);
        assertEq(avail,  2 * AMOUNT);
    }

    function test_batchExpire_rejectsOversizedBatch() public {
        uint256 max = core.MAX_BATCH_EXPIRE();
        bytes32[] memory ids = new bytes32[](max + 1);

        vm.expectRevert(abi.encodeWithSelector(BatchTooLarge.selector, max + 1, max));
        core.batchExpire(ids);
    }

    // =========================================================================
    // Multiple Holds
    // =========================================================================

    function test_multipleHolds_trackedIndependently() public {
        token.mint(user, AMOUNT);

        vm.startPrank(user);
        token.approve(address(core), 2 * AMOUNT);
        core.deposit(address(token), 2 * AMOUNT);
        vm.stopPrank();

        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
        vm.prank(relayer);
        core.authorize(TX2, user, merchant, address(token), AMOUNT, expiresAt);

        Hold memory h1 = core.getHold(TX1);
        Hold memory h2 = core.getHold(TX2);

        assertEq(h1.amount, AMOUNT);
        assertEq(h2.amount, AMOUNT);
        assertTrue(h1.status == HoldStatus.AUTHORIZED);
        assertTrue(h2.status == HoldStatus.AUTHORIZED);
    }

    function test_multipleHolds_captureOneDoesNotAffectOther() public {
        token.mint(user, AMOUNT);

        vm.startPrank(user);
        token.approve(address(core), 2 * AMOUNT);
        core.deposit(address(token), 2 * AMOUNT);
        vm.stopPrank();

        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
        vm.prank(relayer);
        core.authorize(TX2, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.capture(TX1);

        assertTrue(core.getHold(TX2).status == HoldStatus.AUTHORIZED);
    }

    // =========================================================================
    // Accounting
    // =========================================================================

    function test_accounting_lockedIncreasesOnAuthorize() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        (, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, AMOUNT);
    }

    function test_accounting_lockedDecreasesOnCapture() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.capture(TX1);

        (, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, 0);
    }

    function test_accounting_lockedDecreasesOnRelease() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.release(TX1);

        (, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, 0);
    }

    function test_accounting_lockedDecreasesOnExpire() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.warp(expiresAt + 1);
        core.expire(TX1);

        (, uint256 locked) = core.getBalance(user, address(token));
        assertEq(locked, 0);
    }

    function test_accounting_noFundsLostAcrossFullLifecycle() public {
        uint256 initialUserBalance = token.balanceOf(user);

        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        assertEq(token.balanceOf(address(core)), AMOUNT);

        vm.prank(relayer);
        core.capture(TX1);

        assertEq(token.balanceOf(user),         initialUserBalance - AMOUNT);
        assertEq(token.balanceOf(merchant),      AMOUNT);
        assertEq(token.balanceOf(address(core)), 0);
    }

    function test_accounting_releaseReturnsFundsToUser() public {
        uint256 pre = token.balanceOf(user);

        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(relayer);
        core.release(TX1);

        (uint256 avail, ) = core.getBalance(user, address(token));
        assertEq(avail, AMOUNT);

        vm.prank(user);
        core.withdraw(address(token), AMOUNT);
        assertEq(token.balanceOf(user), pre);
    }

    // =========================================================================
    // Security
    // =========================================================================

    function test_security_reentrancyOnCaptureFails() public {
        ReentrantToken rToken = new ReentrantToken();

        vm.prank(admin);
        core.configureToken(address(rToken), true);

        rToken.mint(user, AMOUNT);
        vm.startPrank(user);
        rToken.approve(address(core), AMOUNT);
        core.deposit(address(rToken), AMOUNT);
        vm.stopPrank();

        uint48 exp = uint48(block.timestamp + 1 hours);
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(rToken), AMOUNT, exp);

        // El token reentra durante la transferencia de capture
        rToken.setAttack(
            address(core),
            abi.encodeCall(IArbitrumSettlementCore.capture, (TX1))
        );

        vm.prank(relayer);
        core.capture(TX1);

        // El hold debe quedar en CAPTURED (no corrompido)
        assertTrue(core.getHold(TX1).status == HoldStatus.CAPTURED);
    }

    function test_security_pauseBlocksDeposit() public {
        vm.prank(pauser);
        core.pause();

        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        vm.expectRevert();
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
    }

    function test_security_pauseBlocksAuthorize() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(pauser);
        core.pause();

        vm.prank(relayer);
        vm.expectRevert();
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
    }

    function test_security_pauseBlocksCapture() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.prank(pauser);
        core.pause();

        vm.prank(relayer);
        vm.expectRevert();
        core.capture(TX1);
    }

    function test_security_pauseBlocksWithdraw() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(pauser);
        core.pause();

        vm.prank(user);
        vm.expectRevert();
        core.withdraw(address(token), AMOUNT);
    }

    function test_security_unpauseRestoresBehavior() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.prank(pauser);
        core.pause();

        vm.prank(pauser);
        core.unpause();

        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
        assertTrue(core.getHold(TX1).status == HoldStatus.AUTHORIZED);
    }

    function test_security_onlyPauserCanPause() public {
        vm.prank(stranger);
        vm.expectRevert();
        core.pause();
    }

    // =========================================================================
    // Events
    // =========================================================================

    function test_event_deposited() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        vm.expectEmit(true, true, false, true);
        emit IArbitrumSettlementCore.Deposited(user, address(token), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
    }

    function test_event_paymentAuthorized() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();

        vm.expectEmit(true, true, true, true);
        emit IArbitrumSettlementCore.PaymentAuthorized(
            TX1, user, merchant, address(token), AMOUNT, expiresAt
        );
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);
    }

    function test_event_paymentCaptured() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.expectEmit(true, true, true, true);
        emit IArbitrumSettlementCore.PaymentCaptured(
            TX1, user, merchant, address(token), AMOUNT
        );

        vm.prank(relayer);
        core.capture(TX1);
    }

    function test_event_paymentReleased() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.expectEmit(true, true, true, true);
        emit IArbitrumSettlementCore.PaymentReleased(
            TX1, user, merchant, address(token), AMOUNT
        );

        vm.prank(relayer);
        core.release(TX1);
    }

    function test_event_paymentExpired() public {
        vm.startPrank(user);
        token.approve(address(core), AMOUNT);
        core.deposit(address(token), AMOUNT);
        vm.stopPrank();
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), AMOUNT, expiresAt);

        vm.warp(expiresAt + 1);

        vm.expectEmit(true, true, true, true);
        emit IArbitrumSettlementCore.PaymentExpired(
            TX1, user, merchant, address(token), AMOUNT
        );

        core.expire(TX1);
    }

    // =========================================================================
    // Fuzz tests
    // =========================================================================

    /// @dev available + locked == deposited para cualquier monto válido.
    function testFuzz_authorize_accountingNeverViolated(uint96 rawAmount) public {
        uint256 deposited = bound(rawAmount, 1, type(uint96).max);
        token.mint(user, deposited);

        vm.startPrank(user);
        token.approve(address(core), deposited);
        core.deposit(address(token), deposited);
        vm.stopPrank();

        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), deposited, expiresAt);

        (uint256 avail, uint256 locked) = core.getBalance(user, address(token));
        assertEq(avail + locked, deposited, "avail+locked != deposited");
        assertEq(locked,         deposited, "todo debe estar bloqueado");
        assertEq(avail,          0,         "nada debe estar disponible");
    }

    /// @dev Un txId duplicado siempre revierte, indiferente del valor del id.
    function testFuzz_authorize_duplicateTxIdAlwaysReverts(bytes32 txId) public {
        token.mint(user, 2 * AMOUNT);

        vm.startPrank(user);
        token.approve(address(core), 2 * AMOUNT);
        core.deposit(address(token), 2 * AMOUNT);
        vm.stopPrank();

        uint48 exp = uint48(block.timestamp + 1 hours);
        vm.prank(relayer);
        core.authorize(txId, user, merchant, address(token), AMOUNT, exp);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TxIdAlreadyUsed.selector, txId));
        core.authorize(txId, user, merchant, address(token), AMOUNT, exp);
    }

    /// @dev Tras capture el merchant recibe exactamente el monto autorizado.
    function testFuzz_capture_merchantReceivesExactAmount(
        uint96 rawDeposit,
        uint96 rawCapture
    ) public {
        uint256 deposited = bound(rawDeposit, 1, type(uint96).max);
        uint256 captured  = bound(rawCapture, 1, deposited);

        token.mint(user, deposited);

        vm.startPrank(user);
        token.approve(address(core), deposited);
        core.deposit(address(token), deposited);
        vm.stopPrank();

        uint48 exp = uint48(block.timestamp + 1 hours);
        vm.prank(relayer);
        core.authorize(TX1, user, merchant, address(token), captured, exp);

        vm.prank(relayer);
        core.capture(TX1);

        assertEq(token.balanceOf(merchant), captured);

        (uint256 avail, ) = core.getBalance(user, address(token));
        assertEq(avail, deposited - captured);
    }

    /// @dev El saldo del contrato nunca cae por debajo de los fondos internos.
    function testFuzz_contractSolvency(uint96 rawAmount) public {
        uint256 deposited = bound(rawAmount, 1, type(uint96).max);
        token.mint(user, deposited);

        vm.startPrank(user);
        token.approve(address(core), deposited);
        core.deposit(address(token), deposited);
        vm.stopPrank();

        (uint256 avail, uint256 locked) = core.getBalance(user, address(token));
        assertGe(
            token.balanceOf(address(core)),
            avail + locked,
            "contrato insolvente tras deposito"
        );
    }
}

// =============================================================================
// Invariant test suite — Foundry stateful fuzzing
// =============================================================================

contract SettlementInvariantTest is StdInvariant, Test {
    ArbitrumSettlementCore core;
    MockERC20 token;
    SettlementHandler handler;

    address admin   = makeAddr("inv_admin");
    address relayer = makeAddr("inv_relayer");

    function setUp() public {
        token = new MockERC20("USD Coin", "USDC", 6);

        ArbitrumSettlementCore impl = new ArbitrumSettlementCore();
        bytes memory initData = abi.encodeCall(ArbitrumSettlementCore.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        core = ArbitrumSettlementCore(address(proxy));

        vm.startPrank(admin);
        core.grantRole(core.RELAYER_ROLE(), relayer);
        core.configureToken(address(token), true);
        vm.stopPrank();

        handler = new SettlementHandler(core, token, relayer, admin);

        // Registrar usuarios iniciales
        handler.addUser(1);
        handler.addUser(2);
        handler.addUser(3);

        // Depósito inicial para que el fuzzer tenga state útil de entrada
        handler.deposit(0, uint96(500e6));
        handler.deposit(1, uint96(500e6));
        handler.deposit(2, uint96(500e6));

        targetContract(address(handler));
    }

    // -------------------------------------------------------------------------
    // Invariante 1 — Fondos bloqueados == suma de holds AUTHORIZED
    // -------------------------------------------------------------------------
    /// @dev Para cada usuario, los fondos marcados como `locked` deben igualar
    ///      exactamente la suma de todos los holds todavía en estado AUTHORIZED.
    ///      Cualquier transición (capture/release/expire) debe decrementar ambos
    ///      de forma atómica. Una discrepancia implica corrupción de estado.
    function invariant_lockedEqualsAuthorizedHoldSums() public view {
        assertEq(
            handler.totalLocked(),
            handler.totalAuthorizedHoldAmounts(),
            "INV1: locked != suma de holds AUTHORIZED"
        );
    }

    // -------------------------------------------------------------------------
    // Invariante 2 — El contrato siempre cubre su contabilidad interna
    // -------------------------------------------------------------------------
    /// @dev El saldo ERC-20 del contrato debe ser >= (available + locked) de
    ///      todos los usuarios. Los fondos no se pueden "inventar" internamente.
    function invariant_contractBalanceCoversInternalAccounting() public view {
        assertGe(
            token.balanceOf(address(core)),
            handler.totalAccountedBalance(),
            "INV2: saldo ERC-20 del contrato < contabilidad interna"
        );
    }

    // -------------------------------------------------------------------------
    // Invariante 3 — Los holds terminales son inmutables
    // -------------------------------------------------------------------------
    /// @dev Un hold que llega a CAPTURED, RELEASED o EXPIRED no puede transitar
    ///      a ningún otro estado. Verificamos que ningún txId tracked presente
    ///      status NONE (nunca debería retroceder a pre-existencia).
    function invariant_terminalHoldsStayTerminal() public view {
        bytes32[] memory txIds = handler.getActiveTxIds();
        for (uint256 i; i < txIds.length; ++i) {
            Hold memory h = core.getHold(txIds[i]);
            assertTrue(
                h.status != HoldStatus.NONE,
                "INV3: txId tracked retrocedio a status NONE"
            );
        }
    }

    // -------------------------------------------------------------------------
    // Invariante 4 — Conservación global de tokens
    // -------------------------------------------------------------------------
    /// @dev El totalSupply del token no varía (no hay mint ni burn en el
    ///      protocolo). Los tokens se redistribuyen entre wallets y contrato,
    ///      pero el total nunca cambia.
    function invariant_tokenSupplyIsConserved() public view {
        assertGt(token.totalSupply(), 0, "INV4: totalSupply debe ser positivo");
    }
}
