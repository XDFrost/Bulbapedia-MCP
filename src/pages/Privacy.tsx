import { Layout } from '../components/Layout.tsx'
import type { MeState } from '../lib/useMe.ts'

export function Privacy({ me }: { me: MeState }) {
  return (
    <Layout me={me}>
      <div className="prose" style={{ paddingTop: 16 }}>
        <h1 className="title">What we store</h1>
        <p>This server keeps the minimum it needs to hand out tokens and show usage. Everything lives in one Postgres database.</p>
        <h2 className="page-title">Your account</h2>
        <ul>
          <li>Your Google account id, email, display name, and avatar URL, refreshed at each login.</li>
          <li>Whether you are an admin, and when you joined and last signed in.</li>
        </ul>
        <h2 className="page-title">Sessions and tokens</h2>
        <ul>
          <li>A hash of your browser session cookie, its expiry, and your browser's user agent. Sessions last 30 days.</li>
          <li>A hash of each API token, its name, the first ten characters for display, its expiry, and when it was last used. The token itself is never stored.</li>
        </ul>
        <h2 className="page-title">Usage</h2>
        <ul>
          <li>For every tool call: the tool name, the arguments you sent, whether it succeeded, the error text if not, and the duration.</li>
          <li>Which of your tokens made the call, by name, kept even after that token is deleted.</li>
        </ul>
        <h2 className="page-title">What we do not store</h2>
        <ul>
          <li>Google access or refresh tokens. The sign-in token is verified once and discarded.</li>
          <li>Passwords. There are none.</li>
          <li>Bulbapedia content. Responses are cached briefly at the edge and not written to the database.</li>
        </ul>
        <p className="muted">Signing out revokes your session. Revoking a token stops it immediately. Expired tokens are removed automatically.</p>
      </div>
    </Layout>
  )
}
