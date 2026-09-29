# Dimed Salary — Windows ilova (to'liq offlayn)

Internet ham, Supabase ham kerak emas. Ma'lumotlar shu kompyuterda saqlanadi, turniketdan (Hikvision, ISAPI)
ma'lumot dastur ichidagi tugma bilan olinadi. Python agent kerak emas.

## O'rnatish (klinika kompyuteri)
1. GitHub → Actions → **Windows ilova** → oxirgi muvaffaqiyatli ishga tushirish → **Dimed-Salary-Windows** (artifact) → `.exe` ni yuklab oling
   (yoki `v*` tegi qo'yilsa — Releases bo'limidan).
2. `Dimed-Salary-Setup-*.exe` ni ishga tushiring → o'rnatish.
3. Birinchi ochilganda **parol o'rnating** (keyin faqat shu parol bilan kirasiz; tiklab bo'lmaydi).
4. **Sozlamalar → Turniket**: IP, login, parol → «Ulanishni tekshirish».
5. **Ishchilar** sahifasida ishchilarni kiriting (yoki birinchi olishdan keyin «Avtomatik qo'shish»).
6. **Oylik hisoblash → Turniketdan olish** → oyni tanlab «Olish».

## Ma'lumot qayerda
`%APPDATA%\Dimed Salary\data\` — `db.json` (baza), `auth.json` (parol hashi), `isapi.json` (terminal sozlamalari;
parol Windows shifrlashi bilan). Har kuni `backups\` ga avtomatik nusxa olinadi (oxirgi 14 kun).
Sozlamalar → «Zaxira nusxani saqlash / tiklash».

## Ishlab chiqish
```
npm install
npm run desktop     # build + Electron ochiladi
npm run dist:win    # Windows o'rnatuvchi (release/*.exe) — Windows da yoki CI da
```
Kod tuzilishi: `desktop/main.cjs` (oyna, IPC), `preload.cjs` (ko'prik), `isapi.cjs` (terminal), `fileStore.cjs` (disk),
`authStore.cjs` (parol). Sayt kodi `window.dimed` orqali ulanadi (`src/lib/desktop.js`).
