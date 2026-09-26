import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout.tsx'
import type { MeState } from '../lib/useMe.ts'

export function NotFound({ me }: { me: MeState }) {
  return (
    <Layout me={me}>
      <div className="prose" style={{ paddingTop: 16 }}>
        <h1 className="title">There is nothing at this address.</h1>
        <p>The page may have moved, or the link was mistyped.</p>
        <p>
          <Link to="/">Back to the start</Link>
        </p>
      </div>
    </Layout>
  )
}
