import type { ReactNode } from 'react'

interface Props {
  title:    string
  roleReq?: string
  children: ReactNode
}

export function Section({ title, roleReq, children }: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-sm font-semibold flex-1">{title}</h3>
        {roleReq && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-bg border border-border text-slate-500">
            {roleReq}
          </span>
        )}
      </div>
      <div className="card-body space-y-4">{children}</div>
    </div>
  )
}
