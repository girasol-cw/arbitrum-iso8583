/**
 * db/client.ts
 * better-sqlite3 database client – single instance for the process.
 * Creates the data directory and runs migrations at startup.
 */
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { config } from '../config.js'
import { CREATE_TABLES_SQL } from './schema.js'
import { logger } from '../observability/logger.js'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  // Ensure data directory exists
  mkdirSync(dirname(config.DB_PATH), { recursive: true })

  _db = new Database(config.DB_PATH)

  // WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  // Run schema migrations
  _db.exec(CREATE_TABLES_SQL)

  logger.info({ path: config.DB_PATH }, 'SQLite database initialised')
  return _db
}

/** For testing: close and re-open with a fresh in-memory DB */
export function _resetDbForTests(inMemory = true): void {
  if (_db) {
    _db.close()
    _db = null
  }
  if (inMemory) {
    _db = new Database(':memory:')
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    _db.exec(CREATE_TABLES_SQL)
  }
}
