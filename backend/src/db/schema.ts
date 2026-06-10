/**
 * db/schema.ts
 * Drizzle ORM table definitions for PostgreSQL.
 *
 * Properties use snake_case to stay consistent with column names.
 * CREATE_TABLES_SQL is still used at startup via runMigrations() to avoid
 * requiring drizzle-kit CLI in production.
 */
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── payment_log ───────────────────────────────────────────────────────────────

export const paymentLog = pgTable('payment_log', {
  id:               serial('id').primaryKey(),
  tx_id:            text('tx_id').notNull().unique(),
  mti:              text('mti').notNull(),
  stan:             text('stan').notNull(),
  rrn:              text('rrn').notNull(),
  merchant_ref:     text('merchant_ref').notNull(),
  terminal_id:      text('terminal_id').notNull(),
  card_token:       text('card_token').notNull(),
  user_address:     text('user_address'),
  merchant_address: text('merchant_address'),
  token_address:    text('token_address'),
  amount_decimal:   text('amount_decimal').notNull(),
  currency_alpha:   text('currency_alpha').notNull(),
  action:           text('action').notNull(),
  status:           text('status').notNull().default('pending'),
  tx_hash:          text('tx_hash'),
  block_number:     integer('block_number'),
  onchain_status:   text('onchain_status'),
  revert_reason:    text('revert_reason'),
  retry_count:      integer('retry_count').notNull().default(0),
  last_error:       text('last_error'),
  iso_raw:          text('iso_raw').notNull(),
  error_code:       text('error_code'),
  created_at:       integer('created_at').notNull().default(sql`extract(epoch from now())::integer`),
  updated_at:       integer('updated_at').notNull().default(sql`extract(epoch from now())::integer`),
})

// ── reconciliation_run ────────────────────────────────────────────────────────

export const reconciliationRun = pgTable('reconciliation_run', {
  id:            serial('id').primaryKey(),
  from_block:    integer('from_block').notNull(),
  to_block:      integer('to_block').notNull(),
  total_checked: integer('total_checked').notNull(),
  mismatches:    integer('mismatches').notNull(),
  report:        text('report').notNull(),
  created_at:    integer('created_at').notNull().default(sql`extract(epoch from now())::integer`),
})

// ── Bootstrap DDL ─────────────────────────────────────────────────────────────
// Executed at startup via runMigrations() to create tables if they do not exist.

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS payment_log (
  id               SERIAL  PRIMARY KEY,
  tx_id            TEXT    NOT NULL UNIQUE,
  mti              TEXT    NOT NULL,
  stan             TEXT    NOT NULL,
  rrn              TEXT    NOT NULL,
  merchant_ref     TEXT    NOT NULL,
  terminal_id      TEXT    NOT NULL,
  card_token       TEXT    NOT NULL,
  user_address     TEXT,
  merchant_address TEXT,
  token_address    TEXT,
  amount_decimal   TEXT    NOT NULL,
  currency_alpha   TEXT    NOT NULL,
  action           TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'pending',
  tx_hash          TEXT,
  block_number     INTEGER,
  onchain_status   TEXT,
  revert_reason    TEXT,
  retry_count      INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  iso_raw          TEXT    NOT NULL,
  error_code       TEXT,
  created_at       INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
  updated_at       INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE IF NOT EXISTS reconciliation_run (
  id            SERIAL  PRIMARY KEY,
  from_block    INTEGER NOT NULL,
  to_block      INTEGER NOT NULL,
  total_checked INTEGER NOT NULL,
  mismatches    INTEGER NOT NULL,
  report        TEXT    NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE INDEX IF NOT EXISTS idx_payment_log_tx_id   ON payment_log(tx_id);
CREATE INDEX IF NOT EXISTS idx_payment_log_rrn     ON payment_log(rrn);
CREATE INDEX IF NOT EXISTS idx_payment_log_stan    ON payment_log(stan);
CREATE INDEX IF NOT EXISTS idx_payment_log_status  ON payment_log(status);
CREATE INDEX IF NOT EXISTS idx_payment_log_created ON payment_log(created_at);
`
