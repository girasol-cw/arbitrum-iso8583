import { useCallback } from 'react'
import {
  readContract,
  writeContract,
  waitForTransactionReceipt,
  getBalance,
  getBlockNumber,
  getTransactionCount,
} from 'viem/actions'
import { keccak256, toHex } from 'viem'
import type { Address, Hex } from 'viem'

import { getPublicClient, getWalletClient, setRpcUrl } from '../lib/viemClient'
import { SETTLEMENT_ABI, ERC20_ABI } from '../lib/abi'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { useAppStore } from '../store'
import { toTokenAmount } from '../lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Role hash helper (keccak256 of string)
// ─────────────────────────────────────────────────────────────────────────────
function roleHash(name: string): Hex {
  if (name === 'DEFAULT_ADMIN_ROLE') return '0x0000000000000000000000000000000000000000000000000000000000000000'
  return keccak256(toHex(name))
}

// ─────────────────────────────────────────────────────────────────────────────
export function useContractActions() {
  const store = useAppStore()

  const publicClient = useCallback(
    () => getPublicClient(),
    [],
  )

  const walletClient = useCallback(
    () => getWalletClient(TEST_ACCOUNTS[store.activeWalletIdx].pk),
    [store.activeWalletIdx],
  )

  const coreAddr = store.coreAddress as Address

  // ── Connect to RPC and read initial state ─────────────────────────────────
  const connect = useCallback(
    async (rpc: string, core: Address, tokenAddrs: Address[]) => {
      setRpcUrl(rpc)
      store.setRpcUrl(rpc)
      store.setCoreAddress(core)

      const pub = getPublicClient()

      // Resolve token metadata
      const resolved = await Promise.all(
        tokenAddrs.filter(Boolean).map(async (addr) => {
          const [symbol, decimals] = await Promise.all([
            readContract(pub, { address: addr, abi: ERC20_ABI, functionName: 'symbol' }),
            readContract(pub, { address: addr, abi: ERC20_ABI, functionName: 'decimals' }),
          ])
          return { symbol: symbol as string, address: addr, decimals: Number(decimals) }
        }),
      )
      store.setTokens(resolved)

      const [block, paused] = await Promise.all([
        getBlockNumber(pub),
        readContract(pub, { address: core, abi: SETTLEMENT_ABI, functionName: 'paused' }),
      ])
      store.setBlockNumber(block)
      store.setIsPaused(paused as boolean)
      store.setConnected(true)
      store.addLog('ok', `Connected to ${rpc} — core: ${core}`)
      await refreshWalletBalances(core, resolved)
    },
    [],
  )

  // ── Refresh wallet token balances ─────────────────────────────────────────
  const refreshWalletBalances = useCallback(
    async (core: Address, tokens = store.tokens) => {
      const pub  = getPublicClient()
      const addr = TEST_ACCOUNTS[store.activeWalletIdx].address

      const ethBal = await getBalance(pub, { address: addr })
      store.setWalletBalance('ETH', ethBal)

      await Promise.all(
        tokens.map(async t => {
          const b = await readContract(pub, {
            address:      t.address,
            abi:          ERC20_ABI,
            functionName: 'balanceOf',
            args:         [addr],
          })
          store.setWalletBalance(t.symbol, b as bigint)
        }),
      )

      // Poll block
      const block = await getBlockNumber(pub)
      store.setBlockNumber(block)
    },
    [store.activeWalletIdx, store.tokens],
  )

  // ── Generic write helper ──────────────────────────────────────────────────
  const sendTx = useCallback(
    async <T extends typeof SETTLEMENT_ABI[number]['name']>(
      fnName: T,
      args: readonly unknown[],
    ): Promise<{ hash: Hex; gas: bigint } | null> => {
      try {
        const pub  = getPublicClient()
        const wc   = walletClient()

        const t0 = performance.now()
        const hash = await writeContract(wc, {
          address:      coreAddr,
          abi:          SETTLEMENT_ABI,
          functionName: fnName as never,
          args:         args as never,
        })
        const t1 = performance.now()

        const receipt = await waitForTransactionReceipt(pub, { hash })
        const t2 = performance.now()

        const submitMs  = Math.round(t1 - t0)
        const confirmMs = Math.round(t2 - t1)
        const totalMs   = Math.round(t2 - t0)

        store.addTx(fnName as string, hash, receipt.gasUsed)
        store.addBenchmark({
          action:      fnName as string,
          hash,
          submitMs,
          confirmMs,
          totalMs,
          gasUsed:     receipt.gasUsed,
          blockNumber: receipt.blockNumber,
        })
        store.addLog('ok', `${fnName} | tx: ${hash.slice(0, 14)}… | gas: ${receipt.gasUsed} | ${totalMs}ms`)
        await refreshWalletBalances(coreAddr)
        return { hash, gas: receipt.gasUsed }
      } catch (err: unknown) {
        const msg = extractError(err)
        store.addLog('error', `${fnName}: ${msg}`)
        return null
      }
    },
    [coreAddr, walletClient, refreshWalletBalances],
  )

  // ── ERC20 approve ─────────────────────────────────────────────────────────
  const approveToken = useCallback(
    async (tokenAddr: Address, human: string, decimals: number) => {
      try {
        const pub  = getPublicClient()
        const wc   = walletClient()
        const hash = await writeContract(wc, {
          address:      tokenAddr,
          abi:          ERC20_ABI,
          functionName: 'approve',
          args:         [coreAddr, toTokenAmount(human, decimals)],
        })
        await waitForTransactionReceipt(pub, { hash })
        store.addTx('ERC20.approve', hash)
        store.addLog('ok', `ERC20.approve ${human} tokens | tx: ${hash.slice(0, 14)}…`)
        await refreshWalletBalances(coreAddr)
        return hash
      } catch (err) {
        store.addLog('error', `approve: ${extractError(err)}`)
        return null
      }
    },
    [coreAddr, walletClient, refreshWalletBalances],
  )

  // ── configureToken ────────────────────────────────────────────────────────
  const configureToken = (token: Address, allowed: boolean) =>
    sendTx('configureToken', [token, allowed])

  // ── resolveToken: read metadata without writing anything ──────────────────
  const resolveToken = useCallback(
    async (addr: Address) => {
      try {
        const pub = getPublicClient()
        const [symbol, decimals] = await Promise.all([
          readContract(pub, { address: addr, abi: ERC20_ABI, functionName: 'symbol' }),
          readContract(pub, { address: addr, abi: ERC20_ABI, functionName: 'decimals' }),
        ])
        return { symbol: symbol as string, address: addr, decimals: Number(decimals) }
      } catch (err) {
        store.addLog('error', `resolveToken: ${extractError(err)}`)
        return null
      }
    },
    [],
  )

  // ── grantRole / revokeRole ────────────────────────────────────────────────
  const grantRole = (roleName: string, account: Address) =>
    sendTx('grantRole', [roleHash(roleName), account])

  const revokeRole = (roleName: string, account: Address) =>
    sendTx('revokeRole', [roleHash(roleName), account])

  // ── deposit / withdraw ────────────────────────────────────────────────────
  const deposit = (token: Address, human: string, decimals: number) =>
    sendTx('deposit', [token, toTokenAmount(human, decimals)])

  const withdraw = (token: Address, human: string, decimals: number) =>
    sendTx('withdraw', [token, toTokenAmount(human, decimals)])

  // ── authorize ─────────────────────────────────────────────────────────────
  const authorize = (
    txId:      Hex,
    user:      Address,
    merchant:  Address,
    token:     Address,
    human:     string,
    decimals:  number,
    expiresIn: number,
  ) => {
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expiresIn)
    return sendTx('authorize', [txId, user, merchant, token, toTokenAmount(human, decimals), expiresAt])
  }

  // ── capture / release / expire / batchExpire ──────────────────────────────
  const capture     = (txId: Hex) => sendTx('capture', [txId])
  const release     = (txId: Hex) => sendTx('release', [txId])
  const expire      = (txId: Hex) => sendTx('expire',  [txId])
  const batchExpire = (txIds: Hex[]) => sendTx('batchExpire', [txIds])

  // ── burstAuthorize: N authorizations with sequential nonces ───────────────
  // Fires all writeContract calls immediately (no receipt wait), collecting
  // hashes, then waits for all receipts in parallel. This avoids nonce
  // collisions that occur when Promise.all fetches the same pending nonce N times.
  const burstAuthorize = useCallback(
    async (items: Array<{
      txId:      Hex
      user:      Address
      merchant:  Address
      token:     Address
      human:     string
      decimals:  number
      expiresIn: number
    }>) => {
      const pub  = getPublicClient()
      const wc   = walletClient()
      const acct = wc.account

      // Fetch pending nonce once — all txs will increment from here
      const startNonce = await getTransactionCount(pub, {
        address:   acct.address,
        blockTag: 'pending',
      })

      // Phase A: submit all transactions without waiting for receipts
      const submissions = await Promise.allSettled(
        items.map(async (item, i) => {
          const expiresAt = BigInt(Math.floor(Date.now() / 1000) + item.expiresIn)
          const hash = await writeContract(wc, {
            address:      coreAddr,
            abi:          SETTLEMENT_ABI,
            functionName: 'authorize' as never,
            args:         [item.txId, item.user, item.merchant, item.token,
                           toTokenAmount(item.human, item.decimals), expiresAt] as never,
            nonce:        startNonce + i,
          })
          return { i, txId: item.txId, hash }
        }),
      )

      // Phase B: wait for all submitted receipts in parallel
      const results = await Promise.allSettled(
        submissions.map(async s => {
          if (s.status === 'rejected') throw s.reason
          const { i, txId, hash } = s.value
          const receipt = await waitForTransactionReceipt(pub, { hash })
          return { i, txId, hash, gas: receipt.gasUsed, ok: receipt.status === 'success' }
        }),
      )

      await refreshWalletBalances(coreAddr)

      return results.map((r, i) => {
        if (r.status === 'fulfilled' && r.value.ok) {
          store.addTx('authorize', r.value.hash, r.value.gas)
          return { i: r.value.i, txId: r.value.txId, hash: r.value.hash as Hex, ok: true }
        }
        const reason = r.status === 'rejected' ? extractError(r.reason) : 'reverted'
        store.addLog('error', `burst authorize[${i}]: ${reason}`)
        return { i: items[i] ? i : i, txId: items[i]?.txId ?? '0x' as Hex, hash: null, ok: false, reason }
      })
    },
    [coreAddr, walletClient, refreshWalletBalances],
  )

  // ── burstCapture: N captures with sequential nonces ───────────────────────
  const burstCapture = useCallback(
    async (txIds: Hex[]) => {
      const pub  = getPublicClient()
      const wc   = walletClient()
      const acct = wc.account

      const startNonce = await getTransactionCount(pub, {
        address:   acct.address,
        blockTag: 'pending',
      })

      const submissions = await Promise.allSettled(
        txIds.map(async (txId, i) => {
          const hash = await writeContract(wc, {
            address:      coreAddr,
            abi:          SETTLEMENT_ABI,
            functionName: 'capture' as never,
            args:         [txId] as never,
            nonce:        startNonce + i,
          })
          return { i, txId, hash }
        }),
      )

      const results = await Promise.allSettled(
        submissions.map(async s => {
          if (s.status === 'rejected') throw s.reason
          const { i, txId, hash } = s.value
          const receipt = await waitForTransactionReceipt(pub, { hash })
          return { i, txId, hash, gas: receipt.gasUsed, ok: receipt.status === 'success' }
        }),
      )

      await refreshWalletBalances(coreAddr)

      return results.map((r, i) => {
        if (r.status === 'fulfilled' && r.value.ok) {
          store.addTx('capture', r.value.hash, r.value.gas)
          return { i: r.value.i, txId: r.value.txId, hash: r.value.hash as Hex, ok: true }
        }
        const reason = r.status === 'rejected' ? extractError(r.reason) : 'reverted'
        store.addLog('error', `burst capture[${i}]: ${reason}`)
        return { i, txId: txIds[i] ?? '0x' as Hex, hash: null, ok: false, reason }
      })
    },
    [coreAddr, walletClient, refreshWalletBalances],
  )

  // ── pause / unpause ───────────────────────────────────────────────────────
  const pause = async () => {
    const res = await sendTx('pause', [])
    if (res) store.setIsPaused(true)
    return res
  }
  const unpause = async () => {
    const res = await sendTx('unpause', [])
    if (res) store.setIsPaused(false)
    return res
  }

  // ── read: getBalance ──────────────────────────────────────────────────────
  const queryBalance = useCallback(
    async (user: Address, token: Address) => {
      try {
        const pub = getPublicClient()
        const [available, locked] = await readContract(pub, {
          address:      coreAddr,
          abi:          SETTLEMENT_ABI,
          functionName: 'getBalance',
          args:         [user, token],
        }) as [bigint, bigint]
        return { available, locked }
      } catch (err) {
        store.addLog('error', `getBalance: ${extractError(err)}`)
        return null
      }
    },
    [coreAddr],
  )

  // ── read: getHold ─────────────────────────────────────────────────────────
  const queryHold = useCallback(
    async (txId: Hex) => {
      try {
        const pub = getPublicClient()
        return await readContract(pub, {
          address:      coreAddr,
          abi:          SETTLEMENT_ABI,
          functionName: 'getHold',
          args:         [txId],
        })
      } catch (err) {
        store.addLog('error', `getHold: ${extractError(err)}`)
        return null
      }
    },
    [coreAddr],
  )

  // ── read: getTokenConfig ──────────────────────────────────────────────────
  const queryTokenConfig = useCallback(
    async (token: Address) => {
      try {
        const pub = getPublicClient()
        return await readContract(pub, {
          address:      coreAddr,
          abi:          SETTLEMENT_ABI,
          functionName: 'getTokenConfig',
          args:         [token],
        })
      } catch (err) {
        store.addLog('error', `getTokenConfig: ${extractError(err)}`)
        return null
      }
    },
    [coreAddr],
  )

  // ── measureRpcLatency ─────────────────────────────────────────────────────
  const measureRpcLatency = useCallback(
    async () => {
      const pub = getPublicClient()
      const t0 = performance.now()
      await getBlockNumber(pub)
      const ms = Math.round(performance.now() - t0)
      store.setRpcLatency(ms)
      store.addLog('info', `RPC latency: ${ms}ms`)
      return ms
    },
    [],
  )

  return {
    connect,
    refreshWalletBalances,
    measureRpcLatency,
    approveToken,
    configureToken,
    resolveToken,
    grantRole,
    revokeRole,
    deposit,
    withdraw,
    authorize,
    burstAuthorize,
    capture,
    release,
    expire,
    batchExpire,
    burstCapture,
    pause,
    unpause,
    queryBalance,
    queryHold,
    queryTokenConfig,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function extractError(err: unknown): string {
  if (err instanceof Error) {
    // viem ContractFunctionExecutionError
    const msg = (err as { shortMessage?: string }).shortMessage
      ?? (err as { details?: string }).details
      ?? err.message
    return msg.slice(0, 200)
  }
  return String(err)
}
