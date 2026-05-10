import { create } from 'zustand'
import type { Address, Hex } from 'viem'
import { ARBITRUM_SEPOLIA_RPC, DEPLOYED } from '../lib/contracts'

export type LogLevel = 'info' | 'ok' | 'error'

export interface LogEntry {
  id:    number
  level: LogLevel
  ts:    string
  msg:   string
}

export interface TxEntry {
  id:     number
  ts:     string
  action: string
  hash:   Hex
  gas?:   bigint
}

export interface BenchmarkEntry {
  id:            number
  action:        string
  hash:          Hex
  /** ms from sendTx call to hash returned by node */
  submitMs:      number
  /** ms from hash received to receipt confirmed */
  confirmMs:     number
  /** total ms from call start to receipt confirmed */
  totalMs:       number
  gasUsed:       bigint
  blockNumber:   bigint
  ts:            string
}

export interface TokenInfo {
  symbol:   string
  address:  Address
  decimals: number
}

interface AppState {
  rpcUrl:       string
  coreAddress:  Address | ''
  tokens:       TokenInfo[]
  isConnected:  boolean
  activeWalletIdx: number
  blockNumber:  bigint
  isPaused:     boolean
  logs:         LogEntry[]
  txHistory:    TxEntry[]
  benchmarks:   BenchmarkEntry[]
  rpcLatencyMs: number | null
  walletBalances: Record<string, bigint>

  setRpcUrl:       (url: string) => void
  setCoreAddress:  (addr: Address) => void
  setTokens:       (tokens: TokenInfo[]) => void
  addToken:        (token: TokenInfo) => void
  setConnected:    (v: boolean) => void
  setActiveWallet: (idx: number) => void
  setBlockNumber:  (n: bigint) => void
  setIsPaused:     (v: boolean) => void
  setWalletBalance:(sym: string, amount: bigint) => void
  setRpcLatency:   (ms: number) => void
  addLog:          (level: LogLevel, msg: string) => void
  addTx:           (action: string, hash: Hex, gas?: bigint) => void
  addBenchmark:    (entry: Omit<BenchmarkEntry, 'id' | 'ts'>) => void
  clearLogs:       () => void
}

let logId = 0

export const useAppStore = create<AppState>((set) => ({
  rpcUrl:          ARBITRUM_SEPOLIA_RPC,
  coreAddress:     DEPLOYED.proxy,
  tokens:          [],
  isConnected:     false,
  activeWalletIdx: 0,
  blockNumber:     0n,
  isPaused:        false,
  logs:            [],
  txHistory:       [],
  benchmarks:      [],
  rpcLatencyMs:    null,
  walletBalances:  {},

  setRpcUrl:       (url)   => set({ rpcUrl: url }),
  setCoreAddress:  (addr)  => set({ coreAddress: addr }),
  setTokens:       (tokens)=> set({ tokens }),
  addToken:        (token) => set(s => ({
    tokens: s.tokens.find(t => t.address === token.address) ? s.tokens : [...s.tokens, token],
  })),
  setConnected:    (v)     => set({ isConnected: v }),
  setActiveWallet: (idx)   => set({ activeWalletIdx: idx }),
  setBlockNumber:  (n)     => set({ blockNumber: n }),
  setIsPaused:     (v)     => set({ isPaused: v }),
  setWalletBalance:(sym, amount) =>
    set(s => ({ walletBalances: { ...s.walletBalances, [sym]: amount } })),
  setRpcLatency:   (ms)    => set({ rpcLatencyMs: ms }),
  addLog: (level, msg) =>
    set(s => ({
      logs: [
        ...s.logs,
        { id: ++logId, level, ts: new Date().toLocaleTimeString(), msg },
      ].slice(-200),
    })),
  addTx: (action, hash, gas) =>
    set(s => ({
      txHistory: [
        { id: ++logId, ts: new Date().toLocaleTimeString(), action, hash, gas },
        ...s.txHistory,
      ].slice(0, 100),
    })),
  addBenchmark: (entry) =>
    set(s => ({
      benchmarks: [
        { ...entry, id: ++logId, ts: new Date().toLocaleTimeString() },
        ...s.benchmarks,
      ].slice(0, 200),
    })),
  clearLogs: () => set({ logs: [], txHistory: [], benchmarks: [] }),
}))
