# Dimed Salary — Handoff

**Holat (2026-09-24):**
- `main` = `0909da5` (PR #6 merge qilingan).
- CI yashil.
- Sayt onlayn va Supabase rejimida ishlayapti, egasi tomonidan tekshirilgan.

| | |
|---|---|
| Repo | https://github.com/santyx-afk/avtoxisobchidimed |
| Sayt (Netlify) | https://avtohisobchidimed.netlify.app |
| Oxirgi katta o'zgarish | PR #6 — kod sharhi bo'yicha 5 bosqichli tuzatish |

---

## 1. Loyiha nima

Dimed klinikasi uchun oylik hisoblash tizimi:
- Hikvision **IVMS-4200** davomat hisobotidan har bir xodim oyligini hisoblaydi: kech qolish, overtime, dam olish kunlari, avans.
- Belgilangan va hisoblangan oylik orasidagi **farq sabablarini** yozib beradi.

**Stek:**
- React 18 + Vite, Tailwind;
- Supabase (Postgres, Auth, Storage);
- Netlify;
- Python agent (klinika kompyuterida).

---

## 2. Fayllar xaritasi

| Fayl | Vazifasi |
|---|---|
| `src/lib/salaryCalc.js` | Hisob dvigateli: `buildShifts` (kunduzgi/tungi smena), `calcEmployeeSalary` |
| `src/lib/ivmsParser.js` | IVMS HTML-xls parser (11 ustunlik chunk, qayta sinxronlash, oyni aniqlash) |
| `src/lib/readReportFile.js` | Fayl o'qish: UTF-8/UTF-16/1251 HTML yoki haqiqiy `.xls/.xlsx` (SheetJS) |
| `src/lib/runCalculation.js` | Xodimlarni moslash (IVMS ID → ism), `computeReport`, `saveReport`, `recalculateMonth` |
| `src/lib/db.js` | Ma'lumot qatlami: `realDb.js` (Supabase) yoki `mockDb.js` (DEMO, localStorage) |
| `src/lib/realDb.js` | Supabase so'rovlari: sahifalash (`selectAll`), tranzaksiyali RPC'lar |
| `src/lib/auth.jsx`, `authRole.js` | Supabase Auth + `staff` rol tekshiruvi; DEMO'da nickname login |
| `src/lib/agentStorage.js` | Agent yuklagan fayllarni Storage'dan olib avtomatik hisoblash |
| `src/lib/monthLock.js` | Oyni qulflash (`settings.locked_months`) |
| `supabase/schema.sql` | To'liq sxema: jadvallar, RLS, funksiyalar, storage. **Idempotent** |
| `agent/ivms_agent.py` | Python agent: `folder` yoki `isapi` rejim, Storage'ga yuklash |
| `.github/workflows/ci.yml` | CI: lint, test, build, agent sintaksisi |

---

## 3. Muhit

**Netlify environment variables:**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase → Project Settings → API bo'limidan.
- `VITE_IVMS_BUCKET` — ixtiyoriy, standart qiymati `ivms-reports`.
- `VITE_USERS` production'da **kerak emas**, u faqat DEMO rejim uchun.

**Rejimlar:**
- Supabase o'zgaruvchilari bo'sh bo'lsa, sayt **DEMO** rejimda ishlaydi: login `admin`/`admin`, ma'lumotlar brauzerda saqlanadi.
- Ular o'rnatilgan bo'lsa, login **Supabase Auth** orqali (email + parol).

**Supabase:**
- `supabase/schema.sql` SQL Editor'da ishga tushiriladi. Uni qayta ishga tushirish xavfsiz.
- Sxema o'zgargan har commit'dan keyin uni qayta ishga tushiring.

> ⚠️ Akkauntdagi `santyxdb` loyihasi **boshqa ilovaning** (Telegram bot) bazasi. Bu loyiha uchun ishlatilmaydi, u yerda `schema.sql`ni ishga tushirmang, chunki `settings` jadvali to'qnashadi.

---

## 4. Foydalanuvchilar va rollar

Rol `app_metadata.role` maydonida saqlanadi. Uni faqat administrator SQL orqali beradi, foydalanuvchi o'zi o'zgartira olmaydi.

1. Supabase → Authentication → Users → **Add user**. Email + parol kiriting, "Auto Confirm User"ni belgilang.
2. SQL Editor'da rol bering:

```sql
-- xodim (to'liq ruxsat)
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"staff"}'::jsonb
 where email = 'xodim@dimed.uz';

-- IVMS agent (faqat ivms-reports bucketiga yuklash)
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"agent"}'::jsonb
 where email = 'agent@dimed.uz';
```

3. Rol berilgach, foydalanuvchi qayta login qilishi kerak.

Authentication → Sign In / Providers bo'limida **"Allow new users to sign up" o'chirilgan** bo'lishi kerak.

---

## 5. Xavfsizlik modeli

- **Jadvallar:** RLS siyosati `staff_all` — faqat `app_role() = 'staff'` foydalanuvchiga ruxsat beradi. `anon` uchun barcha jadvallar `revoke` qilingan.
- **Storage (`ivms-reports`):**
  - `staff` — to'liq ruxsat;
  - `agent` — faqat insert/select/update, o'chirish yo'q.
- **Frontend:** sessiya saqlanadi (`persistSession`). `staff` roli bo'lmagan hisob kirganda tizimdan chiqariladi.
- **Agent:** `service_role` kalitni ishlatmaydi, `agent` rolidagi foydalanuvchi bilan kiradi.
- **Netlify:** `X-Frame-Options`, `nosniff`, `Referrer-Policy` sarlavhalari o'rnatilgan.

---

## 6. Hisoblash qoidalari (biznes mantiq)

**Hisoblash turlari:**
- **Fix:** kunlik stavka = oylik ÷ kutilgan ish kunlari. Kelmagan har bir kun uchun kunlik stavka ushlanadi.
- **Kunbay:** kunlik summa × kelgan kunlar.
- **Soatbay:** ishlangan soat × stavka.

**Qoidalar:**
- **Kechikish:** kirish − ish boshlanishi − grace. Jarima = daqiqa × narx.
- **Overtime:** faqat jadvaldagi soatlar to'liq ishlangandan keyin: `min(chiqish − ish tugashi, ishlangan − jadval)`.
- **Dam olish / bayram:** koeffitsient bilan to'lanadi. Bayram kutilgan ish kuniga kirmaydi.
- **Bitta punch:** to'liq kun hisoblanadi, izohda "tekshiring" deyiladi. Kechikish faqat punch ish boshiga yaqin bo'lsa yoziladi.
- **Tungi smena** (tugash vaqti < boshlanish vaqti): punchlar smena boshlangan sanaga juftlanadi. Ajratish nuqtasi — smena tugashi va boshlanishi o'rtasi.
- **Oy:** fayldagi eng ko'p uchragan oy olinadi. Boshqa oy yozuvlari hisoblanmaydi va ogohlantirish chiqadi.
- **Xodimlarni moslash:** avval IVMS ID, keyin ism (faqat bir ma'noli bo'lsa).
  - Bir xil ismlilar avtomatik moslanmaydi, ogohlantirish chiqadi.
  - Moslangan xodimga IVMS ID o'zi yoziladi.
- **Snapshot:** hisobotga sozlamalar (`settings_snapshot`), natijaga xodim shartlari (`employee_snapshot`) yoziladi.
  - Avans o'zgarsa, oy o'sha saqlangan shartlar bilan qayta hisoblanadi.
  - «Qayta hisoblash» tugmasi hozirgi shartlarni qo'llaydi.
  - Sozlamalarni saqlash o'tgan oylarni qayta hisoblamaydi.
- **Qulf:** qulflangan oyga hisobot saqlash, qayta hisoblash, avans qo'shish yoki o'chirish mumkin emas. Qulf JS'da ham, RPC'da ham tekshiriladi.

---

## 7. Ma'lumotlar yaxlitligi

- **Tranzaksiyali saqlash:** hisobot `save_month_report(...)` bilan, qayta hisoblash `replace_report_calculations(...)` bilan saqlanadi. Ikkalasi plpgsql funksiya, `security invoker`.
- **Unique:** `monthly_reports(month)` — oyiga bitta hisobot; `salary_calculations(report_id, employee_id)`.
- **FK `restrict`:** tarixi bor xodim o'chirilmaydi, UI uni nofaol qiladi.
- **Sahifalash:** Supabase'dan 1000+ qatorli natijalar sahifalab (`selectAll`) o'qiladi.

---

## 8. IVMS Agent

- **`config.json`:** `supabase_url`, `supabase_anon_key`, `agent_email`, `agent_password`, `mode`, `watch_folder` yoki `isapi`. Namuna: `agent/config.example.json`.
- **`folder` rejimi:** fayl nomiga emas, fayl ichidagi sanalarga qarab kerakli oy fayli tanlanadi.
- **Ishga tushirish:** `install.bat` Windows vazifasini yaratadi (har kuni 10:00). Qo'lda: `python ivms_agent.py --now`.
- **Sayt tomoni:** Dashboard ochilganda Storage'dagi yangi fayllar qayta ishlanadi.
  - Keyinroq qo'lda yuklangan hisobot ustidan yozilmaydi.
  - Xatolar Sozlamalar → IVMS Agent bo'limida ko'rinadi.

---

## 9. Testlar va CI

```bash
npm install
npm test        # 95 ta unit test
npm run lint    # ESLint
npm run build
```

- GitHub Actions har push va PR'da lint, test, build va agent sintaksisini tekshiradi.
- `schema.sql` lokal Postgres 16'da Supabase stub'lari bilan sinalgan: rollar, RLS, tranzaksiya, qulf, FK. Bu stub'lar repoda yo'q.

---

## 10. O'zgarishlar tarixi (PR #6)

| Commit | Bosqich |
|---|---|
| `8f506f1` | Xavfsizlik: Supabase Auth, RLS rollari, agent service key'siz |
| `b5a08c6` | Hisob: bitta punch, overtime, tungi smena, IVMS ID, oy filtri, sahifalash |
| `db4b4e2` | Yaxlitlik: tranzaksiyali RPC, unique, FK restrict, snapshot, agent sync |
| `c2a9655` | Parser: qayta sinxronlash, kodirovkalar, xlsx, kasrli summa |
| `2757f50` | UI tuzatishlar, ESLint, GitHub Actions CI |

---

## 11. Ochiq masalalar (keyingi ishlar)

1. **SheetJS yangilash.** npm'dagi `xlsx@0.18.5`da ma'lum zaifliklar bor, fayl o'qishda ishlatiladi:
   `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
2. **react-router** — `npm audit` moderate zaiflik ko'rsatadi, qulay vaqtda yangilash kerak.
3. **Biznes qarorini tasdiqlash kerak:**
   - bitta punchli kun to'liq kun hisoblanadimi (hozir: ha, "tekshiring" belgisi bilan);
   - kunbay xodimga bayram kuni to'lanadimi (hozir: yo'q, chunki bayram kutilgan ish kuniga kirmaydi).
4. **Rollar:** hamma `staff` bir xil huquqli. Admin va buxgalter farqlanmaydi.
5. **Audit log yo'q:** kim, qachon, nimani o'zgartirgani yozilmaydi.
6. **Tungi smena mantig'i** o'rta nuqta qoidasiga asoslangan. Haqiqiy tungi smena ma'lumotida tekshirib ko'rish kerak.
7. **Agent** o'z holatini bazaga yozmaydi. Sozlamalardagi holat sayt tomonidagi sinxronizatsiya natijasi.
8. **Vaqt mintaqasi:** ISAPI rejimida `+05:00` qattiq yozilgan.

---

## 12. Muammo chiqsa

| Belgi | Yechim |
|---|---|
| Login sahifasida "Nickname" chiqyapti | Netlify'da Supabase o'zgaruvchilari yo'q: qo'shing va qayta deploy qiling |
| "Email yoki parol xato" | Parol yoki "Auto Confirm"ni tekshiring |
| "Bu hisobga ruxsat berilmagan" | `staff` roli berilmagan (4-bo'lim), keyin qayta login qiling |
| "Bazada yangi funksiya topilmadi" | `supabase/schema.sql`ni qayta ishga tushiring |
| Agent: `Yuklash xato (401/403)` | Agent foydalanuvchisiga `agent` roli berilmagan |
