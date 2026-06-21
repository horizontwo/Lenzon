import { redirect } from 'next/navigation';
import { getOptionalUserFromCookies } from '@/lib/auth/server-component';
import StudioShell from './StudioShell';

export const metadata = {
  title: 'Studio v2 — Lenzon',
};

function parseAllowedEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export default async function Studio2Page() {
  const user = await getOptionalUserFromCookies();
  if (!user) {
    redirect('/login?next=/studio2');
  }

  const allowed = parseAllowedEmails(process.env.STUDIO_ALLOWED_EMAILS);
  if (!allowed.has(user.email.toLowerCase())) {
    return (
      <>
        <nav className="nav" aria-label="Primary">
          <a href="/" className="brand" aria-label="Lenzon home">
            <img src="/Lenzon_logo.png" alt="Lenzon" />
          </a>
        </nav>
        <main className="auth-shell">
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <h1>Not authorized</h1>
            <p>
              Your account ({user.email}) is not in the Studio allowlist. If
              you think this is a mistake, ask an admin to add your email to
              <code> STUDIO_ALLOWED_EMAILS</code>.
            </p>
            <p>
              <a href="/">Return home</a>
            </p>
          </div>
        </main>
      </>
    );
  }

  return <StudioShell userEmail={user.email} />;
}
