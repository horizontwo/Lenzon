/**
 * STUB — bring your own auth.
 *
 * The Studio example surfaces (`app/studio`, `app/studio2`) gate access behind
 * a signed-in user. In the production Lenzon backend this reads a session
 * cookie and resolves the user from the database; that wiring is intentionally
 * omitted from this open example so it carries no session, database, or
 * provider details.
 *
 * Default behavior here:
 *   - If `STUDIO_DEV_EMAIL` is set, returns that as the signed-in user, so you
 *     can run the pages locally without standing up real auth.
 *   - Otherwise returns `null`, which sends the page to `/login`.
 *
 * To integrate your own auth, replace the body of `getOptionalUserFromCookies`
 * with your real session lookup and return an object with at least an `email`
 * (used to check the `STUDIO_ALLOWED_EMAILS` allowlist), or `null` when no
 * user is signed in. See this folder's README for the full integration notes.
 */

export interface StudioUser {
  /** Checked against STUDIO_ALLOWED_EMAILS to authorize Studio access. */
  email: string;
}

export async function getOptionalUserFromCookies(): Promise<StudioUser | null> {
  const devEmail = process.env.STUDIO_DEV_EMAIL?.trim();
  if (devEmail) return { email: devEmail };
  return null;
}
