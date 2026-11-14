-- Supabase Auth (email OTP) linkage. Additive.
alter table users
  add column if not exists supabase_user_id text;

create unique index if not exists idx_users_supabase_user_id
  on users(supabase_user_id) where supabase_user_id is not null;
