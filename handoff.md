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
| `src/lib/salaryCalc.js` | Hisob dvigateli: `buildShifts` (Punch Report), `buildShiftsFromPunches` (Приход/Уход juftliklari), `calcEmployeeSalary` |
| `src/lib/ivmsParser.js` | IVMS HTML-xls parser: format aniqlash (`punch_report` / `raw_records`), 11 ustunlik chunk, qayta sinxronlash, oyni aniqlash |
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

### 6.1. Yangi format: «Отчет об исходных записях» (KELDI-KETTI)

Xom punchlar (bitta qator = bitta punch). Parser formatni sarlavhadagi «Время» + «Состояние посещения» bo'yicha o'zi aniqlaydi; eski «Punch Report» o'zgarmagan (birinchi kirish / oxirgi chiqish, tushlik ayriladi). ID oldidagi apostrof (`'44`) olib tashlanadi.

**Juftlash qoidalari** (`buildShiftsFromPunches`):
- «Нет» punchlar hisobga olinmaydi.
- Ish vaqti = har bir Приход → keyingi Уход; kundagi barcha juftliklar qo'shiladi. Juftlik **Приход sanasiga** tegishli (tungi smena ham).
- Bir xil holatdagi ketma-ket bosishlar (2 daqiqa ichida): Приход — birinchisi, Уход — oxirgisi.
- Tanaffus: «Уход при перерыве» → «Приход при перерыве» oralig'i ayriladi. **Faqat shu tartib**; juftlanmagan tanaffus punchi e'tiborsiz va izoh yoziladi.
- Уход bosilmagan Приход — juftlik **hisoblanmaydi**; kunda to'liq juftlik bo'lmasa kun «kelmagan», izohda «Ketaman bosilmagan». Приход'siz Уход ham hisoblanmaydi (izoh).
- Ochiq Приход turganda ikkinchi Приход — takror (birinchisi qoladi). Ochiq Приход `max(16 soat, jadval + 4 soat)` dan eski bo'lsa yopilmagan hisoblanadi (unutilgan Уход keyingi kunga ulanmaydi).
- 1 daqiqadan qisqa juftlik (sinov bosishi) hisoblanmaydi.
- Tungi jadvalli xodimda (tugash < boshlanish) «o'rta nuqta»dan oldingi punch oldingi kun smenasiga tegishli.
- **Tushlik (`lunch_minutes`) bu formatda ishlatilmaydi**: ishlangan vaqt = juftliklar − tanaffus; overtime chegarasi ham tushliksiz jadvaldan.
- Kechikish = kunning birinchi Приход vaqti − work_start − grace. Overtime formulasi o'zgarmagan, lekin haqiqiy ishlangan daqiqalardan hisoblanadi.
- Faqat «Нет» bo'lgan kun — kelmagan (dam olish kunida izoh yozilmaydi).

**Saqlash:** `attendance_records.sessions` (`[{in,out}]`, smena sanasi 00:00 dan daqiqalar) va `issues` (`[{type,at}]`). `sessions IS NULL` — eski Punch Report qatori. Snapshot / avans / «Qayta hisoblash» saqlangan juftliklardan ishlaydi (punchlar qayta kerak emas); xom format oyida kunlik qatorlar ham qayta yoziladi (`replace_report_calculations(..., p_attendance)`).

**UI:** yuklashda format, yozuvlar soni va ogohlantirishlar (yopilmagan juftliklar, faqat «Нет» kunlar, Приход'siz Уход, juftlanmagan tanaffus); xodim tafsilotida kunlik juftliklar (`08:02–13:10, 14:00–18:05`) va izoh belgilari.

**Qo'lda tuzatish:** «Oylik hisoblash» sahifasida xodim tafsilotida (xom format oyi, oy qulflanmagan bo'lsa) kun qatoridagi qalamcha bilan juftliklar kiritiladi/o'zgartiriladi/o'chiriladi, «Kun qo'shish» bilan yangi kun qo'shiladi. Saqlangach oy saqlangan juftliklardan qayta hisoblanadi (`recalculateMonth(month, { dayOverrides })`); kunda «Qo'lda tuzatilgan» belgisi va izoh qoladi. Bo'sh juftliklar — kun «kelmagan». Fayl qayta yuklansa, qo'lda tuzatishlar yo'qoladi (oy qayta yoziladi).

**Muammolarni ko'rish va tuzatish:** «Oylik hisoblash» sahifasidagi ogohlantirishlar (yopilmagan juftlik, faqat «Нет», Приход'siz Уход, tanaffus) bosiladi — ishchi/kun ro'yxati ochiladi, «Tuzatish» shu kun tuzatish oynasini darrov ochadi (mavjud vaqtlar oldindan to'ldiriladi). Faqat «Нет» kunda o'sha kundagi birinchi va oxirgi punch ko'rsatiladi; tungi jadvalli xodimda kechqurundan ertasi kuni 10:00 gacha bo'lgan punchlar bitta smena hisoblanadi.

**Sutkalik smena (24 soat):** ishchi formasida «Sutkalik smena» va «Oyiga sutkalar soni» (`employees.duty_24h`, `duty_days`). Bir sutka = bitta smena (Приход sanasiga, Уход ertasi kuni, juftlik ≤ 30 soat); dam olish/bayram, overtime va kelmagan kun jarimasi yo'q; fix: oylik ÷ kutilgan sutkalar × ishlagan sutkalar, kunbay: sutka × kunlik summa. Faqat xom formatda.

**Ikki xil smena (kunduzi/kechasi):** ishchi formasida tumbler (`employees.two_shifts`, oyiga smenalar soni — `duty_days`). Jadval hisobga olinmaydi, faqat Приход/Уход: Приход bugun 17:00, Уход ertasi 08:20 — bitta smena (Приход sanasiga, juftlik ≤ 18 soat). Kechikish, overtime, dam olish kuni va kelmagan kun jarimasi yo'q. Fix: oylik ÷ kutilgan smenalar × ishlagan smenalar; kunbay: smena × summa.

**Guruh stavkalari:** Ishchilar → «Guruh stavkalari» (tungi/kunduzgi hamshira, farrosh; guruh qo'shish/o'chirish mumkin). Guruhga xodimlar tanlanadi, tur (oylik / smena uchun = kunbay) va summa kiritiladi; «Saqlash» tanlangan xodimlarning oyligini shunga o'zgartiradi. Guruhlar `settings.rate_groups` da saqlanadi; xodim bitta guruhda bo'ladi.

**Soatbay** UI dan olib tashlandi (forma, filtr); hisoblash dvigateli eski soatbay ishchilar uchun saqlangan.

⚠️ **Bu o'zgarish sxemani o'zgartiradi — `supabase/schema.sql` ni qayta ishga tushiring** (deploydan oldin): yangi ustunlar `sessions`, `issues`, `replace_report_calculations` yangi imzo (eski 3 argumentli o'chiriladi). Sxema yangilanmagan bo'lsa, xom format saqlanmaydi va «schema.sql ni qayta ishga tushiring» xatosi chiqadi (juftliklar jimgina yo'qolmaydi). Eski format bunga bog'liq emas.

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
npm test        # 162 ta unit test
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

Keyingi PR (`feat/keldi-ketti`): yangi xom format va Приход/Уход juftlash (6.1-bo'lim), sxema o'zgardi.

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
9. **Agent `isapi` rejimi** hamon eski formatdagi (birinchi/oxirgi) HTML yasaydi; `folder` rejimi har ikki formatni o'tkazadi (`file_month()` yangi formatda ham oyni to'g'ri topadi).
10. **Namuna (2026-09) eslatmasi:** Приход/Уход tugmalari 26.09 dan ishlatila boshlagan, undan oldingi kunlar faqat «Нет» — yangi qoida bo'yicha «kelmagan». Bu oy uchun to'liq hisob mantiqsiz chiqadi; yangi format keyingi oydan to'g'ri ishlaydi.
11. **Qurilma tugma nomlari:** «Tanaffusga» = «Приход при перерыве», «Qaytdim» = «Уход при перерыве» — teskari ko'rinadi. Tanaffus qat'iy «Уход при перерыве → Приход при перерыве» tartibida qidiriladi; agar xodimlar nomga qarab bossa, tanaffus ayrilmaydi (izohda ko'rinadi) — qurilmada nomlarni to'g'rilash kerak.
12. **Oy chegarasi:** oxirgi kuni boshlangan tungi smenaning Уход'i keyingi oy faylida bo'ladi — o'tgan oyda «Ketaman bosilmagan» chiqadi.

---

## 12. Muammo chiqsa

| Belgi | Yechim |
|---|---|
| Login sahifasida "Nickname" chiqyapti | Netlify'da Supabase o'zgaruvchilari yo'q: qo'shing va qayta deploy qiling |
| "Email yoki parol xato" | Parol yoki "Auto Confirm"ni tekshiring |
| "Bu hisobga ruxsat berilmagan" | `staff` roli berilmagan (4-bo'lim), keyin qayta login qiling |
| "Bazada yangi funksiya topilmadi" | `supabase/schema.sql`ni qayta ishga tushiring |
| Agent: `Yuklash xato (401/403)` | Agent foydalanuvchisiga `agent` roli berilmagan |
