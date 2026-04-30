import { useState } from 'react'
import type { Address, Hex } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { Section } from './Section'
import { FnBlock, LabeledInput, ResultBox } from './Primitives'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { formatToken, shortenAddress, timestampStr } from '../lib/utils'
import { HOLD_STATUS_LABELS } from '../lib/accounts'

export function QueryPanel() {
  const { tokens } = useAppStore()
  const { queryBalance, queryHold, queryTokenConfig } = useContractActions()

  // getBalance
  const [gbUser,    setGbUser]    = useState('')
  const [gbToken,   setGbToken]   = useState('')
  const [gbResult,  setGbResult]  = useState({ msg: '', ok: null as boolean | null })

  // getHold
  const [ghTxId,    setGhTxId]    = useState('')
  const [ghResult,  setGhResult]  = useState({ msg: '', ok: null as boolean | null })

  // getTokenConfig
  const [gtToken,   setGtToken]   = useState('')
  const [gtResult,  setGtResult]  = useState({ msg: '', ok: null as boolean | null })

  const resolveDecimals = (addr: string) =>
    tokens.find(t => t.address.toLowerCase() === addr.toLowerCase())?.decimals ?? 18
  const resolveSymbol = (addr: string) =>
    tokens.find(t => t.address.toLowerCase() === addr.toLowerCase())?.symbol ?? ''

  const handleGetBalance = async () => {
    if (!gbUser || !gbToken) { setGbResult({ msg: 'Fill user and token', ok: false }); return }
    setGbResult({ msg: '⏳ querying…', ok: null })
    const res = await queryBalance(gbUser as Address, gbToken as Address)
    if (res) {
      const dec = resolveDecimals(gbToken)
      const sym = resolveSymbol(gbToken)
      setGbResult({
        msg: `available: ${formatToken(res.available, dec)} ${sym}\nlocked:    ${formatToken(res.locked, dec)} ${sym}`,
        ok: true,
      })
    } else {
      setGbResult({ msg: '✗ query failed', ok: false })
    }
  }

  const handleGetHold = async () => {
    if (!ghTxId.trim()) { setGhResult({ msg: 'Enter txId', ok: false }); return }
    setGhResult({ msg: '⏳ querying…', ok: null })
    const res = await queryHold(ghTxId.trim() as Hex)
    if (res) {
      const h = res as {
        user: Address; merchant: Address; token: Address;
        amount: bigint; createdAt: bigint; expiresAt: bigint; status: number
      }
      const dec = resolveDecimals(h.token)
      const sym = resolveSymbol(h.token)
      setGhResult({
        msg: [
          `user:      ${h.user}`,
          `merchant:  ${h.merchant}`,
          `token:     ${h.token} (${sym})`,
          `amount:    ${formatToken(h.amount, dec)} ${sym}`,
          `createdAt: ${timestampStr(h.createdAt)}`,
          `expiresAt: ${timestampStr(h.expiresAt)}`,
          `status:    ${HOLD_STATUS_LABELS[h.status] ?? h.status}`,
        ].join('\n'),
        ok: true,
      })
    } else {
      setGhResult({ msg: '✗ query failed', ok: false })
    }
  }

  const handleGetTokenConfig = async () => {
    if (!gtToken) { setGtResult({ msg: 'Select a token', ok: false }); return }
    setGtResult({ msg: '⏳ querying…', ok: null })
    const res = await queryTokenConfig(gtToken as Address)
    if (res) {
      const c = res as { allowed: boolean; decimals: number }
      setGtResult({ msg: `allowed:  ${c.allowed}\ndecimals: ${c.decimals}`, ok: true })
    } else {
      setGtResult({ msg: '✗ query failed', ok: false })
    }
  }

  const accountOptions = TEST_ACCOUNTS.map(a => (
    <option key={a.address} value={a.address}>
      {a.name} ({shortenAddress(a.address)})
    </option>
  ))
  const tokenOptions = tokens.map(t => (
    <option key={t.address} value={t.address}>
      {t.symbol} ({shortenAddress(t.address)})
    </option>
  ))

  return (
    <Section title="🔍 Queries (view)" roleReq="Free — read only">

      <FnBlock name="getBalance(user, token)">
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="User">
            <select value={gbUser} onChange={e => setGbUser(e.target.value)}>
              <option value="">— select —</option>
              {accountOptions}
            </select>
          </LabeledInput>
          <LabeledInput label="Token">
            <select value={gbToken} onChange={e => setGbToken(e.target.value)}>
              <option value="">— select —</option>
              {tokenOptions}
            </select>
          </LabeledInput>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-ghost" onClick={handleGetBalance}>Query</button>
        </div>
        <ResultBox value={gbResult.msg} ok={gbResult.ok} />
      </FnBlock>

      <FnBlock name="getHold(txId)" divider>
        <LabeledInput label="txId">
          <input value={ghTxId} onChange={e => setGhTxId(e.target.value)} placeholder="0x…" />
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-ghost" onClick={handleGetHold}>Query</button>
        </div>
        <ResultBox value={ghResult.msg} ok={ghResult.ok} />
      </FnBlock>

      <FnBlock name="getTokenConfig(token)" divider>
        <LabeledInput label="Token">
          <select value={gtToken} onChange={e => setGtToken(e.target.value)}>
            <option value="">— select —</option>
            {tokenOptions}
          </select>
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-ghost" onClick={handleGetTokenConfig}>Query</button>
        </div>
        <ResultBox value={gtResult.msg} ok={gtResult.ok} />
      </FnBlock>

    </Section>
  )
}
