# Technical Milestone Report — ArbitrumSettlementCore

## 1. Milestone Summary

This milestone delivered the deployment and validation of the `ArbitrumSettlementCore` payment-settlement contract stack on **Arbitrum Sepolia**.
The deployment uses a **UUPS upgradeable architecture**, with a standalone implementation contract and an `ERC1967Proxy` as the canonical integration endpoint.

## 2. Deployed Contract

| Item | Value |
|---|---|
| Product | `ArbitrumSettlementCore` |
| Architecture | UUPS upgradeable |
| Canonical contract for integrations | `Proxy` |
| Implementation contract | `0x655d759764122E84B8cA0B156eE320B2D9Bd50B3` |
| Proxy contract | `0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72` |

## 3. Network

| Item | Value |
|---|---|
| Network | Arbitrum Sepolia |
| Chain ID | `421614` |
| Environment type | Testnet |

## 4. Addresses

| Component | Address |
|---|---|
| Implementation | `0x655d759764122E84B8cA0B156eE320B2D9Bd50B3` |
| Proxy | `0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72` |
| Configured token (`USDC` mock) | `0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA` |
| Configured token (`USDT` mock) | `0xC7f974b3710560D070dEc95288339EfAB683C417` |
| Operator / Admin wallet | `0x0C015C85340793854e7528943746447713e2C326` |

## 5. Roles

At deployment time, the same operator address was assigned all active privileged roles.

| Role | Assigned Address |
|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x0C015C85340793854e7528943746447713e2C326` |
| `PAUSER_ROLE` | `0x0C015C85340793854e7528943746447713e2C326` |
| `TOKEN_ADMIN_ROLE` | `0x0C015C85340793854e7528943746447713e2C326` |
| `RELAYER_ROLE` | `0x0C015C85340793854e7528943746447713e2C326` |

## 6. Tokens Configured

| Token | Address | Type | Decimals | Status | Notes |
|---|---|---|---|---|---|
| `USDC` | `0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA` | Mock ERC-20 | `6` | Enabled | Initial deployment |
| `USDT` | `0xC7f974b3710560D070dEc95288339EfAB683C417` | Mock ERC-20 | `6` | Enabled | Added via `DeployUSDT.s.sol` |

### Initial token mint
- `100,000 USDC` (mock) minted to: `0x0C015C85340793854e7528943746447713e2C326`
- `100,000 USDT` (mock) minted to: `0x0C015C85340793854e7528943746447713e2C326`

## 7. Flows Tested

The contract behavior was validated through both automated Foundry tests and manual on-chain execution on Arbitrum Sepolia.

### Validation result
- **82 / 82 tests passed**
- Breakdown:
  - **78 unit/fuzz tests passed**
  - **4 invariant tests passed**
- Failure count: **0**

### Tested functional flows
- Deployment and initialization
- Role assignment and access control
- Token configuration / whitelisting
- Deposit flow
- Withdraw flow
- Authorization flow
- Capture flow
- Release flow
- Expire flow
- Batch expire flow
- Pause / unpause behavior
- Multiple holds and accounting flows
- Event emission validation

### Manual on-chain flow evidence

| Flow | Tx Hash | Explorer |
|---|---|---|
| Deposit | `0x6d1cf089f19412febb47b4f573502fb5291f8cc3a8f9a2bab0efe299cace4cd7` | [View](https://sepolia.arbiscan.io/tx/0x6d1cf089f19412febb47b4f573502fb5291f8cc3a8f9a2bab0efe299cace4cd7) |
| Withdraw | `0x9b429fd18e11bef0935ac7cb802fb64b0b9c1f37393095bbcc05c31f44879f36` | [View](https://sepolia.arbiscan.io/tx/0x9b429fd18e11bef0935ac7cb802fb64b0b9c1f37393095bbcc05c31f44879f36) |
| Authorize | `0xef6fc42bc40a38cf9de843f7ce2442c007138f7ee3b6e50d2c94147f2e3daa60` | [View](https://sepolia.arbiscan.io/tx/0xef6fc42bc40a38cf9de843f7ce2442c007138f7ee3b6e50d2c94147f2e3daa60) |
| Capture | `0xf42aba0d19d29db79fc78edbed98c97616da52691c5f92344cb1451ea21f79af` | [View](https://sepolia.arbiscan.io/tx/0xf42aba0d19d29db79fc78edbed98c97616da52691c5f92344cb1451ea21f79af) |
| Release | `0xbfd29314b8d479990e93d1c2e43463957dbddb212cd5799f2b149e8674d8637f` | [View](https://sepolia.arbiscan.io/tx/0xbfd29314b8d479990e93d1c2e43463957dbddb212cd5799f2b149e8674d8637f) |
| Expire | `0x13f03a3d3a212ad1d619d816860e1e001df2270b6c88f1deb63d5726a912834b` | [View](https://sepolia.arbiscan.io/tx/0x13f03a3d3a212ad1d619d816860e1e001df2270b6c88f1deb63d5726a912834b) |
| Pause | `0x98eb36bff2ee04056d85105581094602e2c55c3c76c2d1ef18e530e2d0a34134` | [View](https://sepolia.arbiscan.io/tx/0x98eb36bff2ee04056d85105581094602e2c55c3c76c2d1ef18e530e2d0a34134) |
| Unpause | `0x90ae58d22fb3740bcc35c1b4d8a30f9171636500f33d35410ee4184b2a94307f` | [View](https://sepolia.arbiscan.io/tx/0x90ae58d22fb3740bcc35c1b4d8a30f9171636500f33d35410ee4184b2a94307f) |
| Configure Token | `0x42b2cd9a9f4a3d9eaff3db7225baa2fc632dfc453056b199413e6da99db3d65c` | [View](https://sepolia.arbiscan.io/tx/0x42b2cd9a9f4a3d9eaff3db7225baa2fc632dfc453056b199413e6da99db3d65c) |

## 8. Screenshots / Transaction Hashes

### Screenshots
- No screenshots were attached to this milestone package.
- Transaction hashes and broadcast artifacts are used as the primary execution evidence.

### Deployment / configuration transactions

| Action | Tx Hash | Explorer |
|---|---|---|
| Deploy mock `USDC` | `0xde411a3c6d63809fd1ce76212afba65f113a9b4917011140fc754f2d91d92d1f` | [View](https://sepolia.arbiscan.io/tx/0xde411a3c6d63809fd1ce76212afba65f113a9b4917011140fc754f2d91d92d1f) |
| Deploy `ArbitrumSettlementCore` implementation | `0xd4124335fce8e153c48e5e48cc85f5980a9f76f86272b369a99598fe5dbadaa7` | [View](https://sepolia.arbiscan.io/tx/0xd4124335fce8e153c48e5e48cc85f5980a9f76f86272b369a99598fe5dbadaa7) |
| Deploy `ERC1967Proxy` | `0x50e82cad349e24936c6cc36f65422c3da49aaaf35d35e1096ca292b472dc4b84` | [View](https://sepolia.arbiscan.io/tx/0x50e82cad349e24936c6cc36f65422c3da49aaaf35d35e1096ca292b472dc4b84) |
| Grant `RELAYER_ROLE` | `0xb3ad11f24b6b28ac7333a97608f772e6af5601d97fea4bacbe045415338677c1` | [View](https://sepolia.arbiscan.io/tx/0xb3ad11f24b6b28ac7333a97608f772e6af5601d97fea4bacbe045415338677c1) |
| Configure initial `USDC` token | `0x5cc14d62c60bc1ad27020fe4826046e21912c74f71f2dd87a9c92bb0d680e9d6` | [View](https://sepolia.arbiscan.io/tx/0x5cc14d62c60bc1ad27020fe4826046e21912c74f71f2dd87a9c92bb0d680e9d6) |
| Mint initial `USDC` test balance | `0x14ded91beaeacfdc7fe3807c44d1583c078bba77e31bb60c86ec595c133019d0` | [View](https://sepolia.arbiscan.io/tx/0x14ded91beaeacfdc7fe3807c44d1583c078bba77e31bb60c86ec595c133019d0) |

## 9. Explicit Limitations

The following limitations are explicit for this milestone and should be treated as known scope boundaries:

1. **Testnet-only deployment**
   - This milestone was deployed on **Arbitrum Sepolia**, not mainnet.

2. **No partial capture**
   - Captures are full-amount only.

3. **No incremental capture**
   - A hold cannot be captured in multiple steps.

4. **No overcapture / tip adjustment**
   - Captured amount is fixed at authorization time.

5. **No refunds or reversals**
   - Once captured, funds are transferred to the merchant and there is no refund flow in this milestone.

6. **Off-chain controls remain external**
   - KYC, AML, fraud checks, per-user/merchant limits, and velocity controls are **not enforced on-chain** and must be handled by the relayer/backend.

## 10. Recommended Operational Interpretation

- The milestone is **technically deployed and validated**.
- The **proxy contract** should be treated as the live contract address for client and backend integration.
- The current deployment is appropriate for:
  - integration testing,
  - QA,
  - relayer/backend wiring,
  - milestone demonstration,
  - and end-to-end validation on testnet.
- The current deployment is **not yet production-final** due to:
  - mock asset usage,
  - centralized roles,
  - and intentionally limited settlement scope.

## 11. Evidence Sources

- Deployment script: `contracts/script/Deploy.s.sol`
- Deployment broadcast artifact: `contracts/broadcast/Deploy.s.sol/421614/run-latest.json`
- Contract implementation: `contracts/src/ArbitrumSettlementCore.sol`
- Test suite: `contracts/test/ArbitrumSettlementCore.t.sol`
- Design / scope notes: `contracts/docs/DESIGN.md`
