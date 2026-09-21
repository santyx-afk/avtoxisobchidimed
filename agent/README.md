# Dimed Salary — IVMS Agent

Klinika kompyuteriga o'rnatiladigan Python skript. Har oyning belgilangan
kunida (default — 1-sana, soat 10:00) oldingi oy IVMS "Punch Report" faylini
oladi va **Supabase Storage** ga yuklaydi. Sayt ochilганда faylni avtomatik
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
  "supabase_service_key": "SERVICE_ROLE_KEY",
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
| `supabase_service_key` | **Service role** kalit (Settings → API). Faqat agentda saqlanadi! |
| `mode` | `folder` (papkadan) yoki `isapi` (qurilmadan to'g'ridan-to'g'ri) |
| `target` | `previous` (oldingi oy) yoki `current` (joriy oy) |
| `schedule.day` / `.hour` | Qaysi kun va soatda ishlashi |
| `watch_folder` | `folder` rejimi: IVMS-4200 export qiladigan papka |
| `isapi` | `isapi` rejimi: Hikvision qurilma IP, login, parol |

## 🔀 Rejimlar

### 1. `folder` (tavsiya etiladi — sodda)

IVMS-4200 ni har oy `watch_folder` ga "Punch Report" eksport qiladigan qilib
sozlang (yoki qo'lda saqlang). Agent shu papkadagi eng yangi (yoki oy nomiga
mos) faylni oladi va yuklaydi.

### 2. `isapi` (ilg'or — to'liq avtomatik)

Agent Hikvision qurilmasidan **ISAPI** orqali davomat hodisalarini to'g'ridan-
to'g'ri yuklab, IVMS formatidagi HTML hisobotni o'zi yaratadi. IVMS-4200 kerak
emas, lekin qurilma IP va parol kerak.

## 🖥 Ishlatish

```bash
python ivms_agent.py           # jadval bo'yicha (kun/soat kelsa) ishlaydi
python ivms_agent.py --now     # darhol ishga tushiradi
python ivms_agent.py --loop    # doimiy: har N daqiqada tekshiradi
python ivms_agent.py --status  # holatni ko'rsatadi
```

Kompyuter faqat ish vaqtida yoniq bo'lsa ham muammo yo'q: Windows vazifasi har
kuni tekshiradi va vaqti kelgan (hali yuklanmagan) oyni **yoniqda** yuklaydi.
`state.json` takroriy yuklashning oldini oladi.

## 🔒 Xavfsizlik

- **Service role** kalit faqat agent kompyuterida (`config.json`) saqlanadi,
  hech qachon frontendga qo'yilmaydi.
- `config.json`, `state.json`, `*.log` git ga qo'shilmaydi (`.gitignore`).

## 🧰 Nosozliklarni tuzatish

| Muammo | Yechim |
|---|---|
| `Python topilmadi` | Python ni PATH bilan o'rnating |
| `watch_folder mavjud emas` | `config.json` da to'g'ri yo'lni ko'rsating |
| `Yuklash xato (401/403)` | `supabase_service_key` va bucket nomini tekshiring |
| Fayl yuklanmayapti | `agent.log` ni ko'ring |
| ISAPI xato | Qurilma IP, login/parol va tarmoqni tekshiring |
