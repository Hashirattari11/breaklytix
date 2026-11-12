-- Instant Repo Scan: user linkage + signup tracking.
--
-- `instant_scans.user_id` lets a visitor who sign-ups via the post-scan CTA
-- ("Continue with GitHub" / "Add to my dashboard") be tied to the account that
-- owns the stored scan. Anonymous scans (the public funnel) stay NULL.

alter table instant_scans
  add column if not exists user_id uuid;

create index if not exists idx_instant_scans_user_id on instant_scans(user_id);
