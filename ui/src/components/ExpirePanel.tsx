import { useState } from 'react'
import type { Hex } from 'viem'
import { useContractActions } from '../hooks/useContractActions'
import { Section } from './Section'
import { FnBlock, LabeledInput, ResultBox } from './Primitives'

export function ExpirePanel() {
  const { expire, batchExpire } = useContractActions()

  const [txId,       setTxId]       = useState('')
  const [expResult,  setExpResult]  = useState({ msg: '', ok: null as boolean | null })

  const [batchRaw,   setBatchRaw]   = useState('')
  const [batResult,  setBatResult]  = useState({ msg: '', ok: null as boolean | null })

  const handleExpire = async () => {
    if (!txId.trim()) { setExpResult({ msg: 'Enter txId', ok: false }); return }
    setExpResult({ msg: '⏳ sending…', ok: null })
    const res = await expire(txId.trim() as Hex)
    setExpResult(res
      ? { msg: `✓ expired | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  const handleBatch = async () => {
    const ids = batchRaw.split('\n').map(l => l.trim()).filter(Boolean) as Hex[]
    if (!ids.length) { setBatResult({ msg: 'Enter at least one txId', ok: false }); return }
    setBatResult({ msg: `⏳ expiring ${ids.length} holds…`, ok: null })
    const res = await batchExpire(ids)
    setBatResult(res
      ? { msg: `✓ batchExpired ${ids.length} | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  return (
    <Section title="⏰ Expire Holds" roleReq="Anyone">

      <FnBlock name="expire(txId)">
        <LabeledInput label="txId">
          <input value={txId} onChange={e => setTxId(e.target.value)} placeholder="0x…" />
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-danger" onClick={handleExpire}>Expire</button>
        </div>
        <ResultBox value={expResult.msg} ok={expResult.ok} />
      </FnBlock>

      <FnBlock name="batchExpire(bytes32[])" divider>
        <LabeledInput label="txIds — one per line">
          <textarea
            value={batchRaw}
            onChange={e => setBatchRaw(e.target.value)}
            rows={4}
            placeholder={'0x…\n0x…'}
          />
        </LabeledInput>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-danger" onClick={handleBatch}>Batch Expire</button>
        </div>
        <ResultBox value={batResult.msg} ok={batResult.ok} />
      </FnBlock>

    </Section>
  )
}
