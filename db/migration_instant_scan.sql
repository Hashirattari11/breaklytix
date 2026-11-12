-- ============================================================================
-- Breaklytix — Instant Repo Scan (additive migration)
-- ============================================================================
-- Anonymous public-repo scanner. Privacy rules baked into the schema:
--   * `ip_hash` stores ONLY a salted SHA-256 hash — never a raw IP address.
--   * `result_json` contains safe evidence strings only (env-var NAMES,
--     package names, file paths, line numbers). File contents and secret
--     VALUES are never written.
--   * `email` is optional and only set after an explicit post-result opt-in.
--   * RLS stays OFF, matching the rest of the schema: the FastAPI backend is
--     the only Supabase client and uses the service-role key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- instant_scans: one row per stored public scan (also the 24h cache)
-- ---------------------------------------------------------------------------
create table if not exists instant_scans (
  id             uuid primary key default gen_random_uuid(),
  repo_full_name text not null,                    -- canonical "owner/repo"
  result_json    jsonb not null,                   -- safe summary, no file contents
  partial        boolean not null default false,   -- file/time cap was hit
  duration_ms    integer not null default 0,
  ip_hash        text,                             -- salted SHA-256, never a raw IP
  email          text,                             -- post-result opt-in only
  created_at     timestamptz not null default now()
);

create index if not exists idx_instant_scans_repo_time
  on instant_scans(repo_full_name, created_at desc);

create index if not exists idx_instant_scans_ip_time
  on instant_scans(ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- leads: email capture after a result (source lets us separate funnels)
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  repo       text,
  source     text not null default 'instant_scan',
  created_at timestamptz not null default now(),
  -- Re-submitting the same email for the same repo is a no-op, not a dup row.
  unique (email, repo, source)
);

create index if not exists idx_leads_created on leads(created_at desc);
create index if not exists idx_leads_source on leads(source);

-- ---------------------------------------------------------------------------
-- instant_scan_events: first-party funnel events (no PII)
-- ---------------------------------------------------------------------------
create table if not exists instant_scan_events (
  id             uuid primary key default gen_random_uuid(),
  event          text not null,                    -- scan_started | scan_completed | email_captured | share_clicked | badge_copied
  scan_id        uuid,                             -- intentionally not FK-cascaded (events outlive scans)
  repo_full_name text,
  ip_hash        text,
  props          jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_instant_scan_events_name_time
  on instant_scan_events(event, created_at desc);
create index if not exists idx_instant_scan_events_scan
  on instant_scan_events(scan_id);
