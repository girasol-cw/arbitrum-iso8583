import { useState, type ReactNode } from 'react'

interface ResultBoxProps {
  value: string
  ok?:   boolean | null
}

export function ResultBox({ value, ok }: ResultBoxProps) {
  const cls = ok === true ? 'ok' : ok === false ? 'error' : ''
  return <div className={`result-box ${cls}`}>{value || '—'}</div>
}

interface LabeledInputProps {
  label:       string
  children:    ReactNode
}

export function LabeledInput({ label, children }: LabeledInputProps) {
  return (
    <div className="input-group">
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

interface FnBlockProps {
  name:     string
  children: ReactNode
  divider?: boolean
}

export function FnBlock({ name, children, divider }: FnBlockProps) {
  return (
    <>
      {divider && <hr className="border-border" />}
      <div>
        <div className="fn-name">{name}</div>
        {children}
      </div>
    </>
  )
}

interface CopyBtnProps { text: string }
export function CopyBtn({ text }: CopyBtnProps) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button
      onClick={copy}
      className="text-[10px] px-1.5 py-0.5 rounded border border-border text-slate-500
                 hover:text-slate-200 hover:border-accent transition-colors"
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}
