import { generateOtp, generateSessionToken, normalizeLoginEmail, otpDigest, sessionDigest, sessionCookie, SESSION_COOKIE, OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS, SESSION_TTL_SECONDS } from '../lib/email-auth-primitives';

export interface LoginEnv { DB: D1Database; RESEND_API_KEY?: string; EMAIL_AUTH_SECRET?: string; EMAIL_LOGIN_ENABLED?: string }
const json = (body: unknown, status = 200, headers = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
export async function emailLogin(request: Request, env: LoginEnv): Promise<Response> {
  if (env.EMAIL_LOGIN_ENABLED !== 'enabled' || !env.RESEND_API_KEY || !env.EMAIL_AUTH_SECRET || env.EMAIL_AUTH_SECRET.length < 32) return json({ error: 'Email login is not configured' }, 503);
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/auth/session') {
    const token = readToken(request);
    if (!token) return json({ authenticated: false }, 401);
    const record = await env.DB.prepare('SELECT email FROM email_login_sessions WHERE digest=? AND expires_at>?').bind(await sessionDigest(token), Math.floor(Date.now()/1000)).first<{email:string}>();
    // No automatic mapping to historic user IDs or wallets.
    return record ? json({ authenticated: true, email: record.email }) : json({ authenticated: false }, 401);
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'Same-origin request required'},403);
  if (path === '/auth/logout') {
    const token = readToken(request);
    if(token) await env.DB.prepare('DELETE FROM email_login_sessions WHERE digest=?').bind(await sessionDigest(token)).run();
    return json({ok:true},200,{'set-cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`});
  }
  if (!['/auth/send','/auth/verify'].includes(path)) return json({error:'Not found'},404);
  const raw = await request.text();
  if (raw.length > 2048) return json({error:'Request too large'},413);
  let body: {email?:unknown; challengeId?:unknown; code?:unknown};
  let email: string;
  try { body=JSON.parse(raw); email=normalizeLoginEmail(body.email); } catch {return json({error:'Invalid request'},400);}
  const now=Math.floor(Date.now()/1000);
  if(path==='/auth/send') {
    const id=crypto.randomUUID(), code=generateOtp();
    try {
      // Trigger checks and INSERT are one atomic reservation. Failed/uncertain
      // sends retain the reservation; never retry the provider automatically.
      await env.DB.prepare('INSERT INTO email_login_challenges(id,email,digest,created_at,day,expires_at) VALUES (?,?,?,?,?,?)')
        .bind(id,email,await otpDigest(env.EMAIL_AUTH_SECRET,id,email,code),now,new Date(now*1000).toISOString().slice(0,10),now+OTP_TTL_SECONDS).run();
    } catch(error) {
      const message=String(error);
      if(message.includes('email_send_cooldown')||message.includes('email_daily_limit')) return json({error:'Sending limit reached. Please try later.'},429,{'retry-after':'60'});
      return json({error:'Login temporarily unavailable'},503);
    }
    try {
      const result=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','idempotency-key':id},body:JSON.stringify({from:'Mandate <login@mandate.page>',to:[email],subject:'Your Mandate login code',text:`Your Mandate login code is ${code}. It expires in 10 minutes. Do not share it.`})});
      if(!result.ok) return json({error:'Email could not be sent. Please try later.'},503);
      await env.DB.prepare('UPDATE email_login_challenges SET delivered=1 WHERE id=?').bind(id).run();
      return json({challengeId:id,expiresIn:OTP_TTL_SECONDS});
    } catch {return json({error:'Email delivery status is unavailable. Please wait before trying again.'},503);}
  }
  if(typeof body.challengeId!=='string'||! /^[a-f0-9-]{36}$/.test(body.challengeId)||typeof body.code!=='string'||! /^\d{6}$/.test(body.code)) return json({error:'Invalid request'},400);
  const digest=await otpDigest(env.EMAIL_AUTH_SECRET,body.challengeId,email,body.code);
  const token=generateSessionToken(), tokenDigest=await sessionDigest(token);
  // Atomic UPDATE ensures concurrent verification can consume a code only once.
  const consumed=await env.DB.prepare('UPDATE email_login_challenges SET attempts=attempts+1, consumed=CASE WHEN digest=? THEN 1 ELSE 0 END WHERE id=? AND email=? AND delivered=1 AND consumed=0 AND expires_at>? AND attempts<? RETURNING consumed')
    .bind(digest,body.challengeId,email,now,OTP_MAX_ATTEMPTS).first<{consumed:number}>();
  if(!consumed?.consumed) return json({error:'Invalid or expired code'},401);
  await env.DB.prepare('INSERT INTO email_login_sessions(digest,email,expires_at) VALUES (?,?,?)').bind(tokenDigest,email,now+SESSION_TTL_SECONDS).run();
  return json({authenticated:true},200,{'set-cookie':sessionCookie(token)});
}
function readToken(request: Request): string|null {
  const values=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(`${SESSION_COOKIE}=`));
  if(values.length!==1)return null;
  const value=values[0].slice(SESSION_COOKIE.length+1);
  return /^[a-f0-9]{64}$/.test(value)?value:null;
}
