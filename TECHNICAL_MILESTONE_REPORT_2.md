# Technical Milestone Report — ISO 8583 Middleware (M2)

## 1. Milestone Summary

This milestone delivered the **ISO 8583 ↔ ArbitrumSettlementCore middleware** (M2): a production-architecture Node.js service that bridges a legacy payment ISO 8583 stack to on-chain settlement on Arbitrum Sepolia.

The system receives binary ISO 8583 messages over a raw TCP socket, decodes and routes them, resolves card/merchant identities from a PostgreSQL database, submits the corresponding contract calls via a managed relayer wallet, waits for on-chain receipts, and responds with a properly encoded ISO 8583 response message — all within a single synchronous TCP round-trip from the POS terminal's perspective.

---

## 2. System Architecture

### 2.1 Component Map

```
POS Terminal / UI Simulator
        │ raw binary ISO 8583 (TCP :5000)
        │ or WebSocket /ws/pos (dev only)
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    ISO 8583 Middleware                      │
│                                                             │
│  isoTcpServer ──► IsoFramer ──► decodeIso8583               │
│                                      │                      │
│                              processIsoMessage              │
│                         ┌────────────┴────────────┐         │
│                     parseIso          routeIso    │         │
│                         │                │        │         │
│                    deriveTxId      deduplicate    │         │
│                         │          (payment_log)  │         │
│                     normalize                     │         │
│                    (DB lookups)                   │         │
│                         │                         │         │
│                  contractMapper                   │         │
│                         │                         │         │
│                     submitter ──► viem ──► Arbitrum Sepolia │
│                         │                         │         │
│                  responseHandler                  │         │
│                         │                         │         │
│               buildIsoResponse                    │         │
│                         │                         │         │
│               ◄── socket.write ───────────────────┘         │
│                                                             │
│  Express HTTP :3100                                         │
│    POST /iso/intake    (HTTP alternative to TCP)            │
│    GET  /payments      (payment log query)                  │
│    GET  /payments/:id  (single payment)                     │
│    GET  /metrics       (in-memory counters)                 │
│    GET  /health                                             │
│    GET/PUT/DELETE /admin/cards                              │
│    GET/PUT/DELETE /admin/merchants                          │
│                                                             │
│  PostgreSQL (Drizzle ORM)                                   │
│    payment_log        card_mapping    merchant_mapping      │
│    reconciliation_run                                       │
└─────────────────────────────────────────────────────────────┘
        │ writeContract / estimateGas / waitForTransactionReceipt
        ▼
ArbitrumSettlementCore proxy  (0xAaE3...D72)  — Arbitrum Sepolia
```

### 2.2 Message Flow (authorize)

```
1. POS sends raw ISO 8583 0100 frame over TCP
2. IsoFramer reassembles the stream into a complete 2-byte-length-prefixed frame
3. decodeIso8583 decodes the bitmap + fields into { mti, fields }
4. parseIsoMessage validates required fields, converts amount/currency
5. routeIsoMessage maps MTI + processing code to action: authorize
6. deriveTxId builds deterministic bytes32 from STAN + RRN + merchantRef
7. Deduplication check against payment_log (UNIQUE tx_id)
8. normalize resolves card_token → userAddress (DB), merchantRef → merchantAddress (DB),
   currencyAlpha → tokenAddress (hardcoded registry), amount → wei
9. buildAuthorizeCall constructs the ABI-encoded call params
10. submitContractCall:
    a. estimateContractGas → if revert, decode custom error via full ABI,
       classify → ISO response code, return without broadcasting
    b. walletClient.writeContract (local nonce manager)
11. waitForTransactionReceipt (30s timeout, polling 2s)
12. Decode PaymentAuthorized event from receipt logs
13. updatePaymentLog (status=confirmed, txHash, blockNumber)
14. buildIsoApprovedResponse (MTI 0110, RC=00, mirrored STAN/RRN)
15. socket.write encoded response frame
```

### 2.3 Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 (ESM) |
| Language | TypeScript 5.5 |
| HTTP server | Express 4 |
| TCP framing | Custom `IsoFramer` (Node.js `net.Server`) |
| Blockchain client | viem 2.20 |
| ORM | Drizzle ORM 0.45 + postgres-js 3 |
| Database | PostgreSQL (Railway) |
| Observability | pino + pino-pretty; in-memory metrics counters |
| Test framework | Jest 29 (ESM via `--experimental-vm-modules`) |

---

## 3. Network & Contracts

| Item | Value |
|---|---|
| Network | Arbitrum Sepolia |
| Chain ID | `421614` |
| Settlement proxy | `0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72` |
| Implementation | `0x655d759764122E84B8cA0B156eE320B2D9Bd50B3` |
| Mock USDC | `0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA` |
| Mock USDT | `0xC7f974b3710560D070dEc95288339EfAB683C417` |
| Relayer / operator | `0x0C015C85340793854e7528943746447713e2C326` |

---

## 4. Database Schema

### `payment_log`
Primary audit table. Every ISO 8583 message processed writes a row, updated as the on-chain lifecycle progresses.

| Column | Type | Notes |
|---|---|---|
| `tx_id` | TEXT UNIQUE | Deterministic bytes32 derived from STAN+RRN+merchantRef |
| `mti` | TEXT | ISO message type (0100, 0200, 0400, 0800) |
| `stan` | TEXT | Systems Trace Audit Number |
| `rrn` | TEXT | Retrieval Reference Number |
| `action` | TEXT | authorize / capture / release / heartbeat |
| `status` | TEXT | pending → submitted → confirmed / failed / duplicate |
| `tx_hash` | TEXT | On-chain transaction hash |
| `block_number` | INTEGER | Confirmation block |
| `onchain_status` | TEXT | success / reverted |
| `revert_reason` | TEXT | Decoded custom error name |
| `retry_count` | INTEGER | Number of submission attempts |
| `error_code` | TEXT | `ErrorCode` from classifier (e.g. `INSUFFICIENT_FUNDS`) |
| `iso_raw` | TEXT | Full raw ISO message JSON for audit |

### `card_mapping`
Resolves ISO 8583 card tokens to Ethereum addresses.

| Column | Type | Notes |
|---|---|---|
| `card_token` | TEXT UNIQUE | PAN, token, or opaque card reference |
| `eth_address` | TEXT | Checksummed Ethereum address |
| `label` | TEXT | Human-readable name |
| `active` | BOOLEAN | Soft-delete flag |

### `merchant_mapping`
Resolves merchant reference codes to Ethereum addresses.

| Column | Type | Notes |
|---|---|---|
| `merchant_ref` | TEXT UNIQUE | Merchant reference from ISO field 042 |
| `eth_address` | TEXT | Checksummed Ethereum address |
| `label` | TEXT | Human-readable name |
| `active` | BOOLEAN | Soft-delete flag |

### `reconciliation_run`
Records of offline reconciliation sweeps comparing `payment_log` against on-chain events.

---

## 5. ISO 8583 Message Support

| MTI | Processing Code | Action | Contract call |
|---|---|---|---|
| `0100` | — | `authorize` | `authorize(txId, user, merchant, token, amount, expiresAt)` |
| `0200` | `00xxxx` | `capture` | `capture(txId)` |
| `0200` | `28xxxx` | `authorize_and_capture` | `authorize` then `capture` |
| `0400` | — | `release` | `release(txId)` |
| `0800` | — | `heartbeat` | No contract call; RC=00 echo |

### ISO Response Code Mapping

| `ErrorCode` | ISO RC | Meaning |
|---|---|---|
| `INSUFFICIENT_FUNDS` | `51` | Insufficient funds |
| `DUPLICATE_AUTHORIZATION` | `94` | Duplicate transmission |
| `INVALID_CAPTURE` | `58` | Transaction not permitted |
| `EXPIRED_HOLD` | `54` | Expired transaction |
| `HOLD_NOT_FOUND` | `25` | Record not found |
| `TOKEN_NOT_ALLOWED` | `57` | Token not permitted |
| `CONTRACT_PAUSED` | `91` | Switch inoperative |
| `RPC_FAILURE` | `96` | System malfunction |
| `NONCE_CONFLICT` | `96` | System malfunction |
| `UNKNOWN_CONTRACT_REVERT` | `05` | Do not honour |
| `UNKNOWN` | `05` | Do not honour |

---

## 6. Error Classification & ABI

### Custom Error Selectors (verified with viem `keccak256`)

| Selector | Error | ErrorCode |
|---|---|---|
| `0xadb9e043` | `InsufficientAvailableBalance(uint256,uint256)` | `INSUFFICIENT_FUNDS` |
| `0xf4e6a85a` | `TxIdAlreadyUsed(bytes32)` | `DUPLICATE_AUTHORIZATION` |
| `0x076675a9` | `InvalidHoldStatus(bytes32,uint8)` | `INVALID_CAPTURE` |
| `0x2e27244b` | `HoldExpired(bytes32,uint256)` | `EXPIRED_HOLD` |
| `0xc6cef671` | `HoldNotExpired(bytes32,uint256)` | `HOLD_NOT_EXPIRED` |
| `0xe3882155` | `HoldNotFound(bytes32)` | `HOLD_NOT_FOUND` |
| `0x94403b70` | `TokenNotAllowed(address)` | `TOKEN_NOT_ALLOWED` |
| `0x825ab413` | `FeeOnTransferToken(address,uint256,uint256)` | `UNKNOWN_CONTRACT_REVERT` |
| `0xd92e233d` | `ZeroAddress()` | `UNKNOWN_CONTRACT_REVERT` |
| `0x1f2a2005` | `ZeroAmount()` | `UNKNOWN_CONTRACT_REVERT` |
| `0x9eda8fcc` | `ExpiresAtInPast(uint256,uint256)` | `UNKNOWN_CONTRACT_REVERT` |
| `0xbb1cb70b` | `BatchTooLarge(uint256,uint256)` | `UNKNOWN_CONTRACT_REVERT` |

`SETTLEMENT_ABI` in `backend/src/relayer/abi.ts` contains the full compiled ABI including all custom error definitions, enabling viem to automatically decode revert reasons before the classifier runs.

---

## 7. Test Suite

### Summary

| Status | Test Suites | Tests |
|---|---|---|
| **Passed** | **10 / 10** | **68 / 68** |
| Failed | 0 / 10 | 0 / 68 |

Verified with:

```bash
cd backend
npm test -- --no-coverage
```

### Passing Suites (68 tests)

| Suite | Tests | Coverage |
|---|---|---|
| `test/mapping/contractMapper.test.ts` | 3 | ABI call param construction for authorize/capture/release |
| `test/errors/classifier.test.ts` | 5 | Nonce, RPC, paused, unknown, non-Error classification |
| `test/iso/router.test.ts` | 6 | MTI+proc code routing table |
| `test/mapping/txId.test.ts` | 7 | TxId determinism, field sensitivity, reversal derivation |
| `test/iso/parser.test.ts` | 6 | Field validation, amount conversion, currency passthrough |
| `test/tcp/framing.test.ts` | 7 | IsoFramer stream reassembly, split chunks, byte-by-byte delivery, error handling |
| `test/iso/codec.test.ts` | 10 | Binary encode/decode roundtrip, bitmap, LLVAR, length header |
| `test/tcp/isoTcpServer.test.ts` | 7 | TCP server: approve/decline/heartbeat/framing/dedup responses |
| `test/integration/intake.test.ts` | 10 | Authorize, capture, release, heartbeat, declined, pending, bad input |
| `test/db/paymentLog.test.ts` | 7 | PostgreSQL-backed payment log insert, duplicate detection, update, list pagination |

---

## 8. Test Wallet Funding (On-chain)

A deterministic set of 4 test wallets was established using the following test mnemonic and funded on Arbitrum Sepolia to enable end-to-end authorize flows.

**Test mnemonic and deployer key (Arbitrum Sepolia / devnet only):**

```bash
MNEMONIC="bamboo scout soldier devote tooth ugly foot drive lamp upset arrange grape"
DEPLOYER_PK=0xe0ed30d19c1b930f70c6ebb1924f9343387c3b5d6ce5a17060fe548088cbed3b
DEPLOYER_ADDRESS=0x0C015C85340793854e7528943746447713e2C326
```

The deployer/relayer address derived from `DEPLOYER_PK` has `RELAYER_ROLE` in the contract.

**Derived wallets (BIP-44 `m/44'/60'/0'/0/i`):**

| Card Token | Address | Index |
|---|---|---|
| `TOK_TEST_001` | `0x5f7215df3fbd70DDbb68CeC0dC0a23E4Ab77b562` | 0 |
| `TOK_TEST_002` | `0xC480FF6Dc39Eb77D35F96CaA281EF08EBcB63C94` | 1 |
| `TOK_TEST_003` | `0x9b96854113FEfc8405f553d6323c150237C5280d` | 2 |
| `TOK_TEST_004` | `0x82225D7FB76b961F03B063fDB5B25BEE891e50B3` | 3 |

Each wallet has **1,000 USDC + 1,000 USDT deposited** in the `ArbitrumSettlementCore` contract, available for `authorize` calls.

### Funding Transactions (Arbitrum Sepolia)

#### `FundUsersMint.s.sol` — deployer seeds ETH and mints tokens

| Action | Tx Hash | Explorer |
|---|---|---|
| ETH seed → `TOK_TEST_004` | `0xfef499629f17307e83c9b1aef223164b41ada24f28476e43848425d12ce10847` | [View](https://sepolia.arbiscan.io/tx/0xfef499629f17307e83c9b1aef223164b41ada24f28476e43848425d12ce10847) |
| Mint USDC → `TOK_TEST_004` | `0x1ab146aa5540427b010f1b83c0a6bd396cee266030cc5c008ef4811c6481959b` | [View](https://sepolia.arbiscan.io/tx/0x1ab146aa5540427b010f1b83c0a6bd396cee266030cc5c008ef4811c6481959b) |
| Mint USDT → `TOK_TEST_004` | `0x5f09b79a83437f50e1ad8047fe85063f6e1821978f69b97d3299f8926c521447` | [View](https://sepolia.arbiscan.io/tx/0x5f09b79a83437f50e1ad8047fe85063f6e1821978f69b97d3299f8926c521447) |

#### `DepositUsers.s.sol` — wallets approve + deposit into contract

| Action | Tx Hash | Explorer |
|---|---|---|
| Approve USDC (user 1) | `0x74c2aec22e0557946acfa82d49a7b130a5763f5e68c43d1161716562bbddb897` | [View](https://sepolia.arbiscan.io/tx/0x74c2aec22e0557946acfa82d49a7b130a5763f5e68c43d1161716562bbddb897) |
| Deposit USDC (user 1) | `0x7f59ebc40a077622cc750ecfc40bd1bb9c6660ba61a58355fdc7ad0375a7c8f4` | [View](https://sepolia.arbiscan.io/tx/0x7f59ebc40a077622cc750ecfc40bd1bb9c6660ba61a58355fdc7ad0375a7c8f4) |
| Approve USDC (user 2) | `0x7d27be2f26349084cbebc6228fcf47abca8b37959eb3f05fa82da37366be37e2` | [View](https://sepolia.arbiscan.io/tx/0x7d27be2f26349084cbebc6228fcf47abca8b37959eb3f05fa82da37366be37e2) |
| Deposit USDC (user 2) | `0xe1b89cad4526e14c2c819eaea41350972f5eab64317be8d60e5e216e287842ae` | [View](https://sepolia.arbiscan.io/tx/0xe1b89cad4526e14c2c819eaea41350972f5eab64317be8d60e5e216e287842ae) |
| Approve USDC (user 3) | `0x09f7138633118b7736f19460846b2a37d00dd32aba2591f1b48bc8f6848abed8` | [View](https://sepolia.arbiscan.io/tx/0x09f7138633118b7736f19460846b2a37d00dd32aba2591f1b48bc8f6848abed8) |
| Deposit USDC (user 3) | `0x77662ed23d6f831d94964f8ab0d95930dbc7292019aa10dc5befcc8815f1c3e4` | [View](https://sepolia.arbiscan.io/tx/0x77662ed23d6f831d94964f8ab0d95930dbc7292019aa10dc5befcc8815f1c3e4) |

---

## 9. Foundry Scripts

| Script | Purpose | Signer(s) |
|---|---|---|
| `script/FundUsersMint.s.sol` | Seed ETH + mint USDC/USDT to test wallets. Idempotent. | Deployer only (1 signer) |
| `script/DepositUsers.s.sol` | Approve + deposit into contract for each test wallet. Idempotent. | 4 derived wallets (1 `startBroadcast` per wallet) |

**Why two scripts:** Forge resolves all nonces for a given signer at script startup. A single script with the deployer + 4 user wallets in multiple `startBroadcast` blocks caused nonce collisions on Arbitrum Sepolia's RPC even with `--slow`. Separating deployer operations (one broadcast block) from user operations (independent accounts) eliminates the conflict.

---

## 10. HTTP API Reference

### `POST /iso/intake`
Accepts a JSON-encoded ISO 8583 message. Primary integration point for non-TCP clients.

**Request:**
```json
{ "mti": "0100", "fields": { "002": "TOK_TEST_001", "003": "000000", "004": "000000042000", "007": "0616200848", "011": "000001", "037": "000000000001", "042": "MERCHANT001", "049": "840" } }
```

**Response:**
```json
{ "txId": "0x...", "action": "authorize", "status": "approved", "isoResponseCode": "00", "txHash": "0x...", "blockNumber": 12345678 }
```

### `GET /payments?limit=20&offset=0`
Paginated payment log. Returns full `payment_log` rows ordered by `created_at DESC`.

### `GET /payments/:txId`
Single payment by deterministic `tx_id`.

### `GET /metrics`
In-memory counters: `iso_messages_received`, `iso_messages_routed`, `iso_duplicates`, `tx_submitted`, `tx_confirmed`, `error_classified`.

### `GET /health`
Liveness probe. Returns `{ "status": "ok", "ts": "..." }`.

### `GET /admin/cards` / `PUT /admin/cards/:token` / `DELETE /admin/cards/:token`
Manage `card_mapping` table entries. `PUT` upserts a card token → ETH address binding; `DELETE` soft-deactivates it.

### `GET /admin/merchants` / `PUT /admin/merchants/:ref` / `DELETE /admin/merchants/:ref`
Manage `merchant_mapping` table entries. `PUT` upserts a merchant ref → ETH address binding; `DELETE` soft-deactivates it.

---

## 11. Development Tools

### POS Terminal Simulator (UI)
A browser-based POS terminal emulator in `ui/src/components/PosTerminalPanel.tsx` that connects via WebSocket (`/ws/pos`) to a bridge (`posSimBridge.ts`) which forwards binary ISO 8583 frames over a loopback TCP connection to `isoTcpServer`. The binary codec (`ui/src/lib/posCodec.ts`) is byte-identical to `backend/src/iso/codec.ts`.

Available flows: `0100 authorize`, `0200 capture`, `0200 single purchase`, `0400 reversal`, `0800 heartbeat`.

### Reconciliation Script
`backend/scripts/reconcile.ts` — the validation script compares middleware payment logs (`payment_log` table) against Arbitrum onchain events (`PaymentAuthorized` / `PaymentCaptured` / `PaymentReleased`). Writes a JSON report and inserts a `reconciliation_run` row.

### Seed Script
`backend/scripts/seed-card-mapping.ts` — upserts `contracts/script/output/funded-wallets.json` (produced by `FundUsersMint.s.sol`) into `card_mapping`. Falls back to `backend/src/config/testWallets.ts` if the JSON is absent.

---

## 12. Explicit Limitations

1. **No partial/incremental capture** — inherited from M1 contract scope.

2. **Single relayer, no queue** — submission is synchronous. If the relayer wallet runs out of ETH or has a nonce conflict, the request declines. A persistent retry queue (DB-backed) is explicitly deferred.

3. **Currency → token mapping is hardcoded** — `USD`/`USDC` maps to the mock USDC address, `USDT` to the mock USDT address. Dynamic token registry is a future enhancement.

4. **Mock assets only** — all tokens are `MockERC20` instances with open `mint()`. Not suitable for mainnet.

5. **Centralised roles** — deployer address holds all roles (`DEFAULT_ADMIN`, `PAUSER`, `TOKEN_ADMIN`, `RELAYER`). Role separation is deferred to a later milestone.

---

## 13. Evidence Sources

| Artifact | Path |
|---|---|
| Middleware entry point | `backend/src/index.ts` |
| TCP server | `backend/src/tcp/isoTcpServer.ts` |
| Intake orchestrator | `backend/src/routes/intake.ts` |
| Contract submitter | `backend/src/relayer/submitter.ts` |
| Full ABI (with custom errors) | `backend/src/relayer/abi.ts` |
| Error classifier | `backend/src/errors/classifier.ts` |
| DB schema + DDL | `backend/src/db/schema.ts` |
| Card/merchant mapping CRUD | `backend/src/db/mappings.ts` |
| Test wallets config | `backend/src/config/testWallets.ts` |
| Funding script (mint) | `contracts/script/FundUsersMint.s.sol` |
| Funding script (deposit) | `contracts/script/DepositUsers.s.sol` |
| Funding broadcast artifacts | `contracts/broadcast/FundUsersMint.s.sol/421614/` |
| Deposit broadcast artifacts | `contracts/broadcast/DepositUsers.s.sol/421614/` |
| Test suite | `backend/test/` |
