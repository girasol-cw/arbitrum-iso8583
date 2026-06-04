# ISO 8583 → Arbitrum Middleware — Backend

Middleware that translates **ISO 8583** messages from the traditional payments stack into
calls to the **ArbitrumSettlementCore** contract deployed on Arbitrum Sepolia.

```
  ┌─────────────────┐        ISO 8583 JSON        ┌──────────────────────────┐
  │  Payments stack │  ──── POST /iso/intake ────▶ │       This backend       │
  └─────────────────┘                              │                          │
                                                   │  parse → route → submit  │
  ┌─────────────────┐        State / txId          │                          │
  │  UI / Dashboard │  ◀─── GET /payments/:id ───  │  SQLite  │  viem wallet  │
  └─────────────────┘                              └──────────┬───────────────┘
                                                              │ onchain
                                                    ┌─────────▼───────────────┐
                                                    │  ArbitrumSettlementCore │
                                                    │   (Arbitrum Sepolia)    │
                                                    └─────────────────────────┘
```

---

## File structure

```
src/
  config.ts                 Environment variables validated with Zod
  index.ts                  Entry point: DB → nonce → Express

  iso/
    fields.ts               Constants: MTI, field positions, currencies
    parser.ts               { mti, fields } → ParsedIsoFields
    router.ts               MTI → action (authorize / capture / release / heartbeat)

  mapping/
    txId.ts                 txId = keccak256(stan + rrn + merchant + terminal + date)
    normalizer.ts           Card token / merchant ref → Ethereum addresses
    contractMapper.ts       ParsedIsoFields → ContractCallParams (ABI typed)

  relayer/
    abi.ts                  Local contract ABI (subset: authorize, capture, release)
    wallet.ts               viem clients + local nonce management
    submitter.ts            Estimate gas → send tx → return txHash
    responseHandler.ts      Wait for receipt → read events → update DB

  db/
    schema.ts               SQLite DDL (CREATE TABLE payment_log)
    client.ts               Singleton better-sqlite3 + WAL mode + migrations
    paymentLog.ts           CRUD: createPaymentLog, updatePaymentStatus, isDuplicate...

  errors/
    classifier.ts           Any error → { code, isoResponseCode, message }

  observability/
    logger.ts               Pino with structured JSON
    metrics.ts              In-memory counters; exposed at GET /metrics as JSON

  routes/
    intake.ts               Main orchestrator: parse → dedupe → normalize → submit → receipt
    api.ts                  Express router: /iso/intake, /payments/:id, /metrics, /health

scripts/
  reconcile.ts              Compares onchain events vs payment_log → JSON report
```

---

## ISO 8583 message flow

```
POST /iso/intake  { mti: "0100", fields: { ... } }
         │
         ▼  parseIsoMessage()        Extracts STAN, RRN, amount, currency...
         ▼  routeIsoMessage()        MTI 0100 → action: "authorize"
         ▼  deriveTxId()             keccak256(stan+rrn+merchant+terminal+date)
         ▼  isDuplicate(txId)?       If exists → { status: "duplicate", code: "94" }
         ▼  normalize()              card token → userAddress, merchant → merchantAddress
         ▼  createPaymentLog()       status: "pending"
         ▼  buildAuthorizeCall()     ABI-typed args
         ▼  submitContractCall()     estimateGas → nextNonce → writeContract → txHash
         ▼  waitForReceipt()         Wait for confirmation (max 2 min), read events
         ▼  updatePaymentStatus()    status: "confirmed" / "failed"
         │
         ▼
    HTTP 200  { txId, status: "approved", isoResponseCode: "00", txHash }
```

---

## Smart contract

| Field | Value |
|---|---|
| Proxy (UUPS) | `0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72` |
| Network | Arbitrum Sepolia (chainId 421614) |
| USDC mock | `0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA` (6 decimals) |
| USDT mock | `0xC7f974b3710560D070dEc95288339EfAB683C417` (6 decimals) |

Used functions:
```solidity
authorize(bytes32 txId, address user, address merchant, address token, uint256 amount, uint256 expiresAt)
capture(bytes32 txId)
release(bytes32 txId)
```

The relayer wallet must hold the `RELAYER_ROLE` on the contract.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `RELAYER_PRIVATE_KEY` | ✅ | — | Private key of the wallet with RELAYER_ROLE |
| `PORT` | | 3100 | HTTP port |
| `RPC_URL` | | drpc Arbitrum Sepolia | JSON-RPC endpoint |
| `CONTRACT_ADDRESS` | | proxy on Sepolia | Contract address |
| `ALLOWED_TOKENS` | | USDC+USDT mocks | Allowed ERC-20 tokens (comma-separated) |
| `GAS_LIMIT` | | 500000 | Maximum gas per transaction |
| `HOLD_TTL_SECONDS` | | 3600 | Hold duration from authorization |
| `DB_PATH` | | `./data/middleware.db` | SQLite file path |
| `CARD_MAPPING_FILE` | | `./data/card-mapping.json` | JSON: token → address |
| `MERCHANT_MAPPING_FILE` | | `./data/merchant-mapping.json` | JSON: ref → address |

---

## Installation and usage

```bash
npm install
npm run dev            # development with hot-reload via tsx watch
npm run build          # compile TypeScript
npm test               # 39 tests (6 suites)

# Onchain vs DB reconciliation
npx tsx scripts/reconcile.ts [--from-block N] [--to-block N]
```

Minimal `.env` file:
```env
RELAYER_PRIVATE_KEY=0x<private_key_with_RELAYER_ROLE>
```

---

## HTTP API

### `POST /iso/intake`

```json
// Request
{ "mti": "0100", "fields": { "002": "CARD_TOKEN_001", "004": "000000001250", "011": "123456", "037": "RRN000000001", "042": "TERM001", "043": "MERCHANT001", "049": "840", ... } }

// Approved response
{ "txId": "0x3a766b...", "action": "authorize", "status": "approved", "isoResponseCode": "00", "txHash": "0xabc123...", "blockNumber": 42000000 }

// Declined response
{ "txId": "0x3a766b...", "action": "authorize", "status": "declined", "isoResponseCode": "51", "message": "InsufficientAvailableBalance" }
```

| MTI | Action |
|---|---|
| `0100` | `authorize` |
| `0200` field 28 = `28xxxx` | `authorize_and_capture` |
| `0200` field 28 = `00xxxx` | `capture` |
| `0400` | `release` (reversal) |
| `0800` | `heartbeat` — does not call the contract |

### `GET /payments/:txId` — Payment status
### `GET /payments?limit=50&offset=0` — Payment list
### `GET /metrics` — JSON counters
### `GET /health` — `{ "status": "ok", "uptime": N }`

---

## Error classification

| Contract error | code | ISO |
|---|---|---|
| `InsufficientAvailableBalance` | `INSUFFICIENT_FUNDS` | `51` |
| `TxIdAlreadyUsed` | `DUPLICATE_AUTHORIZATION` | `94` |
| `InvalidHoldStatus` | `INVALID_CAPTURE` | `40` |
| `HoldExpired` | `EXPIRED_HOLD` | `54` |
| `TokenNotAllowed` | `TOKEN_NOT_ALLOWED` | `57` |
| Low nonce | `NONCE_CONFLICT` | `96` |
| RPC error | `RPC_FAILURE` | `96` |
| Contract paused | `CONTRACT_PAUSED` | `91` |

---

## Architecture decisions

**viem over ethers.js** — ABI-typed API, native `bigint`, better tree-shaking.
TypeScript catches incorrect contract arguments at compile time.

**Native ESM** — viem and modern cryptographic packages only publish ESM.
Using them in CJS requires interop hacks; ESM eliminates that friction.

**Local nonce** — If two messages arrive simultaneously and both call
`getTransactionCount`, they get the same nonce and one fails. The local counter
guarantees unique nonces. It is synced from the chain at startup
(`blockTag: 'pending'`) and after any nonce error.

**Upfront gas estimation** — `estimateContractGas` simulates execution.
If the contract is going to revert (insufficient funds, duplicate txId, etc.),
we detect it without spending real gas on-chain. The +20% buffer covers
variance between estimation and execution.

**No automatic retry in MVP** — Retries with backoff require a persistent queue
and worker. For the MVP we prefer fast failure: if the tx fails, the ISO stack
can resend the message. In production, a `retry_queue` table and a worker
polling it every N seconds would be added.

**SQLite over Postgres** — No additional server required. Synchronous API of
`better-sqlite3` = no async/await in the data layer. WAL mode allows concurrent
reads without blocking writes. Migrating to Postgres only requires changing the client.

**In-memory counters over Prometheus** — `prom-client` adds a dependency
and a text format that requires an external scraper. For the MVP, JSON counters
are sufficient. The interface is compatible; migrating only means replacing `metrics.ts`.
