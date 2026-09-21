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
  calc_type      text not null default 'fix'          -- 'fix' yoki 'hourly'
                 check (calc_type in ('fix', 'hourly')),
  monthly_salary integer,                             -- fix oylik uchun (so'm)
  hourly_rate    integer,                             -- soatbay uchun (so'm)
  work_start     time not null default '08:00',
  work_end       time not null default '17:00',
  lunch_minutes  integer not null default 60,
  department     text,
  position       text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists employees_name_idx on public.employees (name);

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
-- RLS (Row Level Security)
-- Ilova custom login (nickname+parol) ishlatadi, Supabase Auth emas.
-- Shu sabab anon kalit orqali kirish uchun ochiq siyosat qo'yiladi.
-- Bu ichki (klinika) vosita — kalitni maxfiy saqlang.
-- Ko'proq xavfsizlik kerak bo'lsa, Supabase Auth ga o'tkazish tavsiya etiladi.
-- ============================================================
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
    execute format('create policy "allow_all" on public.%I for all using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================
-- Storage bucket (IVMS agent yuklaydigan fayllar uchun)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('ivms-reports', 'ivms-reports', false)
on conflict (id) do nothing;

drop policy if exists "ivms_all" on storage.objects;
create policy "ivms_all" on storage.objects
  for all using (bucket_id = 'ivms-reports') with check (bucket_id = 'ivms-reports');
