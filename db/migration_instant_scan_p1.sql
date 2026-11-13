-- Instant Repo Scan P1: queued background scans + commit-SHA cache key + progress.
--
-- Additive only. Run after migration_instant_scan.sql and
-- migration_instant_scan_user_id.sql.

alter table instant_scans
  add column if not exists status text not null default 'completed',
  add column if not exists progress_step text,
  add column if not exists progress_message text,
  add column if not exists commit_sha text,
  add column if not exists files_by_type jsonb,
  add column if not exists files_skipped jsonb,
  add column if not exists error_message text,
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists finished_at timestamptz;

create index if not exists idx_instant_scans_status on instant_scans(status);
create index if not exists idx_instant_scans_repo_sha_time
  on instant_scans(repo_full_name, commit_sha, created_at desc);
