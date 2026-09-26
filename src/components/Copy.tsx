import { useState } from 'react'
import { Check, Copy } from '@phosphor-icons/react'

export function CopyBlock({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="copyblock">
      <div className="copyblock-head">
        <span>{label}</span>
        <button
          className="btn small ghost"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setDone(true)
              setTimeout(() => setDone(false), 1500)
            })
          }}
        >
          {done ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
          {done ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  )
}
