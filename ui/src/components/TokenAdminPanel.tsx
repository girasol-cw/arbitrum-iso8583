import { useState } from 'react'
import type { Address } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { Section } from './Section'
import { FnBlock, LabeledInput, ResultBox } from './Primitives'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { shortenAddress } from '../lib/utils'

const ROLES = ['DEFAULT_ADMIN_ROLE', 'RELAYER_ROLE', 'PAUSER_ROLE', 'TOKEN_ADMIN_ROLE']

export function TokenAdminPanel() {
  const { tokens } = useAppStore()
  const { configureToken, grantRole, revokeRole } = useContractActions()

  const [cfgToken,   setCfgToken]   = useState('')
  const [cfgAllowed, setCfgAllowed] = useState('true')
  const [cfgResult,  setCfgResult]  = useState({ msg: '', ok: null as boolean | null })

  const [grRole,    setGrRole]    = useState(ROLES[0])
  const [grAccount, setGrAccount] = useState('')
  const [grResult,  setGrResult]  = useState({ msg: '', ok: null as boolean | null })

  const handleConfigureToken = async () => {
    if (!cfgToken) { setCfgResult({ msg: 'Select a token', ok: false }); return }
    setCfgResult({ msg: '⏳ sending…', ok: null })
    const res = await configureToken(cfgToken as Address, cfgAllowed === 'true')
    setCfgResult(res
      ? { msg: `✓ tx: ${res.hash.slice(0, 14)}… gas: ${res.gas}`, ok: true }
      : { msg: '✗ transaction failed — check log', ok: false },
    )
  }

  const handleGrant = async () => {
    if (!grAccount) { setGrResult({ msg: 'Select an account', ok: false }); return }
    setGrResult({ msg: '⏳ sending…', ok: null })
    const res = await grantRole(grRole, grAccount as Address)
    setGrResult(res
      ? { msg: `✓ grantRole(${grRole}) tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed — check log', ok: false },
    )
  }

  const handleRevoke = async () => {
    if (!grAccount) { setGrResult({ msg: 'Select an account', ok: false }); return }
    setGrResult({ msg: '⏳ sending…', ok: null })
    const res = await revokeRole(grRole, grAccount as Address)
    setGrResult(res
      ? { msg: `✓ revokeRole(${grRole}) tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed — check log', ok: false },
    )
  }

  return (
    <Section title="🪙 Token Admin" roleReq="TOKEN_ADMIN_ROLE">

      <FnBlock name="configureToken(token, allowed)">
        <LabeledInput label="Token">
          <select value={cfgToken} onChange={e => setCfgToken(e.target.value)}>
            <option value="">— select token —</option>
            {tokens.map(t => (
              <option key={t.address} value={t.address}>
                {t.symbol} ({shortenAddress(t.address)})
              </option>
            ))}
          </select>
        </LabeledInput>
        <LabeledInput label="Allowed">
          <select value={cfgAllowed} onChange={e => setCfgAllowed(e.target.value)}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleConfigureToken}>Send tx</button>
        </div>
        <ResultBox value={cfgResult.msg} ok={cfgResult.ok} />
      </FnBlock>

      <FnBlock name="grantRole / revokeRole(role, account)" divider>
        <LabeledInput label="Role">
          <select value={grRole} onChange={e => setGrRole(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </LabeledInput>
        <LabeledInput label="Account">
          <select value={grAccount} onChange={e => setGrAccount(e.target.value)}>
            <option value="">— select account —</option>
            {TEST_ACCOUNTS.map(a => (
              <option key={a.address} value={a.address}>
                {a.name} ({shortenAddress(a.address)})
              </option>
            ))}
          </select>
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleGrant}>Grant Role</button>
          <button className="btn btn-ghost"   onClick={handleRevoke}>Revoke Role</button>
        </div>
        <ResultBox value={grResult.msg} ok={grResult.ok} />
      </FnBlock>

    </Section>
  )
}
