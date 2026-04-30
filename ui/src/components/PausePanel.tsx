import { useState } from 'react'
import { useAppStore } from '../store'
import { useContractActions } from '../hooks/useContractActions'
import { Section } from './Section'
import { ResultBox } from './Primitives'

export function PausePanel() {
  const { isPaused } = useAppStore()
  const { pause, unpause } = useContractActions()
  const [result, setResult] = useState({ msg: '', ok: null as boolean | null })

  const doPause = async () => {
    setResult({ msg: '⏳ pausing…', ok: null })
    const res = await pause()
    setResult(res
      ? { msg: `✓ paused | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  const doUnpause = async () => {
    setResult({ msg: '⏳ unpausing…', ok: null })
    const res = await unpause()
    setResult(res
      ? { msg: `✓ unpaused | tx: ${res.hash.slice(0, 14)}…`, ok: true }
      : { msg: '✗ failed', ok: false },
    )
  }

  return (
    <Section title="⏸ Pause Control" roleReq="PAUSER_ROLE">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-slate-400">Contract status:</span>
        <span
          className={`font-bold text-sm ${isPaused ? 'text-red-400' : 'text-green-400'}`}
        >
          {isPaused ? '⛔ PAUSED' : '✅ ACTIVE'}
        </span>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-warning" onClick={doPause}>pause()</button>
        <button className="btn btn-success" onClick={doUnpause}>unpause()</button>
      </div>
      <ResultBox value={result.msg} ok={result.ok} />
    </Section>
  )
}
