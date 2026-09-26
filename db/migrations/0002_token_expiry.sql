-- Token expiry (TTL) and a name snapshot on usage rows so history survives token deletion. Idempotent.

alter table api_tokens add column if not exists expires_at timestamptz;
create index if not exists api_tokens_expires_idx on api_tokens (expires_at) where expires_at is not null;

alter table usage_events add column if not exists token_name text;
