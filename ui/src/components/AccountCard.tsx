import { useEffect } from 'react'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { formatToken } from '../lib/utils'
import { DEPLOYED } from '../lib/contracts'
import type { Address } from 'viem'

const ARBISCAN = 'https://sepolia.arbiscan.io'

export function AccountCard() {
  const { tokens, walletBalances, isConnected } = useAppStore()
  const { refreshWalletBalances, queryBalance } = useContractActions()
  const account = TEST_ACCOUNTS[0]

  // Poll balances every 10 s
  useEffect(() => {
    if (!isConnected) return
    const id = setInterval(() => refreshWalletBalances(DEPLOYED.proxy as Address), 10_000)
    return () => clearInterval(id)
  }, [isConnected, refreshWalletBalances])

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-sm font-semibold text-white">Wallet</span>
        <button
          className="btn btn-ghost ml-auto text-[11px] py-0.5 px-2"
          onClick={() => refreshWalletBalances(DEPLOYED.proxy as Address)}
        >
          ↻ Refresh
        </button>
      </div>
      <div className="card-body">
        <div className="flex flex-wrap items-center gap-4">

          {/* Address */}
          <div>
            <p className="label">Address</p>
            <a
              href={`${ARBISCAN}/address/${account.address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-indigo-400 hover:underline"
            >
              {account.address}
            </a>
          </div>

          {/* Roles */}
          <div>
            <p className="label">Roles</p>
            <div className="flex flex-wrap gap-1.5">
              {account.roles.map(r => (
                <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {r.replace('_ROLE', '')}
                </span>
              ))}
            </div>
          </div>

          {/* ETH balance */}
          <div>
            <p className="label">ETH (wallet)</p>
            <p className="font-mono text-sm text-slate-200">
              {walletBalances['ETH'] != null
                ? `${formatToken(walletBalances['ETH'], 18)} ETH`
                : '—'}
            </p>
          </div>

          {/* Token balances */}
          {tokens.map(t => (
            <div key={t.address}>
              <p className="label">
                <a
                  href={`${ARBISCAN}/token/${t.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-indigo-400"
                >
                  {t.symbol}
                </a>{' '}
                <span className="text-slate-600">wallet</span>
              </p>
              <p className="font-mono text-sm text-slate-200">
                {walletBalances[t.symbol] != null
                  ? formatToken(walletBalances[t.symbol], t.decimals)
                  : '—'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
