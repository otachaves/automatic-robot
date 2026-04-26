# Hackathon Showcase — Setup Guide

## 1. Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Open the **SQL Editor** and run the schema below
3. Go to **Storage** → New bucket → name it `hackathon` → check **Public bucket**
4. Copy your **Project URL** and **anon public key** from Settings → API

### SQL Schema

```sql
create table projects (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  description text not null,
  link text,
  tools text,
  media_url text,
  media_type text,
  team_photo_url text,
  members jsonb
);

-- Row Level Security
alter table projects enable row level security;

create policy "Anyone can read projects"
  on projects for select using (true);

create policy "Anyone can submit projects"
  on projects for insert with check (true);
```

### Storage Policies (run in SQL Editor)

```sql
create policy "Allow public uploads"
  on storage.objects for insert
  with check (bucket_id = 'hackathon');

create policy "Allow public reads"
  on storage.objects for select
  using (bucket_id = 'hackathon');
```

---

## 2. Local dev

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

---

## 3. GitHub

```bash
git init
git add .
git commit -m "initial commit"
gh repo create hackathon-showcase --public --push
```

---

## 4. Vercel

1. Go to [vercel.com](https://vercel.com) → Add New Project → import your GitHub repo
2. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_BUCKET` = `hackathon`
3. Deploy — Vercel auto-detects Vite, no extra config needed

Every `git push` to `main` auto-deploys.
