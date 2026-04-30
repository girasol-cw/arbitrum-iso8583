import { useAppStore } from '../store'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { shortenAddress, formatToken } from '../lib/utils'
import { CopyBtn } from './Primitives'
import { useContractActions } from '../hooks/useContractActions'

export function Sidebar() {
  const { activeWalletIdx, setActiveWallet, tokens, walletBalances, isConnected } = useAppStore()
  const { refreshWalletBalances } = useContractActions()
  const coreAddr = useAppStore(s => s.coreAddress)

  return (
    <aside className="w-72 min-w-72 bg-surface border-r border-border overflow-y-auto flex-shrink-0 p-4 space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
        🔑 Test Accounts
      </h2>

      {TEST_ACCOUNTS.map((acc, idx) => (
        <div
          key={acc.address}
          onClick={() => {
            setActiveWallet(idx)
            if (isConnected) refreshWalletBalances(coreAddr as `0x${string}`)
          }}
          className={`rounded-lg border-2 p-3 cursor-pointer transition-colors
            ${activeWalletIdx === idx
              ? 'border-accent bg-surface2'
              : 'border-border bg-surface2/60 hover:border-accent2/50'
            }`}
        >
          {/* Name + badge */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-[13px]">{acc.name}</span>
            {acc.roles[0] && (
              <span className={`role-badge ${acc.badgeClass}`}>
                {acc.roles[0].replace('_ROLE', '').replace('DEFAULT_ADMIN', 'ADMIN')}
              </span>
            )}
          </div>

          {/* Address */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-mono text-[11px] text-slate-400">
              {shortenAddress(acc.address, 8)}
            </span>
            <CopyBtn text={acc.address} />
          </div>

          {/* PK */}
          <div className="flex items-center gap-1.5 bg-bg rounded px-2 py-1">
            <span className="font-mono text-[10px] text-slate-600 truncate flex-1">
              {acc.pk.slice(0, 20)}…
            </span>
            <CopyBtn text={acc.pk} />
          </div>

          {/* Roles */}
          {acc.roles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {acc.roles.map(r => (
                <span
                  key={r}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-bg border border-border text-slate-500"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Wallet balances */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            💰 Wallet Balances
          </h2>
          {isConnected && (
            <button
              onClick={() => refreshWalletBalances(coreAddr as `0x${string}`)}
              className="text-[10px] text-slate-500 hover:text-accent2 transition-colors"
            >
              ↻ refresh
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {/* ETH */}
          <TokenBalRow
            symbol="ETH"
            value={walletBalances['ETH']}
            decimals={18}
          />
          {tokens.map(t => (
            <TokenBalRow
              key={t.address}
              symbol={t.symbol}
              value={walletBalances[t.symbol]}
              decimals={t.decimals}
            />
          ))}
        </div>
      </div>
    </aside>
  )
}

function TokenBalRow({
  symbol,
  value,
  decimals,
}: {
  symbol:   string
  value?:   bigint
  decimals: number
}) {
  return (
    <div className="flex items-center justify-between bg-bg border border-border rounded-md px-2.5 py-1.5">
      <span className="text-xs font-semibold text-slate-300">{symbol}</span>
      <span className="font-mono text-xs text-accent2">
        {value !== undefined ? formatToken(value, decimals) : '—'}
      </span>
    </div>
  )
}
