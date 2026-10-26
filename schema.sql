-- Run once in Supabase SQL Editor. Never expose service_role key to browser.
create extension if not exists pgcrypto;
create table public.team_members (user_id uuid primary key references auth.users(id) on delete cascade, email text not null, role text not null default 'staff' check(role in ('admin','staff')), active boolean not null default true, created_at timestamptz default now());
create function public.is_team_member() returns boolean language sql stable security definer set search_path = '' as $$select exists(select 1 from public.team_members where user_id=auth.uid() and active)$$;
create function public.is_team_admin() returns boolean language sql stable security definer set search_path = '' as $$select exists(select 1 from public.team_members where user_id=auth.uid() and active and role='admin')$$;
create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, sector text not null default 'Tier 1 construction', stage text not null default 'Not contacted', region text default '', value numeric(14,2) default 0, next_contact date, last_contact date, notes text default '', source text default '', created_at timestamptz default now(), updated_at timestamptz default now());
create unique index companies_name_unique on public.companies (lower(name));
create table public.contacts (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, name text not null default '', role text default '', email text not null, phone text default '', verification text default '', opted_out boolean not null default false, created_at timestamptz default now());
create unique index contacts_email_unique on public.contacts (lower(email));
create table public.activities (id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id) on delete set null, contact_id uuid references public.contacts(id) on delete set null, actor_id uuid references auth.users(id), action text not null, details text default '', created_at timestamptz default now());
create table public.campaigns (id uuid primary key default gen_random_uuid(), name text not null, template text not null default 'intro', created_by uuid references auth.users(id), created_at timestamptz default now());
create table public.campaign_recipients (campaign_id uuid references public.campaigns(id) on delete cascade, contact_id uuid references public.contacts(id) on delete cascade, status text not null default 'pending' check(status in ('pending','prepared','sent','replied','opted_out')), updated_at timestamptz default now(), primary key(campaign_id,contact_id));
-- Private by default: only explicitly provisioned active staff may read or write.
do $$ declare t text; begin foreach t in array array['companies','contacts','activities','campaigns','campaign_recipients','team_members'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy team_read on public.team_members for select to authenticated using (public.is_team_member());
create policy admin_manage on public.team_members for all to authenticated using (public.is_team_admin()) with check (public.is_team_admin());
create policy company_team on public.companies for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy contact_team on public.contacts for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy activity_team on public.activities for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy campaign_team on public.campaigns for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy recipients_team on public.campaign_recipients for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
-- Bootstrap the first admin manually after creating their Auth user in Supabase Dashboard:
-- insert into public.team_members(user_id,email,role) values ('AUTH_USER_UUID','you@company.co.uk','admin');

