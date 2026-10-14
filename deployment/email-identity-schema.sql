-- No existing account/wallet is claimed by this additive schema.
CREATE TABLE IF NOT EXISTS email_login_identities (
 email TEXT PRIMARY KEY,
 user_id TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 linked_at INTEGER NOT NULL,
 proof_reference TEXT NOT NULL
);
