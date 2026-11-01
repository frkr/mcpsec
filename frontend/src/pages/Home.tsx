import { Link } from 'react-router'

export function Home() {
  return (
      <main className="page">
      <h1>Welcome to Loco</h1>
      <nav>
        <ul>
          {/* scaffold:nav */}
        </ul>
      </nav>
      <p>
        <Link to="/login">Log in</Link> or{' '}
        <Link to="/register">sign up</Link> to get started.
      </p>
      </main>
  )
}
