BEGIN;

-- Password-reset links are stored as SHA-256 hashes only. The raw token is
-- delivered to the user and is never persisted in this table.
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES public.users(id)
    ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL
    CHECK (status IN ('PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  expired_at timestamptz,
  revoked_at timestamptz,
  consumed_at timestamptz,
  CONSTRAINT password_reset_tokens_hash_format_ck
    CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_created
  ON public.password_reset_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_pending_expiry
  ON public.password_reset_tokens (expires_at)
  WHERE status = 'PENDING';

-- Rate-limit identifiers are HMAC-SHA256 hashes so raw emails, IP addresses,
-- and reset tokens are not stored in the limiter table.
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  scope varchar(64) NOT NULL,
  key_hash varchar(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1
    CHECK (attempt_count >= 1),
  window_ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (scope, key_hash),
  CONSTRAINT auth_rate_limits_key_hash_format_ck
    CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT auth_rate_limits_window_ck
    CHECK (window_ends_at > window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window_ends
  ON public.auth_rate_limits (window_ends_at);

COMMIT;
