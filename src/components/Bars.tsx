/** Calls per day as a quiet ink bar chart; errors show as a red segment. */
export function Bars({ data }: { data: { day: string; calls: number; errors: number }[] }) {
  if (!data.length) return <p className="muted">No calls in this period.</p>
  const max = Math.max(...data.map((d) => d.calls), 1)
  return (
    <div className="bars" role="img" aria-label="Calls per day">
      {data.map((d) => (
        <div key={d.day} className="bar-col" title={`${d.day}: ${d.calls} calls, ${d.errors} errors`}>
          <div className="bar" style={{ height: `${(d.calls / max) * 100}%` }}>
            {d.errors > 0 && <div className="bar-err" style={{ height: `${(d.errors / d.calls) * 100}%` }} />}
          </div>
          <span className="bar-label">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}
