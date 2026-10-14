import { SESSION_COOKIE, sessionDigest } from '../lib/email-auth-primitives';
import { provisionNewIdentity } from './provision-new-identity';

/** Only call from the public Worker before invoking the private app handler.
 * No service binding/public route may bypass this boundary. */
export async function authenticatedAppRequest(request: Request, db: D1Database): Promise<Request> {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith('oai-authenticated-user-') || name.toLowerCase().startsWith('x-mandate-identity')) headers.delete(name);
  }
  const cookies=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(`${SESSION_COOKIE}=`));
  const token=cookies.length===1?cookies[0].slice(SESSION_COOKIE.length+1):'';
  if (/^[a-f0-9]{64}$/.test(token)) {
    const session=await db.prepare('SELECT email FROM email_login_sessions WHERE digest=? AND expires_at>?')
      .bind(await sessionDigest(token),Math.floor(Date.now()/1000)).first<{email:string}>();
    if(session) await provisionNewIdentity(db,session.email,Math.floor(Date.now()/1000));
    // Fresh account only, created from the database-verified session above.
    // Never infer a legacy wallet owner from a submitted email or address.
    const identity=await db.prepare(`SELECT i.user_id,i.email,i.display_name FROM email_login_sessions s
      JOIN email_login_identities i ON i.email=s.email
      WHERE s.digest=? AND s.expires_at>?`).bind(await sessionDigest(token),Math.floor(Date.now()/1000)).first<{user_id:string,email:string,display_name:string}>();
    if(identity) {
      headers.set('oai-authenticated-user-id',identity.user_id);
      headers.set('oai-authenticated-user-email',identity.email);
      headers.set('oai-authenticated-user-full-name',encodeURIComponent(identity.display_name));
      headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
    }
  }
  return new Request(request,{headers});
}
