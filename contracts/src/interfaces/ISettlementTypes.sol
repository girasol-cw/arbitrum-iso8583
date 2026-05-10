// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

enum HoldStatus {
    NONE,
    AUTHORIZED,
    CAPTURED,
    RELEASED,
    EXPIRED
}

struct Hold {
    address user;
    address merchant;
    address token;
    uint256 amount;
    uint48 createdAt;
    uint48 expiresAt;
    HoldStatus status;
}

struct Balance {
    uint256 available;
    uint256 locked;
}

struct TokenConfig {
    bool allowed;
    uint8 decimals;
}

error ZeroAddress();
error ZeroAmount();
error TokenNotAllowed(address token);
error InsufficientAvailableBalance(uint256 available, uint256 required);
error TxIdAlreadyUsed(bytes32 txId);
error HoldNotFound(bytes32 txId);
error InvalidHoldStatus(bytes32 txId, HoldStatus current);
error HoldExpired(bytes32 txId, uint256 expiresAt);
error HoldNotExpired(bytes32 txId, uint256 expiresAt);
error ExpiresAtInPast(uint256 expiresAt, uint256 blockTimestamp);
error BatchTooLarge(uint256 provided, uint256 maxAllowed);
error FeeOnTransferToken(address token, uint256 expected, uint256 received);
