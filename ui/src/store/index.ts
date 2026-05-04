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
  walletBalances: Record<string, bigint>

  setRpcUrl:       (url: string) => void
  setCoreAddress:  (addr: Address) => void
  setTokens:       (tokens: TokenInfo[]) => void
  setConnected:    (v: boolean) => void
  setActiveWallet: (idx: number) => void
  setBlockNumber:  (n: bigint) => void
  setIsPaused:     (v: boolean) => void
  setWalletBalance:(sym: string, amount: bigint) => void
  addLog:          (level: LogLevel, msg: string) => void
  addTx:           (action: string, hash: Hex, gas?: bigint) => void
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
  clearLogs: () => set({ logs: [], txHistory: [] }),
}))
