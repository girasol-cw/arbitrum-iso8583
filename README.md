# Arbitrum Settlement Core

Experimental ISO 8583 mapping for onchain card authorization and settlement on Arbitrum.

---

## Milestone 1 — Contract stack deployment ✅

This repository contains the M1 implementation of the settlement core contract stack.

The milestone delivered a UUPS-upgradeable settlement contract deployed and validated on **Arbitrum Sepolia**, together with a React/TypeScript UI for manual and automated testing.

### What was built

- **`ArbitrumSettlementCore`** — UUPS upgradeable settlement contract implementing the full authorize → capture / release / expire lifecycle.
- **Role-based access control** — `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `TOKEN_ADMIN_ROLE`, `RELAYER_ROLE`.
- **ERC-20 token whitelisting** — configurable per-token with decimals handling.
- **Batch operations** — `batchExpire` for gas-efficient bulk settlement.
- **Test suite** — 82 / 82 tests passing (78 unit + fuzz, 4 invariant).
- **Dashboard UI** — operations panel with deposit, authorize, capture, release, expire, batch/burst flows, and a live benchmark tab.

### Token coverage

The proposal specified **USDC and USDT** support. Both are now live on Arbitrum Sepolia — mock USDC was part of the initial deploy; mock USDT was added in a follow-up transaction and is configured and active in the contract.

---

## Deployed Contracts

| Component | Address |
|---|---|
| Network | Arbitrum Sepolia (Chain ID `421614`) |
| Proxy *(use this for integrations)* | [`0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72`](https://sepolia.arbiscan.io/address/0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72) |
| Implementation | [`0x655d759764122E84B8cA0B156eE320B2D9Bd50B3`](https://sepolia.arbiscan.io/address/0x655d759764122E84B8cA0B156eE320B2D9Bd50B3) |
| Mock USDC | [`0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA`](https://sepolia.arbiscan.io/address/0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA) |
| Mock USDT | [`0xC7f974b3710560D070dEc95288339EfAB683C417`](https://sepolia.arbiscan.io/address/0xC7f974b3710560D070dEc95288339EfAB683C417) |
| Operator / Admin | `0x0C015C85340793854e7528943746447713e2C326` |

---

## Core Flows

| Flow | Description |
|---|---|
| `deposit` | User deposits whitelisted ERC-20 into the settlement pool |
| `withdraw` | User withdraws available balance |
| `authorize` | Relayer creates a hold for a card authorization |
| `capture` | Relayer settles the hold to the merchant |
| `release` | Relayer cancels the hold and returns funds to the user |
| `expire` | Anyone expires a past-deadline hold |
| `batchExpire` | Bulk expiry of multiple holds in a single tx |
| `pause / unpause` | Circuit-breaker controlled by `PAUSER_ROLE` |

---

## M2 Backlog (next)

- Multi-relayer testing with distinct signing keys
- Gas benchmarks vs. baseline for batch settlement paths
- Event indexing layer (The Graph subgraph or custom indexer)

---

## Reports & Source

- Full M1 technical report: [`TECHNICAL_MILESTONE_REPORT.md`](./TECHNICAL_MILESTONE_REPORT.md)
- Contract source: [`contracts/src/ArbitrumSettlementCore.sol`](./contracts/src/ArbitrumSettlementCore.sol)
- Test suite: [`contracts/test/ArbitrumSettlementCore.t.sol`](./contracts/test/ArbitrumSettlementCore.t.sol)
- UI: [`ui/`](./ui)
