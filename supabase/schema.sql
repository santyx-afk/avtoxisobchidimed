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
  employee_id      uuid references public.employees (id) on delete restrict,
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
  employee_id        uuid references public.employees (id) on delete restrict,
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
  employee_id uuid references public.employees (id) on delete restrict,
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
-- Ma'lumotlar yaxlitligi (eski o'rnatishlar uchun ham — idempotent)
-- ============================================================
-- Hisob tarixi saqlanadi: tarixi bor ishchini o'chirib bo'lmaydi (faqat nofaol qilinadi)
alter table public.attendance_records drop constraint if exists attendance_records_employee_id_fkey;
alter table public.attendance_records add constraint attendance_records_employee_id_fkey
  foreign key (employee_id) references public.employees (id) on delete restrict;
alter table public.salary_calculations drop constraint if exists salary_calculations_employee_id_fkey;
alter table public.salary_calculations add constraint salary_calculations_employee_id_fkey
  foreign key (employee_id) references public.employees (id) on delete restrict;
alter table public.advances drop constraint if exists advances_employee_id_fkey;
alter table public.advances add constraint advances_employee_id_fkey
  foreign key (employee_id) references public.employees (id) on delete restrict;

-- Hisob paytidagi sozlamalar va ishchi shartlari — keyingi o'zgarishlar o'tgan oyga ta'sir qilmaydi
alter table public.monthly_reports     add column if not exists settings_snapshot jsonb;
alter table public.salary_calculations add column if not exists employee_snapshot jsonb;

-- Oyiga bitta hisobot: eski dublikatlardan eng oxirgisi qoladi (ilova ham shuni ko'rsatardi)
delete from public.monthly_reports r
 using public.monthly_reports n
 where r.month = n.month and (r.uploaded_at, r.id) < (n.uploaded_at, n.id);
create unique index if not exists monthly_reports_month_key on public.monthly_reports (month);

-- Bitta hisobotda ishchiga bitta natija
delete from public.salary_calculations a
 using public.salary_calculations b
 where a.report_id = b.report_id and a.employee_id = b.employee_id and a.id < b.id;
create unique index if not exists salary_calculations_report_employee_key
  on public.salary_calculations (report_id, employee_id);

-- Yangi yozuvlar uchun tekshiruvlar (not valid — eski qatorlar tekshirilmaydi)
alter table public.monthly_reports drop constraint if exists monthly_reports_month_format;
alter table public.monthly_reports add constraint monthly_reports_month_format
  check (month ~ '^\d{4}-\d{2}$') not valid;
alter table public.advances drop constraint if exists advances_month_format;
alter table public.advances add constraint advances_month_format
  check (month ~ '^\d{4}-\d{2}$') not valid;
alter table public.advances drop constraint if exists advances_amount_positive;
alter table public.advances add constraint advances_amount_positive check (amount > 0) not valid;

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
-- Hisobotni saqlash — bitta tranzaksiyada (internet uzilsa ham yarim yozilib qolmaydi)
-- security invoker: RLS (staff) amal qiladi
-- ============================================================
create or replace function public.is_month_locked(p_month text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select (value -> 'locked_months') ? p_month from public.settings where key = 'app'), false)
$$;

-- Hisobot natijalarini almashtiradi (qayta hisoblash); snapshot berilsa — u ham yangilanadi
create or replace function public.replace_report_calculations(
  p_report_id uuid,
  p_calculations jsonb,
  p_settings_snapshot jsonb default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_month text;
begin
  select month into v_month from public.monthly_reports where id = p_report_id;
  if v_month is null then
    raise exception 'Hisobot topilmadi';
  end if;
  if public.is_month_locked(v_month) then
    raise exception '% oyi qulflangan', v_month;
  end if;
  if p_settings_snapshot is not null then
    update public.monthly_reports set settings_snapshot = p_settings_snapshot where id = p_report_id;
  end if;
  delete from public.salary_calculations where report_id = p_report_id;
  insert into public.salary_calculations
    (employee_id, report_id, work_days, expected_work_days, total_hours, regular_hours,
     overtime_hours, weekend_hours, late_count, total_late_minutes, base_salary,
     calculated_salary, overtime_pay, weekend_pay, penalties, advance_deduction,
     net_salary, difference, notes, employee_snapshot)
  select c.employee_id, p_report_id, c.work_days, c.expected_work_days, c.total_hours, c.regular_hours,
         c.overtime_hours, c.weekend_hours, c.late_count, c.total_late_minutes, c.base_salary,
         c.calculated_salary, c.overtime_pay, c.weekend_pay, c.penalties, c.advance_deduction,
         c.net_salary, c.difference, c.notes, c.employee_snapshot
  from jsonb_populate_recordset(null::public.salary_calculations, coalesce(p_calculations, '[]'::jsonb)) c;
end
$$;

-- Oy hisobotini to'liq almashtiradi: eski hisobot (cascade) + yangi davomat + natijalar
create or replace function public.save_month_report(
  p_month text,
  p_file_name text,
  p_source text,
  p_attendance jsonb,
  p_calculations jsonb,
  p_settings_snapshot jsonb default null
)
returns public.monthly_reports
language plpgsql
set search_path = ''
as $$
declare
  r public.monthly_reports;
begin
  if public.is_month_locked(p_month) then
    raise exception '% oyi qulflangan', p_month;
  end if;
  delete from public.monthly_reports where month = p_month;
  insert into public.monthly_reports (month, file_name, source, settings_snapshot)
  values (p_month, p_file_name, coalesce(p_source, 'manual'), p_settings_snapshot)
  returning * into r;

  insert into public.attendance_records
    (employee_id, report_id, date, day_of_week, check_in, check_out,
     is_weekend, worked_minutes, late_minutes, overtime_minutes)
  select a.employee_id, r.id, a.date, a.day_of_week, a.check_in, a.check_out,
         coalesce(a.is_weekend, false), coalesce(a.worked_minutes, 0),
         coalesce(a.late_minutes, 0), coalesce(a.overtime_minutes, 0)
  from jsonb_populate_recordset(null::public.attendance_records, coalesce(p_attendance, '[]'::jsonb)) a;

  perform public.replace_report_calculations(r.id, p_calculations);
  return r;
end
$$;

revoke all on function public.replace_report_calculations(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_report_calculations(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.save_month_report(text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_month_report(text, text, text, jsonb, jsonb, jsonb) to authenticated;

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
