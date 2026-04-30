import { useState } from 'react'
import type { Address, Hex } from 'viem'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { Section } from './Section'
import { FnBlock, LabeledInput, ResultBox } from './Primitives'
import { TEST_ACCOUNTS } from '../lib/accounts'
import { randomBytes32, shortenAddress } from '../lib/utils'

export function RelayerActionsPanel() {
  const { tokens } = useAppStore()
  const { authorize, capture, release } = useContractActions()

  // authorize
  const [txId,       setTxId]       = useState('')
  const [authUser,   setAuthUser]   = useState('')
  const [authMerch,  setAuthMerch]  = useState('')
  const [authToken,  setAuthToken]  = useState('')
  const [authAmt,    setAuthAmt]    = useState('50')
  const [authExp,    setAuthExp]    = useState('3600')
  const [authResult, setAuthResult] = useState({ msg: '', ok: null as boolean | null })

  // capture
  const [capTxId,    setCapTxId]    = useState('')
  const [capResult,  setCapResult]  = useState({ msg: '', ok: null as boolean | null })

  // release
  const [relTxId,    setRelTxId]    = useState('')
  const [relResult,  setRelResult]  = useState({ msg: '', ok: null as boolean | null })

  const resolveDecimals = (addr: string) =>
    tokens.find(t => t.address.toLowerCase() === addr.toLowerCase())?.decimals ?? 18

  const handleGenTxId = () => {
    const id = randomBytes32()
    setTxId(id)
  }

  const handleAuthorize = async () => {
    let id = txId.trim()
    if (!id) id = randomBytes32()
    if (!authUser || !authMerch || !authToken) {
      setAuthResult({ msg: 'Fill user, merchant and token', ok: false }); return
    }
    setAuthResult({ msg: '⏳ sending…', ok: null })
    const res = await authorize(
      id as Hex,
      authUser as Address,
      authMerch as Address,
      authToken as Address,
      authAmt,
      resolveDecimals(authToken),
      Number(authExp),
    )
    if (res) {
      const msg = `✓ authorized | txId: ${id.slice(0, 14)}… | tx: ${res.hash.slice(0, 14)}…`
      setAuthResult({ msg, ok: true })
      // propagate txId to capture/release fields
      setCapTxId(id)
      setRelTxId(id)
    } else {
      setAuthResult({ msg: '✗ failed — check log', ok: false })
    }
  }

  const handleCapture = async () => {
    if (!capTxId) { setCapResult({ msg: 'Enter txId', ok: false }); return }
    setCapResult({ msg: '⏳ sending…', ok: null })
    const res = await capture(capTxId.trim() as Hex)
    setCapResult(res
      ? { msg: `✓ captured | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  const handleRelease = async () => {
    if (!relTxId) { setRelResult({ msg: 'Enter txId', ok: false }); return }
    setRelResult({ msg: '⏳ sending…', ok: null })
    const res = await release(relTxId.trim() as Hex)
    setRelResult(res
      ? { msg: `✓ released | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
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
    <Section title="⚡ Relayer Actions" roleReq="RELAYER_ROLE">

      <FnBlock name="authorize(txId, user, merchant, token, amount, expiresAt)">
        <LabeledInput label="txId (bytes32 — leave blank to auto-generate)">
          <div className="flex gap-1.5">
            <input
              value={txId}
              onChange={e => setTxId(e.target.value)}
              placeholder="0x… or leave blank"
              className="flex-1"
            />
            <button className="btn btn-ghost whitespace-nowrap" onClick={handleGenTxId}>
              Gen ID
            </button>
          </div>
        </LabeledInput>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="User">
            <select value={authUser} onChange={e => setAuthUser(e.target.value)}>
              <option value="">— select —</option>
              {accountOptions}
            </select>
          </LabeledInput>
          <LabeledInput label="Merchant">
            <select value={authMerch} onChange={e => setAuthMerch(e.target.value)}>
              <option value="">— select —</option>
              {accountOptions}
            </select>
          </LabeledInput>
          <LabeledInput label="Token">
            <select value={authToken} onChange={e => setAuthToken(e.target.value)}>
              <option value="">— select —</option>
              {tokenOptions}
            </select>
          </LabeledInput>
          <LabeledInput label="Amount (human units)">
            <input type="number" value={authAmt} onChange={e => setAuthAmt(e.target.value)} />
          </LabeledInput>
        </div>
        <LabeledInput label="Expires in (seconds from now)">
          <input type="number" value={authExp} onChange={e => setAuthExp(e.target.value)} />
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary" onClick={handleAuthorize}>Authorize</button>
        </div>
        <ResultBox value={authResult.msg} ok={authResult.ok} />
      </FnBlock>

      <FnBlock name="capture(txId)" divider>
        <LabeledInput label="txId">
          <input value={capTxId} onChange={e => setCapTxId(e.target.value)} placeholder="0x…" />
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-success" onClick={handleCapture}>Capture</button>
        </div>
        <ResultBox value={capResult.msg} ok={capResult.ok} />
      </FnBlock>

      <FnBlock name="release(txId)" divider>
        <LabeledInput label="txId">
          <input value={relTxId} onChange={e => setRelTxId(e.target.value)} placeholder="0x…" />
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-warning" onClick={handleRelease}>Release</button>
        </div>
        <ResultBox value={relResult.msg} ok={relResult.ok} />
      </FnBlock>

    </Section>
  )
}
