export function Tag({ tone, children }: { tone: 'green' | 'red' | 'yellow' | 'blue' | 'neutral'; children: string }) {
  return <span className={`tag ${tone}`}>{children}</span>
}
