import { create } from 'zustand'
import type { Address } from 'viem'

export type LogLevel = 'info' | 'ok' | 'error'

export interface LogEntry {
  id:    number
  level: LogLevel
  ts:    string
  msg:   string
}

export interface TokenInfo {
  symbol:   string
  address:  Address
  decimals: number
}

interface AppState {
  // Config
  rpcUrl:       string
  coreAddress:  Address | ''
  tokens:       TokenInfo[]
  isConnected:  boolean

  // Active wallet
  activeWalletIdx: number

  // Chain state
  blockNumber: bigint
  isPaused:    boolean

  // Logs
  logs: LogEntry[]

  // Token balances for active wallet (wallet balance, not contract balance)
  walletBalances: Record<string, bigint>

  // Actions
  setRpcUrl:       (url: string) => void
  setCoreAddress:  (addr: Address) => void
  setTokens:       (tokens: TokenInfo[]) => void
  setConnected:    (v: boolean) => void
  setActiveWallet: (idx: number) => void
  setBlockNumber:  (n: bigint) => void
  setIsPaused:     (v: boolean) => void
  setWalletBalance:(sym: string, amount: bigint) => void
  addLog:          (level: LogLevel, msg: string) => void
  clearLogs:       () => void
}

let logId = 0

export const useAppStore = create<AppState>((set) => ({
  rpcUrl:          'http://127.0.0.1:8545',
  coreAddress:     '',
  tokens:          [],
  isConnected:     false,
  activeWalletIdx: 0,
  blockNumber:     0n,
  isPaused:        false,
  logs:            [],
  walletBalances:  {},

  setRpcUrl:       (url)   => set({ rpcUrl: url }),
  setCoreAddress:  (addr)  => set({ coreAddress: addr }),
  setTokens:       (tokens)=> set({ tokens }),
  setConnected:    (v)     => set({ isConnected: v }),
  setActiveWallet: (idx)   => set({ activeWalletIdx: idx }),
  setBlockNumber:  (n)     => set({ blockNumber: n }),
  setIsPaused:     (v)     => set({ isPaused: v }),
  setWalletBalance:(sym, amount) =>
    set(s => ({ walletBalances: { ...s.walletBalances, [sym]: amount } })),
  addLog: (level, msg) =>
    set(s => ({
      logs: [
        ...s.logs,
        {
          id:    ++logId,
          level,
          ts:    new Date().toLocaleTimeString(),
          msg,
        },
      ].slice(-200),
    })),
  clearLogs: () => set({ logs: [] }),
}))
