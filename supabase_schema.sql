-- =========================================================
-- Supabase schema + RLS policies for this website
-- Paste into: Supabase Dashboard -> SQL Editor -> Run
-- =========================================================

-- Enable extensions (usually already enabled in Supabase)
create extension if not exists pgcrypto;

-- -----------------------------
-- USERS (profiles)
-- -----------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- A user can read their own profile
drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
on public.users for select
to authenticated
using (auth.uid() = id);

-- A user can update ONLY their own basic fields (not is_admin)
drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id AND is_admin = is_admin);

-- -----------------------------
-- REVIEWS
-- -----------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rating int not null default 5 check (rating between 1 and 5),
  text text not null,
  approved boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

-- Public can see only approved + not archived
drop policy if exists "Public read approved reviews" on public.reviews;
create policy "Public read approved reviews"
on public.reviews for select
to anon, authenticated
using (approved = true AND archived = false);

-- Anyone can submit a review, but it MUST be pending (approved=false)
drop policy if exists "Anyone can submit review" on public.reviews;
create policy "Anyone can submit review"
on public.reviews for insert
to anon, authenticated
with check (approved = false AND archived = false);

-- Admin can read all reviews
drop policy if exists "Admin read all reviews" on public.reviews;
create policy "Admin read all reviews"
on public.reviews for select
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- Admin can update reviews
drop policy if exists "Admin update reviews" on public.reviews;
create policy "Admin update reviews"
on public.reviews for update
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true))
with check (true);

-- Admin can delete reviews
drop policy if exists "Admin delete reviews" on public.reviews;
create policy "Admin delete reviews"
on public.reviews for delete
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- -----------------------------
-- MESSAGES (contact form)
-- -----------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  message text not null,
  status text not null default 'new' check (status in ('new','read')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Anyone can submit a message
drop policy if exists "Anyone can submit message" on public.messages;
create policy "Anyone can submit message"
on public.messages for insert
to anon, authenticated
with check (archived = false);

-- Admin can read all messages
drop policy if exists "Admin read messages" on public.messages;
create policy "Admin read messages"
on public.messages for select
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- Admin can update messages
drop policy if exists "Admin update messages" on public.messages;
create policy "Admin update messages"
on public.messages for update
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true))
with check (true);

-- Admin can delete messages
drop policy if exists "Admin delete messages" on public.messages;
create policy "Admin delete messages"
on public.messages for delete
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- -----------------------------
-- FILES (metadata for Storage uploads)
-- -----------------------------
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('message','review')),
  owner_id uuid not null,
  path text not null,
  original_name text,
  size bigint,
  mime text,
  created_at timestamptz not null default now()
);

alter table public.files enable row level security;

-- Admin can read all files metadata
drop policy if exists "Admin read files" on public.files;
create policy "Admin read files"
on public.files for select
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- Admin can insert files metadata
drop policy if exists "Admin insert files" on public.files;
create policy "Admin insert files"
on public.files for insert
to anon, authenticated
with check (true);

-- Admin can delete file metadata
drop policy if exists "Admin delete files" on public.files;
create policy "Admin delete files"
on public.files for delete
to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true));

-- NOTE:
-- 1) Create a Storage bucket named: contact-files
-- 2) If you want public downloads, set the bucket to PUBLIC.
--    If you keep it PRIVATE, you must use signed URLs in admin.js.

-- -----------------------------
-- STORAGE POLICIES (contact-files)
-- -----------------------------
-- These policies are OPTIONAL but required if you upload files from the public contact form.
-- They allow:
--   - anon/authenticated users to upload only under: messages/<message_id>/...
--   - admin to read/delete objects (for private buckets)

-- Enable RLS on storage.objects (usually enabled)
alter table storage.objects enable row level security;

drop policy if exists "Public upload contact files" on storage.objects;
create policy "Public upload contact files"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'contact-files'
  and (storage.foldername(name))[1] = 'messages'
);

drop policy if exists "Admin read contact files" on storage.objects;
create policy "Admin read contact files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'contact-files'
  and exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true)
);

drop policy if exists "Admin delete contact files" on storage.objects;
create policy "Admin delete contact files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'contact-files'
  and exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin = true)
);
