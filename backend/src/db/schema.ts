/**
 * db/schema.ts
 * DDL de SQLite ejecutado al arrancar via db/client.ts.
 *
 * ¿Por qué SQLite y no Postgres?
 *   Para un relayer de un solo proceso SQLite es suficiente:
 *   - Sin servidor adicional que mantener.
 *   - API síncrona (better-sqlite3) → no necesita async/await.
 *   - WAL mode garantiza lecturas no bloqueantes.
 *   - Si el volumen crece, la migración a Postgres sólo requiere cambiar
 *     el cliente, el SQL es estándar.
 */
export const CREATE_TABLES_SQL = `
-- Registro de pagos: una fila por mensaje ISO 8583 recibido
CREATE TABLE IF NOT EXISTS payment_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_id            TEXT    NOT NULL UNIQUE,   -- keccak256(stan+rrn+merchant+term+date)
  mti              TEXT    NOT NULL,
  stan             TEXT    NOT NULL,          -- campo 011
  rrn              TEXT    NOT NULL,          -- campo 037
  merchant_ref     TEXT    NOT NULL,          -- campo 043
  terminal_id      TEXT    NOT NULL,          -- campo 042
  card_token       TEXT    NOT NULL,          -- campo 002
  user_address     TEXT,                      -- resuelto desde card-mapping.json
  merchant_address TEXT,                      -- resuelto desde merchant-mapping.json
  token_address    TEXT,                      -- resuelto desde campo 049 (moneda)
  amount_decimal   TEXT    NOT NULL,          -- importe en unidades del token
  currency_alpha   TEXT    NOT NULL,          -- e.g. "USD"
  action           TEXT    NOT NULL,          -- authorize | capture | release | heartbeat
  status           TEXT    NOT NULL DEFAULT 'pending',
                                              -- pending | submitted | confirmed | failed | duplicate | unsupported
  tx_hash          TEXT,                      -- hash onchain
  block_number     INTEGER,
  onchain_status   TEXT,                      -- authorized | captured | released | reverted | timeout
  revert_reason    TEXT,
  iso_raw          TEXT    NOT NULL,          -- JSON completo del mensaje original (auditoría)
  error_code       TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_payment_log_tx_id   ON payment_log(tx_id);
CREATE INDEX IF NOT EXISTS idx_payment_log_rrn     ON payment_log(rrn);
CREATE INDEX IF NOT EXISTS idx_payment_log_stan    ON payment_log(stan);
CREATE INDEX IF NOT EXISTS idx_payment_log_status  ON payment_log(status);
CREATE INDEX IF NOT EXISTS idx_payment_log_created ON payment_log(created_at);
`
