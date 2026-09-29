# Dimed Salary — IVMS Agent

Klinika kompyuteriga o'rnatiladigan Python skript. Har oyning belgilangan
kunida (default — 1-sana, soat 10:00) oldingi oy IVMS "Punch Report" faylini
oladi va **Supabase Storage** ga yuklaydi. Sayt ochilganda faylni avtomatik
ko'rib, oylikni hisoblaydi.

## 📋 Talablar

- Windows (yoki Linux/Mac) kompyuter
- Python 3.9+ ([python.org](https://www.python.org/downloads/) — o'rnatishda
  **"Add Python to PATH"** ni belgilang)
- Internet (Supabase ga yuklash uchun)

## ⚡ Tez o'rnatish (Windows)

1. Ushbu `agent` papkasini klinika kompyuteriga nusxalang.
2. **`install.bat`** ni ikki marta bosing. U:
   - Python va kutubxonalarni tekshiradi/o'rnatadi
   - `config.json` yaratadi va tahrirlash uchun ochadi
   - har kuni 10:00 da ishlaydigan Windows vazifasini sozlaydi
3. `config.json` ni to'ldiring (pastga qarang).
4. Sinash: **`run_agent.bat`** ni bosing (darhol ishga tushiradi).

> `install.bat` vazifani sozlay olmasa, uni **"Run as administrator"** bilan
> qayta ishga tushiring.

## ⚙️ config.json

`config.example.json` dan nusxa olib to'ldiring:

```json
{
  "supabase_url": "https://xxxx.supabase.co",
  "supabase_anon_key": "ANON_PUBLIC_KALIT",
  "agent_email": "agent@dimed.uz",
  "agent_password": "AGENT_PAROLI",
  "bucket": "ivms-reports",
  "mode": "folder",
  "target": "previous",
  "schedule": { "day": 1, "hour": 10 },
  "poll_minutes": 30,
  "watch_folder": "C:\\IVMS-Export",
  "isapi": { "host": "192.168.1.64", "username": "admin", "password": "..." }
}
```

| Maydon | Izoh |
|---|---|
| `supabase_url` | Supabase loyiha URL |
| `supabase_anon_key` | `anon public` kalit (Settings → API) |
| `agent_email` / `agent_password` | Agent uchun alohida Supabase foydalanuvchisi (`agent` roli, pastga qarang) |
| `mode` | `folder` (papkadan) yoki `isapi` (qurilmadan to'g'ridan-to'g'ri) |
| `target` | `previous` (oldingi oy) yoki `current` (joriy oy) |
| `schedule.day` / `.hour` | Qaysi kun va soatda ishlashi |
| `watch_folder` | `folder` rejimi: IVMS-4200 export qiladigan papka |
| `isapi` | `isapi` rejimi: Hikvision qurilma IP, login, parol |

### Agent foydalanuvchisini yaratish

Agent butun bazaga emas, faqat `ivms-reports` bucketiga fayl yuklash huquqiga ega
bo'lishi kerak:

1. Supabase → **Authentication → Users → Add user**: masalan `agent@dimed.uz`
   (kuchli parol, "Auto Confirm User" belgilangan).
2. **SQL Editor** da unga `agent` rolini bering:
   ```sql
   update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"agent"}'::jsonb
    where email = 'agent@dimed.uz';
   ```
3. Email/parolni `config.json` ga yozing.

> Eski `config.json` dagi `supabase_service_key` hali ham ishlaydi, lekin u butun
> bazaga to'liq (admin) ruxsat beradi — agent ogohlantirish yozadi. Yuqoridagi
> usulga o'tib, service kalitni `config.json` dan o'chiring.

## 🔀 Rejimlar

### 1. `folder` (tavsiya etiladi — sodda)

IVMS-4200 ni har oy `watch_folder` ga "Punch Report" eksport qiladigan qilib
sozlang (yoki qo'lda saqlang). Agent papkadagi fayllar **ichidagi sanalarni**
tekshirib, kerakli oyga tegishli eng yangi faylni yuklaydi (fayl nomi muhim emas).

### 2. `isapi` (to'liq avtomatik — qurilmadan to'g'ridan-to'g'ri)

Agent Hikvision terminalidan **ISAPI** orqali barcha davomat hodisalarini (Приход /
Уход / Приход при перерыве / Уход при перерыве va holat bosilmaganlari) yuklab,
sayt o'qiydigan **«Отчет об исходных записях»** formatidagi hisobotni o'zi yaratadi.
IVMS-4200 va papka kerak emas.

`config.json` da:

```json
"mode": "isapi",
"target": "previous",
"isapi": {
  "host": "192.168.1.64",
  "username": "admin",
  "password": "QURILMA_PAROLI",
  "timezone": "+05:00"
}
```

| `isapi` maydoni | Izoh |
|---|---|
| `host` | Terminalning lokal tarmoqdagi IP manzili (agent kompyuteri shu tarmoqda bo'lishi kerak) |
| `username` / `password` | Terminalning admin foydalanuvchisi (Digest autentifikatsiya) |
| `timezone` | Qurilma vaqt mintaqasi (standart `+05:00`) |
| `scheme` / `port` / `verify_tls` | Ixtiyoriy: `https`, port, sertifikatni tekshirish (standart `http`, 80-port) |
| `page_size` | Ixtiyoriy: bir so'rovda nechta hodisa (standart 30) |

**Avval sinab ko'ring:**

```bash
python ivms_agent.py --test-isapi
```

U oxirgi 24 soatdagi hodisalarni oladi va hodisa maydonlarini hamda `attendanceStatus`
bo'yicha sonini chiqaradi. Kutilgan: `checkIn`, `checkOut` (va `undefined` — holat
bosilmaganlar). Faqat `undefined` chiqsa, terminalda davomat holati (Attendance Status)
yoqilmagan yoki boshqa maydon nomi ishlatilgan bo'lishi mumkin.

Eslatmalar:
- Hisobot oy chegarasida ikki chetga yarim sutka (oldingi kun 12:00 – keyingi oyning 1-kuni 12:00)
  qo'shib olinadi, shunda oxirgi kuni boshlangan tungi smena uzilib qolmaydi. Sayt faqat
  shu oyga tegishli smenalarni hisoblaydi (boshqa oy yozuvlari haqida ogohlantirish chiqishi mumkin).
- Sayt yangi fayl oldingi hisobotdan yangiroq bo'lsa oyni qayta yozadi — qo'lda tuzatishlardan
  keyin `--now` bilan qayta yuklamang.
- Joriy oyni ko'rish uchun `"target": "current"` qo'ying.
- Oyda birorta ham Приход/Уход bo'lmasa (davomat tugmalari ishlatilmagan oy), agent uni **yuklamaydi**: yangi qoida bo'yicha hamma kun «kelmagan» bo'lardi. Majburlash uchun `config.json` ga `"allow_no_status": true` qo'shing. Sayt ham agent faylini shu sababdan rad etadi (qo'lda yuklash ruxsat).
- Agent faqat `previous` (oldingi oy) yoki `current` (joriy oy) ni oladi; boshqa oy uchun eski oylarni IVMS-4200 «Punch Report» fayli bilan qo'lda yuklang.
- Oyda birorta ham Приход/Уход bo'lmasa (davomat tugmalari ishlatilmagan oy), agent uni **yuklamaydi**: yangi qoida bo'yicha hamma kun «kelmagan» bo'lardi. Majburlash uchun `config.json` ga `"allow_no_status": true` qo'shing. Sayt ham agent faylini shu sababdan rad etadi (qo'lda yuklash ruxsat).

## 🖥 Ishlatish

```bash
python ivms_agent.py           # jadval bo'yicha (kun/soat kelsa) ishlaydi
python ivms_agent.py --now     # darhol ishga tushiradi
python ivms_agent.py --loop    # doimiy: har N daqiqada tekshiradi
python ivms_agent.py --status  # holatni ko'rsatadi
python ivms_agent.py --test-isapi  # ISAPI ulanishini sinaydi
```

Kompyuter faqat ish vaqtida yoniq bo'lsa ham muammo yo'q: Windows vazifasi har
kuni tekshiradi va vaqti kelgan (hali yuklanmagan) oyni **yoniqda** yuklaydi.
`state.json` takroriy yuklashning oldini oladi.

## 🔒 Xavfsizlik

- Agent `agent` rolidagi alohida foydalanuvchi bilan ishlaydi: u faqat
  `ivms-reports` bucketiga yuklay oladi, oylik jadvallarini ko'ra olmaydi va
  fayllarni o'chira olmaydi. **Service role** kalitni agentga ham, frontendga
  ham qo'ymang.
- `config.json`, `state.json`, `*.log` git ga qo'shilmaydi (`.gitignore`).

## 🧰 Nosozliklarni tuzatish

| Muammo | Yechim |
|---|---|
| `Python topilmadi` | Python ni PATH bilan o'rnating |
| `watch_folder mavjud emas` | `config.json` da to'g'ri yo'lni ko'rsating |
| `Agent login xato (400)` | `agent_email` / `agent_password` ni tekshiring |
| `Yuklash xato (401/403)` | Agent foydalanuvchisiga `agent` roli berilganini va bucket nomini tekshiring |
| Fayl yuklanmayapti | `agent.log` ni ko'ring |
| ISAPI xato | `--test-isapi` ni ishga tushiring; qurilma IP, login/parol (401 — parol noto'g'ri) va tarmoqni tekshiring |
