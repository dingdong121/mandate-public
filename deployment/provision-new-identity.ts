// Only for the fresh independent database: no legacy lookup or wallet reassignment.
export async function provisionNewIdentity(db: D1Database, email: string, now: number) {
  const userId = `email_${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(`INSERT INTO email_login_identities(email,user_id,display_name,linked_at,proof_reference)
      VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING`)
      .bind(email,userId,email,now,'verified-email-session:new-mainnet-account'),
    db.prepare(`INSERT INTO platform_users(id,email,display_name,last_seen_at)
      SELECT user_id,email,display_name,? FROM email_login_identities WHERE email=?
      ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at`)
      .bind(new Date(now*1000).toISOString(),email)
  ]);
}
