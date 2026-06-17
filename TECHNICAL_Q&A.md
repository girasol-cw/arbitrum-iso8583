# Technical Q&A — Arbitrum Settlement Core PoC

> Date: 2026-06-09
> Version: PoC v1

---

## Smart Contracts

### Does the balance model separate available and locked explicitly, or is it derived implicitly?

Explicitly. The contract maintains two separate mappings:

```solidity
mapping(address => uint256) public availableBalance;
mapping(address => uint256) public lockedBalance;
```

`availableBalance` is what the user can spend. `lockedBalance` is the sum of all active holds. Total balance is `available + locked`.

---

### How do you guarantee a capture is not executed more than once for the same txId?

The contract uses a per-txId state enum:

```solidity
enum AuthStatus { None, Authorized, Captured, Released, Expired }
mapping(bytes32 => AuthStatus) public authStatus;
```

`capture(txId)` has the guard:

```solidity
require(authStatus[txId] == AuthStatus.Authorized, "not authorized");
authStatus[txId] = AuthStatus.Captured;
```

The transition is atomic in EVM. A second `capture` with the same `txId` will revert with `"not authorized"` because the state is already `Captured`.

---

### Is txId globally unique, or only unique per user/account?

**Globally unique**. It is derived as:

```ts
keccak256(encodePacked(stan, rrn, merchantRef, terminalId, localDate))
```

The ISO fields `STAN + RRN + merchantRef + terminalId + localDate` uniquely identify a transaction in the payment network. The resulting hash is the key in the global `authStatus` mapping.

---

### Do authorization holds expire automatically, or are they only released manually?

In the current PoC implementation: **manually only** via `release(txId)`. There is no onchain automatic expiry mechanism because EVM has no native scheduler.

The middleware is responsible for calling `release` when it detects a hold has exceeded the configured `holdExpirySeconds`. The reconciler detects expired holds and reports them.

> **Known limitation**: if the middleware fails, funds remain locked until manual intervention or until the reconciler triggers the release.

---

### What happens if a capture arrives after the hold has expired?

Depends on whether the contract has already executed the release:

| Hold state | Capture result |
|---|---|
| `Authorized` (not yet expired) | Successful capture |
| `Released` (expired and released) | Revert: `"not authorized"` |
| `None` (never existed) | Revert: `"not authorized"` |

The middleware classifies the revert as `EXPIRED_HOLD` and returns ISO response code `'61'`.

---

### Are token decimals (USDC vs USDT) handled explicitly?

The contract operates in **base token units**. The middleware is responsible for the conversion:

```ts
// parser.ts
const amountDecimal = (parseInt(f('004')) / 100).toFixed(2)
const amountOnchain = parseUnits(amountDecimal, tokenDecimals) // 6 for USDC/USDT
```

The PoC assumes a single settlement token configured in `SETTLEMENT_TOKEN_ADDRESS`. Multi-token support would require a `tokenAddress -> balances` mapping in the contract.

---

### Can a user have multiple concurrent authorizations?

Yes. The contract does not limit the number of active holds per user. Each `txId` is independent. The available balance is reduced with each `authorize`:

```solidity
availableBalance[user] -= amount;
lockedBalance[user] += amount;
```

As long as `availableBalance[user] >= amount`, the authorization proceeds.

---

### Are overflow/underflow and accounting edge cases handled explicitly?

Yes. Solidity >= 0.8.x has built-in overflow/underflow protection (panic `0x11`). Additionally the contract has explicit guards:

```solidity
require(availableBalance[user] >= amount, "insufficient funds");
require(lockedBalance[user] >= amount, "accounting error");
```

The second guard protects against state inconsistencies that should not occur but are defensively checked.

---

## Middleware

### What exact subset of ISO 8583 does this PoC support?

**Supported MTIs:**

| MTI | Description |
|---|---|
| `0100` | Authorization Request |
| `0200` | Financial/Capture Request |
| `0110` | Authorization Response (outbound) |
| `0210` | Financial Response (outbound) |

**Supported fields:**

| Field | Name |
|---|---|
| `002` | PAN / card token |
| `003` | Processing code |
| `004` | Amount |
| `011` | STAN |
| `037` | RRN |
| `042` | Terminal ID / Merchant ID |
| `043` | Merchant name |
| `049` | Currency code |
| `039` | Response code (responses only) |

Everything else returns response code `'12'` (invalid transaction).

---

### How is the deterministic txId built?

```ts
// src/mapping/txId.ts
export function deriveTxId(fields: ParsedIsoFields): `0x${string}` {
  return keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string', 'string'],
      [fields.stan, fields.rrn, fields.merchantRef, fields.terminalId, fields.localDate]
    )
  )
}
```

`localDate` is ISO field `013` (MMDD). The combination `STAN + RRN + merchantRef + terminalId + date` is sufficiently unique in real payment networks for the PoC.

---

### What idempotency strategy is used?

**Three layers:**

1. **DB constraint**: `tx_id` column with `UNIQUE` on `payment_log`. A second insert with the same `tx_id` fails at the PostgreSQL level before touching the network.
2. **Prior lookup**: `isDuplicate(txId)` queries the log before any operation. If it exists with state `submitted` or `confirmed`, the previous result is returned directly.
3. **Onchain**: the contract itself rejects a second `authorize` or `capture` with the same `txId`.

---

### How are retries handled on RPC or submission failure?

```ts
// src/relayer/submitter.ts
try {
  hash = await walletClient.writeContract(...)
} catch (err) {
  if (isNonceConflict(err)) {
    await syncNonce()
    hash = await walletClient.writeContract(...)  // single retry
  } else {
    throw err  // classified as RPC_FAILURE -> ISO '96'
  }
}
```

The current policy is **one retry** on nonce conflict. Permanent RPC failures are classified and a decline is returned to the POS. The reconciler detects transactions in `pending` state for manual retry.

---

### How is out-of-order delivery handled (capture before authorize)?

The contract will reject the `capture` with `"not authorized"` (state `None`). The middleware:

1. Classifies the revert as `INVALID_CAPTURE`
2. Persists the attempt in the log with state `failed`
3. Returns ISO response code `'25'` (unable to locate record)

There is no waiting queue to retry the capture once the authorize arrives. In production this would require a retry mechanism with backoff.

---

### How is an authorization correlated with its capture?

By `txId`. The `txId` is derived from **the same ISO fields** in both messages:

```
STAN + RRN + merchantRef + terminalId + localDate
```

The payment system sending the `0200` must include the same values in those fields as the original `0100`. This is standard behavior in ISO 8583 networks.

---

### What happens if the tx is submitted onchain but the middleware does not receive confirmation?

```ts
// src/relayer/responseHandler.ts
const receipt = await publicClient.waitForTransactionReceipt({
  hash,
  timeout: CONFIRMATION_TIMEOUT_MS  // configurable, default 30s
})
```

If the timeout expires:

1. The state in DB remains `submitted` (not `confirmed`)
2. A decline is returned to the POS (conservative response)
3. The reconciler detects the `tx_hash` with state `submitted` and checks onchain whether it confirmed

---

### Are logs persisted for reconciliation, or only in memory?

**Persisted in PostgreSQL**. Each processed ISO message generates a row in `payment_log` with:

```
tx_id, mti, stan, rrn, merchant_ref, terminal_id,
amount, currency, action, tx_hash, onchain_status,
revert_reason, iso_response_code, iso_raw (JSON),
created_at, updated_at
```

The connection is configured via `DATABASE_URL` (e.g. `postgresql://user:pass@host:5432/middleware`).

---

## Latency

### Is the <200ms target middleware time or onchain confirmation time?

**Middleware time** (internal processing). Onchain confirmation on Arbitrum One takes between 200ms and 2s depending on congestion.

```
ISO message received
    | <50ms   parse + normalize + DB write + submit tx
TX submitted (hash available)
    | <2s     waitForReceipt (Arbitrum)
ISO response sent to POS
```

The POS waits for the full response, so the perceived latency includes onchain confirmation.

---

### Is the POS response sent before or after submitting the tx?

**After receiving the receipt** (onchain confirmation). The flow is deliberately synchronous for the PoC: the POS is not approved until onchain certainty is obtained.

This trades latency for correctness. A production system could send an optimistic approval and reconcile afterwards.

---

### Is there offchain pre-validation or an optimistic approval mechanism?

Not in the PoC. The only offchain validations are:

1. ISO message parsing (malformed -> immediate decline)
2. Idempotency lookup in DB (duplicate -> cached response)
3. Card token -> address resolution (not found -> decline)

There is no offchain balance check before submitting. The contract is the final arbiter.

---

## Reconciliation

### Is reconciliation only batch (script) or also near real-time?

**Batch only** in the PoC. The `scripts/reconcile.ts` script is run manually or via cron:

```bash
npx tsx scripts/reconcile.ts --from 2026-06-01 --to 2026-06-09
```

It generates a JSON report in `data/reconciliation-<timestamp>.json` and inserts into the `reconciliation_run` table. Near real-time would require an onchain event listener that is not implemented.

---

### What behavior is expected on mismatch between offchain logs and onchain state?

| Type | Description | Suggested action |
|---|---|---|
| `MISSING_ONCHAIN` | Log says `confirmed` but no onchain event found | Investigate hash, possible reorg |
| `MISSING_OFFCHAIN` | Onchain event with no corresponding log | Possible data loss in middleware |
| `STATUS_MISMATCH` | Different states between DB and contract | DB out of date, no funds at risk |
| `AMOUNT_MISMATCH` | Different amounts | Critical, requires manual intervention |

The script **does not auto-correct**. It only reports.

---

### Is Arbitrum always the single source of truth?

**Yes, for financial state**. If there is a conflict between the PostgreSQL log and the contract state, the contract wins.

The PostgreSQL log is an operational cache for speed and reconciliation. It is never used to make business decisions without onchain validation.

---

## Security

### Was formal threat modeling performed, or only manual internal review?

Only manual internal review for the PoC. No formal framework (STRIDE, PASTA, etc.) was applied. Identified attack surfaces are documented but without formal risk scoring.

---

### What attack vectors are explicitly considered?

| Vector | Implemented mitigation |
|---|---|
| **ISO message replay** | `isDuplicate()` by `txId` + UNIQUE constraint in DB |
| **Double spend** | `authStatus` enum in contract, atomic EVM transition |
| **Privilege escalation** | Only the relayer wallet can call `authorize`/`capture`; `onlyRelayer` modifier |
| **Amount manipulation** | Amount in ISO and calldata must match; contract validates balance |
| **txId forgery** | `txId` derived deterministically; a different txId creates a different authorization |

---

### If the middleware is compromised, can it drain or misuse funds?

**Partially yes**. This is the most important limitation of the PoC:

- The relayer wallet has permission to call `authorize` and `capture` on behalf of any user
- A compromised middleware could capture legitimate authorizations or create fraudulent ones

**Mitigations in the PoC:**
- The relayer can only operate on users who have previously deposited funds
- It cannot transfer funds out of the contract directly
- Merchants only receive funds via `capture`, which requires a previously authorized `txId`

> In production this would require per-transaction user signatures or a delegation system with limits.

---

### Are there per-user or global spending limits?

**Not in the PoC**. The only limit is the user's available balance (`availableBalance[user]`).

There are no:
- Daily per-user limits
- Per-transaction limits
- Global contract limits (circuit breaker)

In production these are critical compliance requirements.

---

## PoC Scope

### Are users and merchants real, or is everything simulated?

Everything simulated:

- **Users**: Ethereum addresses with pre-deposited funds via setup scripts
- **Merchants**: Ethereum addresses configured in `data/merchants.json`
- **Cards**: tokens (truncated PANs) mapped to addresses in `data/cards.json`
- **POS**: script that sends ISO 8583 messages via TCP to the middleware

There is no integration with any real issuer, acquirer, or payment processor.

---

### Is the merchant side fully mocked or partially integrated?

**Fully mocked**. The merchant is an Ethereum address that receives the settlement. There is no:

- Merchant management system
- Merchant KYC/onboarding
- Merchant dashboard
- Merchant notification webhook

The mapping `merchantRef (ISO field 042) -> Ethereum address` is stored in a static JSON.

---

### How is PoC reproducibility demonstrated?

```bash
# 1. Deploy contract on Arbitrum Sepolia
cd contracts && npx hardhat deploy --network arbitrumSepolia

# 2. Setup: deposit funds, register merchants
npx tsx scripts/setup.ts

# 3. Start middleware
cd backend && npm run start

# 4. Run integration test suite
npm run test:integration

# 5. Simulate POS (sends real ISO messages via TCP)
npx tsx scripts/simulatePOS.ts

# 6. Reconcile
npx tsx scripts/reconcile.ts
```

All steps are deterministic given the same environment.

---

### What exact metrics are delivered as proof of success?

| Metric | Target | How measured |
|---|---|---|
| End-to-end latency (ISO in -> ISO out) | < 3s (including Arbitrum) | `GET /metrics` -> `iso_processing_duration_ms` |
| Authorization success rate | > 95% under normal conditions | `tx_confirmed / iso_messages_received` |
| Integration tests passing | 100% | `npm test` |
| Zero reconciliation discrepancies | 0 mismatches post-simulation | Output of `reconcile.ts` |
| Idempotency verified | 0 double captures | Duplicate tests in suite |
| Sustained throughput | > 10 TPS in simulation | `scripts/loadTest.ts` |
