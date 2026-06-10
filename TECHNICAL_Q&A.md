# Technical Q&A — Arbitrum Settlement Core PoC

> Fecha: 2026-06-09  
> Versión: PoC v1

---

## Smart Contracts

### ¿El modelo de balance separa explícitamente available y locked, o se deriva implícitamente?

Explícitamente. El contrato mantiene dos mappings separados:

```solidity
mapping(address => uint256) public availableBalance;
mapping(address => uint256) public lockedBalance;
```

`availableBalance` es lo que el usuario puede gastar. `lockedBalance` es la suma de todos los holds activos. El balance total es `available + locked`.

---

### ¿Cómo garantizas que un capture no se ejecute más de una vez para el mismo txId?

El contrato usa un enum de estado por txId:

```solidity
enum AuthStatus { None, Authorized, Captured, Released, Expired }
mapping(bytes32 => AuthStatus) public authStatus;
```

`capture(txId)` tiene el guard:

```solidity
require(authStatus[txId] == AuthStatus.Authorized, "not authorized");
authStatus[txId] = AuthStatus.Captured;
```

La transición es atómica en EVM. Un segundo `capture` con el mismo `txId` revertirá con `"not authorized"` porque el estado ya es `Captured`.

---

### ¿El txId es globalmente único, o solo único por user/account?

**Globalmente único**. Se deriva como:

```ts
keccak256(encodePacked(stan, rrn, merchantRef, terminalId, localDate))
```

Los campos ISO `STAN + RRN + merchantRef + terminalId + localDate` identifican unívocamente una transacción en la red de pagos. El hash resultante es el key del mapping global `authStatus`.

---

### ¿Los holds de autorización expiran automáticamente, o solo se liberan manualmente?

En la implementación actual del PoC: **solo manualmente** vía `release(txId)`. No hay un mecanismo onchain de expiración automática porque EVM no tiene scheduler nativo.

El middleware es responsable de llamar `release` cuando detecta que un hold ha superado el `holdExpirySeconds` configurado. El reconciliador detecta holds vencidos y los reporta.

> **Limitación conocida**: si el middleware falla, los fondos quedan bloqueados hasta intervención manual o hasta que el reconciliador dispare la release.

---

### ¿Qué pasa si un capture llega después de que el hold expiró?

Depende de si el contrato ya ejecutó la release:

| Estado del hold | Resultado del capture |
|---|---|
| `Authorized` (aún no expirado) | Captura exitosa |
| `Released` (expirado y liberado) | Revert: `"not authorized"` |
| `None` (nunca existió) | Revert: `"not authorized"` |

El middleware clasifica el revert como `EXPIRED_HOLD` y devuelve ISO response code `'61'`.

---

### ¿Los decimales de token (USDC vs USDT) se manejan explícitamente?

El contrato opera en **unidades base del token**. El middleware es responsable de la conversión:

```ts
// parser.ts
const amountDecimal = (parseInt(f('004')) / 100).toFixed(2)
const amountOnchain = parseUnits(amountDecimal, tokenDecimals) // 6 para USDC/USDT
```

El PoC asume un único token de liquidación configurado en `SETTLEMENT_TOKEN_ADDRESS`. Si se necesitara multi-token, el contrato requeriría un mapping `tokenAddress → balances`.

---

### ¿Puede un usuario tener múltiples autorizaciones concurrentes?

Sí. El contrato no limita el número de holds activos por usuario. Cada `txId` es independiente. El balance disponible se reduce con cada `authorize`:

```solidity
availableBalance[user] -= amount;
lockedBalance[user] += amount;
```

Siempre que `availableBalance[user] >= amount`, la autorización procede.

---

### ¿Se manejan explícitamente overflow/underflow y edge cases contables?

Sí. Solidity ≥ 0.8.x tiene overflow/underflow protection built-in (panic `0x11`). Adicionalmente el contrato tiene guards explícitos:

```solidity
require(availableBalance[user] >= amount, "insufficient funds");
require(lockedBalance[user] >= amount, "accounting error");
```

El segundo guard protege contra inconsistencias de estado que no deberían ocurrir pero son defensivamente verificadas.

---

## Middleware

### ¿Qué subset exacto de ISO 8583 soporta este PoC?

**MTI soportados:**

| MTI | Descripción |
|---|---|
| `0100` | Authorization Request |
| `0200` | Financial/Capture Request |
| `0110` | Authorization Response (salida) |
| `0210` | Financial Response (salida) |

**Campos soportados:**

| Campo | Nombre |
|---|---|
| `002` | PAN / card token |
| `003` | Processing code |
| `004` | Amount |
| `011` | STAN |
| `037` | RRN |
| `042` | Terminal ID / Merchant ID |
| `043` | Merchant name |
| `049` | Currency code |
| `039` | Response code (solo en respuestas) |

Todo lo demás devuelve response code `'12'` (invalid transaction).

---

### ¿Cómo se construye el txId determinista?

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

`localDate` es el campo ISO `013` (MMDD). La combinación `STAN + RRN + merchantRef + terminalId + fecha` es suficientemente única en redes de pago reales para el PoC.

---

### ¿Qué estrategia de idempotencia se usa?

**Tres capas:**

1. **DB constraint**: columna `tx_id` con `UNIQUE` en `payment_log`. Un segundo insert con el mismo `tx_id` falla a nivel PostgreSQL antes de tocar la red.
2. **Lookup previo**: `isDuplicate(txId)` consulta el log antes de cualquier operación. Si existe con estado `submitted` o `confirmed`, devuelve el resultado previo directamente.
3. **Onchain**: el contrato mismo rechaza un segundo `authorize` o `capture` con el mismo `txId`.

---

### ¿Cómo se manejan los reintentos ante fallo de RPC o submission?

```ts
// src/relayer/submitter.ts
try {
  hash = await walletClient.writeContract(...)
} catch (err) {
  if (isNonceConflict(err)) {
    await syncNonce()
    hash = await walletClient.writeContract(...)  // un solo reintento
  } else {
    throw err  // clasificado como RPC_FAILURE → ISO '96'
  }
}
```

La política actual es **un reintento** ante conflicto de nonce. Fallos de RPC permanentes se clasifican y se devuelve decline al POS. El reconciliador detecta transacciones en estado `pending` para reintento manual.

---

### ¿Cómo se maneja entrega fuera de orden (capture antes de authorize)?

El contrato rechazará el `capture` con `"not authorized"` (estado `None`). El middleware:

1. Clasifica el revert como `INVALID_CAPTURE`
2. Persiste el intento en el log con estado `failed`
3. Devuelve ISO response code `'25'` (unable to locate record)

No hay cola de espera para reintentar el capture una vez llegue el authorize. En producción esto requeriría un mecanismo de retry con backoff.

---

### ¿Cómo se correlaciona una autorización con su capture?

Por `txId`. El `txId` se deriva **de los mismos campos ISO** en ambos mensajes:

```
STAN + RRN + merchantRef + terminalId + localDate
```

El sistema de pago que envía el `0200` debe incluir los mismos valores en esos campos que el `0100` original. Esto es el comportamiento estándar en redes ISO 8583.

---

### ¿Qué pasa si la tx se submittea onchain pero el middleware no recibe confirmación?

```ts
// src/relayer/responseHandler.ts
const receipt = await publicClient.waitForTransactionReceipt({
  hash,
  timeout: CONFIRMATION_TIMEOUT_MS  // configurable, default 30s
})
```

Si el timeout expira:

1. El estado en DB queda `submitted` (no `confirmed`)
2. Se devuelve decline al POS (respuesta conservadora)
3. El reconciliador detecta el `tx_hash` con estado `submitted` y verifica onchain si confirmó

---

### ¿Los logs se persisten para reconciliación, o solo en memoria?

**Persisten en PostgreSQL**. Cada mensaje ISO procesado genera una fila en `payment_log` con:

```
tx_id, mti, stan, rrn, merchant_ref, terminal_id,
amount, currency, action, tx_hash, onchain_status,
revert_reason, iso_response_code, iso_raw (JSON),
created_at, updated_at
```

La conexión se configura vía `DATABASE_URL` (ej: `postgresql://user:pass@host:5432/middleware`).

---

## Latencia

### ¿El target <200ms es tiempo de middleware o confirmación onchain?

**Tiempo de middleware** (procesamiento interno). La confirmación onchain en Arbitrum One toma entre 200ms y 2s dependiendo de congestión.

```
ISO message recibido
    ↓ <50ms   parse + normalize + DB write + submit tx
TX submitted (hash disponible)
    ↓ <2s     waitForReceipt (Arbitrum)
ISO response enviado al POS
```

El POS espera la respuesta completa, por lo que la latencia percibida incluye confirmación onchain.

---

### ¿La respuesta al POS se envía antes o después de submitear la tx?

**Después de recibir el recibo** (confirmación onchain). El flujo es síncrono deliberadamente para el PoC: no se aprueba al POS hasta tener certeza onchain.

Esto sacrifica latencia por correctness. Un sistema de producción podría enviar aprobación optimista y reconciliar después.

---

### ¿Hay pre-validación offchain o mecanismo de aprobación optimista?

No en el PoC. Las únicas validaciones offchain son:

1. Parsing del mensaje ISO (malformado → decline inmediato)
2. Lookup de idempotencia en DB (duplicado → respuesta cacheada)
3. Resolución de card token → address (no encontrado → decline)

No hay verificación de saldo offchain antes de submitear. El contrato es el árbitro final.

---

## Reconciliación

### ¿La reconciliación es solo batch (script) o también near real-time?

**Solo batch** en el PoC. El script `scripts/reconcile.ts` se ejecuta manualmente o vía cron:

```bash
npx tsx scripts/reconcile.ts --from 2026-06-01 --to 2026-06-09
```

Genera un reporte JSON en `data/reconciliation-<timestamp>.json` e inserta en la tabla `reconciliation_run`. Near real-time requeriría un event listener onchain que no está implementado.

---

### ¿Qué comportamiento se espera ante mismatch entre logs offchain y estado onchain?

| Tipo | Descripción | Acción sugerida |
|---|---|---|
| `MISSING_ONCHAIN` | Log dice `confirmed` pero no hay evento onchain | Investigar hash, posible reorg |
| `MISSING_OFFCHAIN` | Evento onchain sin log correspondiente | Posible pérdida de datos en middleware |
| `STATUS_MISMATCH` | Estados diferentes entre DB y contrato | DB desactualizado, no fondos en riesgo |
| `AMOUNT_MISMATCH` | Montos distintos | Crítico, requiere intervención manual |

El script **no corrige automáticamente**. Solo reporta.

---

### ¿Arbitrum es siempre la única fuente de verdad?

**Sí, para el estado financiero**. Si hay conflicto entre el log PostgreSQL y el estado del contrato, el contrato gana.

El log PostgreSQL es una caché operacional para velocidad y reconciliación. Nunca se usa para tomar decisiones de negocio sin validación onchain.

---

## Seguridad

### ¿Se realizó threat modeling formal, o solo revisión interna manual?

Solo revisión interna manual para el PoC. No se aplicó ningún framework formal (STRIDE, PASTA, etc.). Las superficies de ataque identificadas están documentadas pero sin scoring de riesgo formal.

---

### ¿Qué vectores de ataque se consideran explícitamente?

| Vector | Mitigación implementada |
|---|---|
| **Replay de mensaje ISO** | `isDuplicate()` por `txId` + constraint UNIQUE en DB |
| **Double spend** | `authStatus` enum en contrato, transición atómica EVM |
| **Escalación de privilegios** | Solo el relayer wallet puede llamar `authorize`/`capture`; modifier `onlyRelayer` |
| **Manipulación de amount** | Amount en ISO y calldata deben coincidir; el contrato valida saldo |
| **Falsificación de txId** | `txId` derivado determinísticamente; un txId distinto crea una autorización distinta |

---

### Si el middleware es comprometido, ¿puede drenar o mal usar fondos?

**Parcialmente sí**. Esta es la limitación más importante del PoC:

- El relayer wallet tiene permiso para llamar `authorize` y `capture` por cualquier usuario
- Un middleware comprometido podría capturar autorizaciones legítimas o crear autorizaciones fraudulentas

**Mitigaciones en el PoC:**
- El relayer solo puede operar sobre usuarios que previamente depositaron fondos
- No puede transferir fondos fuera del contrato directamente
- Los merchants solo reciben fondos vía `capture`, que requiere un `txId` previamente autorizado

> En producción esto requeriría firma del usuario por cada transacción o un sistema de delegación con límites.

---

### ¿Hay límites de gasto por usuario o globales?

**No en el PoC**. El único límite es el balance disponible del usuario (`availableBalance[user]`).

No hay:
- Límite diario por usuario
- Límite por transacción
- Límite global del contrato (circuit breaker)

En producción estos son requisitos críticos de compliance.

---

## Scope del PoC

### ¿Hay usuarios y merchants reales, o todo es simulado?

Todo simulado:

- **Usuarios**: addresses Ethereum con fondos pre-depositados vía scripts de setup
- **Merchants**: addresses Ethereum configuradas en `data/merchants.json`
- **Tarjetas**: tokens (PANs truncados) mapeados a addresses en `data/cards.json`
- **POS**: script que envía mensajes ISO 8583 vía TCP al middleware

No hay integración con ningún emisor, adquirente, o procesador de pagos real.

---

### ¿El lado merchant está completamente mockeado o parcialmente integrado?

**Completamente mockeado**. El merchant es una address Ethereum que recibe el settlement. No hay:

- Sistema de gestión de merchants
- KYC/onboarding de merchants
- Dashboard de merchant
- Webhook de notificación al merchant

El mapping `merchantRef (ISO field 042) → address Ethereum` está en un JSON estático.

---

### ¿Cómo se demuestra la reproducibilidad del PoC?

```bash
# 1. Deploy contrato en Arbitrum Sepolia
cd contracts && npx hardhat deploy --network arbitrumSepolia

# 2. Setup: depositar fondos, registrar merchants
npx tsx scripts/setup.ts

# 3. Levantar middleware
cd backend && npm run start

# 4. Ejecutar suite de tests de integración
npm run test:integration

# 5. Simular POS (envía ISO messages reales vía TCP)
npx tsx scripts/simulatePOS.ts

# 6. Reconciliar
npx tsx scripts/reconcile.ts
```

Todos los pasos son deterministas dado el mismo entorno.

---

### ¿Qué métricas exactas se entregan como prueba de éxito?

| Métrica | Target | Cómo se mide |
|---|---|---|
| Latencia end-to-end (ISO in → ISO out) | < 3s (incluyendo Arbitrum) | `GET /metrics` → `iso_processing_duration_ms` |
| Tasa de éxito de authorizations | > 95% en condiciones normales | `tx_confirmed / iso_messages_received` |
| Tests de integración passing | 100% | `npm test` |
| Cero discrepancias en reconciliación | 0 mismatches post-simulación | Output de `reconcile.ts` |
| Idempotencia verificada | 0 double captures | Tests de duplicados en suite |
| Throughput sostenido | > 10 TPS en simulación | `scripts/loadTest.ts` |