import { useState } from 'react'
import type { Address } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { Section } from './Section'
import { FnBlock, LabeledInput, ResultBox } from './Primitives'
import { shortenAddress } from '../lib/utils'

export function UserActionsPanel() {
  const { tokens, coreAddress } = useAppStore()
  const { approveToken, deposit, withdraw } = useContractActions()

  // Approve
  const [appToken,  setAppToken]  = useState('')
  const [appAmt,    setAppAmt]    = useState('1000')
  const [appResult, setAppResult] = useState({ msg: '', ok: null as boolean | null })

  // Deposit
  const [depToken,  setDepToken]  = useState('')
  const [depAmt,    setDepAmt]    = useState('100')
  const [depResult, setDepResult] = useState({ msg: '', ok: null as boolean | null })

  // Withdraw
  const [wdToken,  setWdToken]   = useState('')
  const [wdAmt,    setWdAmt]     = useState('50')
  const [wdResult, setWdResult]  = useState({ msg: '', ok: null as boolean | null })

  const resolveDecimals = (addr: string) =>
    tokens.find(t => t.address.toLowerCase() === addr.toLowerCase())?.decimals ?? 18

  const handleApprove = async () => {
    if (!appToken) { setAppResult({ msg: 'Select token', ok: false }); return }
    setAppResult({ msg: '⏳ approving…', ok: null })
    const res = await approveToken(appToken as Address, appAmt, resolveDecimals(appToken))
    setAppResult(res
      ? { msg: `✓ approved ${appAmt} | tx: ${res.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  const handleDeposit = async () => {
    if (!depToken) { setDepResult({ msg: 'Select token', ok: false }); return }
    setDepResult({ msg: '⏳ sending…', ok: null })
    const res = await deposit(depToken as Address, depAmt, resolveDecimals(depToken))
    setDepResult(res
      ? { msg: `✓ deposited ${depAmt} | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  const handleWithdraw = async () => {
    if (!wdToken) { setWdResult({ msg: 'Select token', ok: false }); return }
    setWdResult({ msg: '⏳ sending…', ok: null })
    const res = await withdraw(wdToken as Address, wdAmt, resolveDecimals(wdToken))
    setWdResult(res
      ? { msg: `✓ withdrew ${wdAmt} | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  const tokenOptions = tokens.map(t => (
    <option key={t.address} value={t.address}>
      {t.symbol} ({shortenAddress(t.address)})
    </option>
  ))

  return (
    <Section title="👤 User Actions" roleReq="Any user">

      <FnBlock name={`ERC20.approve(core, amount) — spender: ${shortenAddress(coreAddress || '0x0000000000000000000000000000000000000000')}`}>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="Token">
            <select value={appToken} onChange={e => setAppToken(e.target.value)}>
              <option value="">— select —</option>
              {tokenOptions}
            </select>
          </LabeledInput>
          <LabeledInput label="Amount (human units)">
            <input type="number" value={appAmt} onChange={e => setAppAmt(e.target.value)} />
          </LabeledInput>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-warning" onClick={handleApprove}>Approve</button>
        </div>
        <ResultBox value={appResult.msg} ok={appResult.ok} />
      </FnBlock>

      <FnBlock name="deposit(token, amount)" divider>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="Token">
            <select value={depToken} onChange={e => setDepToken(e.target.value)}>
              <option value="">— select —</option>
              {tokenOptions}
            </select>
          </LabeledInput>
          <LabeledInput label="Amount">
            <input type="number" value={depAmt} onChange={e => setDepAmt(e.target.value)} />
          </LabeledInput>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleDeposit}>Deposit</button>
        </div>
        <ResultBox value={depResult.msg} ok={depResult.ok} />
      </FnBlock>

      <FnBlock name="withdraw(token, amount)" divider>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="Token">
            <select value={wdToken} onChange={e => setWdToken(e.target.value)}>
              <option value="">— select —</option>
              {tokenOptions}
            </select>
          </LabeledInput>
          <LabeledInput label="Amount">
            <input type="number" value={wdAmt} onChange={e => setWdAmt(e.target.value)} />
          </LabeledInput>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleWithdraw}>Withdraw</button>
        </div>
        <ResultBox value={wdResult.msg} ok={wdResult.ok} />
      </FnBlock>

    </Section>
  )
}
