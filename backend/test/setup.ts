/**
 * test/setup.ts
 * Jest global setup: run migrations once and truncate tables before each test.
 * Requires a real PostgreSQL database at DATABASE_URL (set in test/setEnv.cjs).
 */
import { runMigrations, _resetDbForTests, closeDb } from '../src/db/client.js'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await _resetDbForTests()
})

afterAll(async () => {
  await closeDb()
})
