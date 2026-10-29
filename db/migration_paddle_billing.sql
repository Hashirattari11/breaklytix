-- ============================================================================
-- AutoFix API — Paddle Billing database migration (Supabase / PostgreSQL)
-- ============================================================================
-- Apply AFTER db/schema_phase3.sql. Idempotent.
--
-- Adds Paddle customer/subscription columns and a Paddle webhook idempotency
-- table. Mirrors the Stripe columns so both providers can coexist behind
-- PAYMENT_PROVIDER.
-- ============================================================================

alter table if exists users
    add column if not exists paddle_customer_id text;

alter table if exists users
    add column if not exists paddle_subscription_id text;

create index if not exists idx_users_paddle_customer on users(paddle_customer_id);

-- ---------------------------------------------------------------------------
-- paddle_webhook_events — idempotent webhook processing (dedupe by event_id)
-- ---------------------------------------------------------------------------
create table if not exists paddle_webhook_events (
    id          uuid primary key default gen_random_uuid(),
    event_id    text unique not null,
    event_type  text not null,
    processed_at timestamptz not null default now(),
    payload     jsonb
);

create index if not exists idx_paddle_webhook_event_id on paddle_webhook_events(event_id);
