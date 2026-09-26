export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skel-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skel" style={{ width: `${88 - (i % 3) * 14}%` }} />
      ))}
    </div>
  )
}

export function SkeletonTiles({ count = 3 }: { count?: number }) {
  return (
    <div className="tiles" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="tile-m">
          <span className="skel lg" style={{ width: '40%' }} />
          <span className="skel" style={{ width: '60%' }} />
        </div>
      ))}
    </div>
  )
}
