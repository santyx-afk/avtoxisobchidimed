-- ============================================================
-- Dimed Salary — Supabase sxemasi
-- Supabase Dashboard -> SQL Editor da ishga tushiring.
-- ============================================================

-- UUID generatsiyasi uchun
create extension if not exists pgcrypto;

-- ---------- Ishchilar ----------
create table if not exists public.employees (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                       -- IVMS dagi ism bilan aynan bir xil
  ivms_person_id text,                                -- IVMS "Идентификатор человека" (ixtiyoriy)
  calc_type      text not null default 'fix'          -- 'fix', 'daily' yoki 'hourly'
                 check (calc_type in ('fix', 'hourly', 'daily')),
  monthly_salary integer,                             -- fix oylik uchun (so'm)
  hourly_rate    integer,                             -- soatbay uchun (so'm/soat)
  daily_rate     integer,                             -- kunbay uchun (so'm/kun)
  work_start     time not null default '08:00',
  work_end       time not null default '17:00',
  lunch_minutes  integer not null default 60,
  department     text,
  position       text,
  is_active      boolean not null default true,
  -- Individual sozlamalar (NULL bo'lsa — umumiy sozlamadan foydalanadi)
  work_days            jsonb,     -- ishlaydigan hafta kunlari, masalan [1,2,3,4,5,6]
  grace_period_min     integer,   -- kechikish imtiyozi (override)
  late_penalty_per_min integer,   -- kech qolish jarimasi (override)
  overtime_multiplier  numeric,   -- overtime koeffitsienti (override)
  weekend_multiplier   numeric,   -- dam olish koeffitsienti (override)
  created_at     timestamptz not null default now()
);

create index if not exists employees_name_idx on public.employees (name);

-- Mavjud bazaga ustunlarni qo'shish (eski o'rnatishlar uchun — idempotent)
alter table public.employees add column if not exists work_days            jsonb;
alter table public.employees add column if not exists grace_period_min     integer;
alter table public.employees add column if not exists late_penalty_per_min integer;
alter table public.employees add column if not exists overtime_multiplier  numeric;
alter table public.employees add column if not exists weekend_multiplier   numeric;
alter table public.employees add column if not exists daily_rate           integer;
alter table public.employees add column if not exists ivms_person_id       text;

-- IVMS ID bo'yicha moslash (bir xil ismlilarni ajratish uchun) — takrorlanmas
create unique index if not exists employees_ivms_person_id_key
  on public.employees (ivms_person_id) where ivms_person_id is not null;

-- calc_type check ni yangilash (kunbay/'daily' qo'shildi) — eski o'rnatishlar uchun
alter table public.employees drop constraint if exists employees_calc_type_check;
alter table public.employees add constraint employees_calc_type_check
  check (calc_type in ('fix', 'hourly', 'daily'));

-- ---------- Oylik hisobotlar (yuklangan fayllar) ----------
create table if not exists public.monthly_reports (
  id          uuid primary key default gen_random_uuid(),
  month       text not null,                          -- 'YYYY-MM'
  uploaded_at timestamptz not null default now(),
  file_name   text,
  source      text not null default 'manual'          -- 'manual' yoki 'agent'
              check (source in ('manual', 'agent'))
);

create index if not exists monthly_reports_month_idx on public.monthly_reports (month);

-- ---------- Kunlik attendance yozuvlari ----------
create table if not exists public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid references public.employees (id) on delete cascade,
  report_id        uuid references public.monthly_reports (id) on delete cascade,
  date             date not null,
  day_of_week      text,
  check_in         time,                              -- NULL = kelmagan
  check_out        time,                              -- NULL = kelmagan yoki faqat kirgan
  is_weekend       boolean not null default false,
  worked_minutes   integer default 0,
  late_minutes     integer not null default 0,
  overtime_minutes integer not null default 0
);

create index if not exists attendance_report_idx on public.attendance_records (report_id);
create index if not exists attendance_employee_idx on public.attendance_records (employee_id);

-- ---------- Oylik hisob natijalari ----------
create table if not exists public.salary_calculations (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid references public.employees (id) on delete cascade,
  report_id          uuid references public.monthly_reports (id) on delete cascade,
  work_days          integer default 0,               -- necha kun kelgan
  expected_work_days integer default 0,               -- necha kun kelishi kerak edi
  total_hours        numeric default 0,
  regular_hours      numeric default 0,
  overtime_hours     numeric default 0,
  weekend_hours      numeric default 0,
  late_count         integer default 0,
  total_late_minutes integer default 0,
  base_salary        numeric default 0,               -- belgilangan yoki hisoblangan baza
  calculated_salary  numeric default 0,               -- attendance asosidagi baza
  overtime_pay       numeric default 0,
  weekend_pay        numeric default 0,
  penalties          numeric default 0,
  advance_deduction  numeric default 0,
  net_salary         numeric default 0,
  difference         numeric default 0,               -- belgilangan vs hisoblangan farq
  notes              text                             -- farq sabablari (batafsil)
);

create index if not exists salary_report_idx on public.salary_calculations (report_id);
create index if not exists salary_employee_idx on public.salary_calculations (employee_id);

-- ---------- Avanslar ----------
create table if not exists public.advances (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees (id) on delete cascade,
  amount      integer not null,
  date        date not null default current_date,
  reason      text,
  month       text not null                           -- 'YYYY-MM' qaysi oyga tegishli
);

create index if not exists advances_month_idx on public.advances (month);
create index if not exists advances_employee_idx on public.advances (employee_id);

-- ---------- Sozlamalar ----------
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

-- Standart sozlamalar
insert into public.settings (key, value)
values ('app', jsonb_build_object(
  'late_penalty_per_min', 500,
  'grace_period_min', 5,
  'overtime_multiplier', 1.5,
  'weekend_multiplier', 2,
  'weekend_days', jsonb_build_array(0),
  'agent', jsonb_build_object('enabled', false, 'run_day', 1, 'run_hour', 10, 'last_run', null, 'last_status', 'idle')
))
on conflict (key) do nothing;

-- ============================================================
-- RLS (Row Level Security) — faqat 'staff' rolidagi foydalanuvchilar
-- ------------------------------------------------------------
-- Ilova Supabase Auth (email+parol) bilan ishlaydi. Rol JWT dagi
-- app_metadata.role dan olinadi — uni faqat administrator (SQL / servis kalit)
-- o'zgartira oladi, foydalanuvchi o'zi emas. Shuning uchun kimdir ro'yxatdan
-- o'tib olsa ham (sign up), 'staff' roli bo'lmasa hech narsani ko'rmaydi.
--   'staff' — ilova foydalanuvchilari (admin, buxgalter, direktor): to'liq ruxsat
--   'agent' — IVMS agent: faqat ivms-reports bucketiga fayl yuklaydi
--
-- Rol berish (SQL Editor). Rol berilgandan keyin foydalanuvchi qayta kirishi kerak:
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"staff"}'::jsonb
--    where email in ('admin@dimed.uz', 'buxgalter@dimed.uz', 'direktor@dimed.uz');
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"agent"}'::jsonb
--    where email = 'agent@dimed.uz';
--
-- Fayl qayta ishga tushirilsa ham xavfsiz (idempotent): eski ochiq "allow_all"
-- siyosatlari o'chiriladi, anon (kalitsiz/login'siz) kirish yopiladi.
-- ============================================================
create or replace function public.app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

alter table public.employees            enable row level security;
alter table public.monthly_reports      enable row level security;
alter table public.attendance_records   enable row level security;
alter table public.salary_calculations  enable row level security;
alter table public.advances             enable row level security;
alter table public.settings             enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'employees','monthly_reports','attendance_records','salary_calculations','advances','settings'
  ]
  loop
    execute format('drop policy if exists "allow_all" on public.%I;', t);
    execute format('drop policy if exists "auth_all" on public.%I;', t);
    execute format('drop policy if exists "staff_all" on public.%I;', t);
    execute format(
      'create policy "staff_all" on public.%I for all to authenticated '
      || 'using ((select public.app_role()) = ''staff'') '
      || 'with check ((select public.app_role()) = ''staff'');',
      t
    );
    execute format('revoke all on table public.%I from anon;', t);
  end loop;
end $$;

-- ============================================================
-- Storage bucket (IVMS agent yuklaydigan fayllar uchun)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('ivms-reports', 'ivms-reports', false)
on conflict (id) do nothing;

drop policy if exists "ivms_all" on storage.objects;
drop policy if exists "ivms_staff" on storage.objects;
drop policy if exists "ivms_agent_insert" on storage.objects;
drop policy if exists "ivms_agent_select" on storage.objects;
drop policy if exists "ivms_agent_update" on storage.objects;

-- Ilova (staff): o'qish, yuklash, o'chirish
create policy "ivms_staff" on storage.objects for all to authenticated
  using (bucket_id = 'ivms-reports' and (select public.app_role()) = 'staff')
  with check (bucket_id = 'ivms-reports' and (select public.app_role()) = 'staff');

-- Agent: faqat shu bucketga yuklaydi (x-upsert uchun select+update ham kerak), o'chira olmaydi
create policy "ivms_agent_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'ivms-reports' and (select public.app_role()) = 'agent');
create policy "ivms_agent_select" on storage.objects for select to authenticated
  using (bucket_id = 'ivms-reports' and (select public.app_role()) = 'agent');
create policy "ivms_agent_update" on storage.objects for update to authenticated
  using (bucket_id = 'ivms-reports' and (select public.app_role()) = 'agent')
  with check (bucket_id = 'ivms-reports' and (select public.app_role()) = 'agent');
