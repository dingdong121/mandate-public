-- Additive, independent auth namespace. No legacy records or wallet claims.
CREATE TABLE IF NOT EXISTS email_login_challenges (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, digest TEXT NOT NULL,
 created_at INTEGER NOT NULL, day TEXT NOT NULL, expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0,
 delivered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS email_login_by_email ON email_login_challenges(email, created_at);
CREATE INDEX IF NOT EXISTS email_login_by_day ON email_login_challenges(day);
CREATE TRIGGER IF NOT EXISTS email_login_send_limit BEFORE INSERT ON email_login_challenges
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM email_login_challenges WHERE email=NEW.email AND created_at>NEW.created_at-60)
 THEN RAISE(ABORT,'email_send_cooldown') END;
 SELECT CASE WHEN (SELECT count(*) FROM email_login_challenges WHERE day=NEW.day)>=80
 THEN RAISE(ABORT,'email_daily_limit') END;
END;
CREATE TABLE IF NOT EXISTS email_login_sessions (
 digest TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL
);
