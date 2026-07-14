-- Substitui o Cloudflare Access por login com e-mail/senha próprio.
ALTER TABLE usuarios ADD COLUMN senha_hash TEXT;
ALTER TABLE usuarios ADD COLUMN senha_salt TEXT;
ALTER TABLE usuarios ADD COLUMN tentativas_falhas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN bloqueado_ate TEXT;
