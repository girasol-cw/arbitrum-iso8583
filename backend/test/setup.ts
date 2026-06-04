/**
 * test/setup.ts
 * Jest global setup: initialise in-memory SQLite DB before each test run.
 */
import { _resetDbForTests } from '../src/db/client.js'

beforeEach(() => {
  _resetDbForTests(true)
})
