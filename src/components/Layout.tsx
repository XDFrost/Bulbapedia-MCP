import type { ReactNode } from 'react'
import { GoogleLogo, SignOut } from '@phosphor-icons/react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { MeState } from '../lib/useMe.ts'

export function Layout({ me, children, marketing = false }: { me: MeState; children: ReactNode; marketing?: boolean }) {
  const navigate = useNavigate()
  const user = me.me?.user
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          Bulbapedia MCP
        </Link>
        <nav aria-label="Primary">
          {user && (
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
          )}
          {me.me?.is_admin && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="spacer" />
        {user ? (
          <div className="userchip">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar-fallback" aria-hidden="true">
                {(user.name ?? user.email)[0]?.toUpperCase()}
              </span>
            )}
            <span className="username">{user.name ?? user.email}</span>
            <button
              className="btn ghost small"
              onClick={() => {
                void me.logout().then(() => navigate('/'))
              }}
            >
              <SignOut size={16} weight="bold" />
              Sign out
            </button>
          </div>
        ) : (
          <a className="btn primary" href="/auth/google">
            <GoogleLogo size={16} weight="bold" />
            Sign in with Google
          </a>
        )}
      </header>
      <main id="main" className={`content${marketing ? ' marketing' : ''}`}>
        {children}
      </main>
      <footer className="foot">
        <div className="foot-inner">
          <span>
            Data from <a href="https://bulbapedia.bulbagarden.net">Bulbapedia</a>, licensed CC BY-NC-SA 2.5.
          </span>
          <span>
            <Link to="/privacy">What we store</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
