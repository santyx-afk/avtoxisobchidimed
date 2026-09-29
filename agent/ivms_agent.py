#!/usr/bin/env python3
"""
Dimed Salary — IVMS Agent
=========================
Klinika kompyuterida ishlaydigan agent. Har oyning belgilangan kunida
(default 1-sana) oldingi oy IVMS "Punch Report" faylini oladi va Supabase
Storage ga yuklaydi. Sayt ochilganda faylni avtomatik ko'rib, oylikni hisoblaydi.

2 ta rejim:
  * folder  — IVMS-4200 export qilgan papkadan eng yangi faylni oladi (default)
  * isapi   — Hikvision qurilmasidan (ISAPI) davomat hodisalarini (Приход/Уход
              holatlari bilan) o'zi yuklab, «Отчет об исходных записях» formatidagi
              HTML hisobotni yaratadi

Ishlatish:
  python ivms_agent.py            # jadval bo'yicha (kun/soat kelgan bo'lsa) ishlaydi
  python ivms_agent.py --now      # darhol ishga tushiradi (jadvalga qaramay)
  python ivms_agent.py --loop     # doimiy ishlaydi, har N daqiqada tekshiradi
  python ivms_agent.py --status   # holatni ko'rsatadi
  python ivms_agent.py --test-isapi   # ISAPI ulanishini sinaydi (config.json da mode: isapi)

Konfiguratsiya: config.json (config.example.json dan nusxa oling).
"""
import argparse
import json
import os
import sys
import time
import logging
import re
from datetime import datetime, timedelta
from html import escape
from pathlib import Path

try:
    import requests
except ImportError:
    print("XATO: 'requests' kutubxonasi kerak. O'rnating: pip install -r requirements.txt")
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
STATE_PATH = BASE_DIR / "state.json"
LOG_PATH = BASE_DIR / "agent.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8"), logging.StreamHandler()],
)
log = logging.getLogger("ivms-agent")

REPORT_EXTS = (".xls", ".xlsx", ".html", ".htm", ".mht", ".mhtml")


# ---------------------------------------------------------------- config/state
def load_config():
    if not CONFIG_PATH.exists():
        log.error("config.json topilmadi. config.example.json dan nusxa oling.")
        sys.exit(1)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_state():
    if STATE_PATH.exists():
        try:
            with open(STATE_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"last_month": None, "last_run": None, "last_status": "idle"}


def save_state(state):
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


# ------------------------------------------------------------------ scheduling
def target_month(cfg, now=None):
    """Qaysi oy uchun hisobot (default: oldingi oy)."""
    now = now or datetime.now()
    if cfg.get("target", "previous") == "current":
        return f"{now.year:04d}-{now.month:02d}"
    first = now.replace(day=1)
    prev = first - timedelta(days=1)
    return f"{prev.year:04d}-{prev.month:02d}"


def is_due(cfg, state, now=None):
    """Bugun jadval bo'yicha ishlash vaqti kelganmi va bu oy yuklanmaganmi."""
    now = now or datetime.now()
    sched = cfg.get("schedule", {})
    run_day = int(sched.get("day", 1))
    run_hour = int(sched.get("hour", 10))
    month = target_month(cfg, now)

    if state.get("last_month") == month:
        return False, month  # bu oy allaqachon yuklangan
    if now.day < run_day:
        return False, month
    if now.day == run_day and now.hour < run_hour:
        return False, month
    return True, month


# --------------------------------------------------------------- folder rejimi
DATE_BYTES_RE = re.compile(rb"(\d{4})-(\d{2})-\d{2}")


def file_month(data):
    """Fayl ichidagi sanalardan eng ko'p uchragan oy ('YYYY-MM') yoki None.
    UTF-16 fayllar uchun nol baytlar olib tashlanadi (sanalar ASCII)."""
    counts = {}
    for y, m in DATE_BYTES_RE.findall(data.replace(b"\x00", b"")):
        key = f"{y.decode()}-{m.decode()}"
        counts[key] = counts.get(key, 0) + 1
    return max(counts, key=counts.get) if counts else None


def get_report_folder(cfg, month):
    """Export papkasidan eng yangi report faylini oladi."""
    folder = Path(os.path.expanduser(cfg.get("watch_folder", "")))
    if not folder.exists():
        log.error("watch_folder mavjud emas: %s", folder)
        return None

    candidates = [
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in REPORT_EXTS
    ]
    if not candidates:
        log.warning("Papkada report fayli topilmadi: %s", folder)
        return None

    # Fayl nomiga ishonmaymiz: ichidagi sanalar bo'yicha shu oyga tegishli fayllardan eng yangisi
    # (aks holda boshqa oy fayli shu oy papkasiga yuklanib, o'sha oy hisobotini buzardi)
    matching = []
    for p in candidates:
        try:
            data = p.read_bytes()
        except OSError as e:
            log.warning("O'qib bo'lmadi: %s (%s)", p.name, e)
            continue
        if file_month(data) == month:
            matching.append((p.stat().st_mtime, p.name, data))
    if not matching:
        log.error("Papkada %s oyi uchun report topilmadi (fayllar ichidagi sanalar tekshirildi): %s", month, folder)
        return None
    _, name, data = max(matching)
    log.info("Tanlangan fayl: %s", name)
    return name, data


# ---------------------------------------------------------------- isapi rejimi
# Hikvision AcsEvent "attendanceStatus" -> IVMS "Состояние посещения" (sayt shu nomlarni o'qiydi)
STATUS_RU = {
    "checkin": "Приход",
    "checkout": "Уход",
    "breakin": "Приход при перерыве",
    "breakout": "Уход при перерыве",
}
NONE_RU = "Нет"  # holat bosilmagan (yuz aniqlash) — sayt hisobga olmaydi

RAW_HEADER = [
    "Идентификатор человека", "Имя", "Департамент", "Время", "Состояние посещения",
    "Точка проверки посещения", "Пользовательское название", "Источник данных",
    "Тип обращения", "Температуры", "Аварийный режим",
]


def isapi_settings(cfg):
    """isapi blokidan ulanish sozlamalari (standart: http, +05:00)."""
    dev = cfg.get("isapi", {})
    host = dev.get("host")
    scheme = dev.get("scheme", "http")
    port = dev.get("port")
    base = f"{scheme}://{host}" + (f":{port}" if port else "") if host else None
    return {
        "base": base,
        "user": dev.get("username"),
        "password": dev.get("password"),
        "tz": dev.get("timezone", "+05:00"),
        "verify": bool(dev.get("verify_tls", False)),
        "max_results": int(dev.get("page_size", 30)),
    }


def month_range(month, tz):
    """Oy oralig'i (ISO): oldingi kun 12:00 dan keyingi oyning 1-kuni 12:00 gacha.
    Tungi smena chegarada uzilib qolmasligi uchun ikki chetga yarim sutka qo'shiladi
    (sayt faqat shu oyga tegishli smenalarni hisoblaydi)."""
    y, m = map(int, month.split("-"))
    first = datetime(y, m, 1)
    nxt = datetime(y + (m == 12), 1 if m == 12 else m + 1, 1)
    start = first - timedelta(hours=12)
    end = nxt + timedelta(hours=12)
    fmt = "%Y-%m-%dT%H:%M:%S"
    return start.strftime(fmt) + tz, end.strftime(fmt) + tz


def fetch_isapi_events(cfg, start, end, limit=None):
    """Qurilmadan AcsEvent hodisalarini sahifalab oladi. Xatoda None qaytaradi."""
    st = isapi_settings(cfg)
    if not st["base"]:
        log.error("isapi.host ko'rsatilmagan")
        return None
    url = f"{st['base']}/ISAPI/AccessControl/AcsEvent?format=json"
    auth = requests.auth.HTTPDigestAuth(st["user"], st["password"])
    if not st["verify"] and st["base"].startswith("https"):
        requests.packages.urllib3.disable_warnings()
    events = []
    pos = 0  # searchResultPosition 0 dan boshlanadi
    while True:
        payload = {
            "AcsEventCond": {
                "searchID": "dimed-agent",
                "searchResultPosition": pos,
                "maxResults": st["max_results"],
                "major": 5, "minor": 0,  # 5=access control event, 0=barcha turlar
                "startTime": start, "endTime": end,
            }
        }
        try:
            r = requests.post(url, json=payload, auth=auth, timeout=30, verify=st["verify"])
            if r.status_code == 401:
                log.error("ISAPI: login yoki parol noto'g'ri (401)")
                return None
            r.raise_for_status()
            data = r.json().get("AcsEvent", {})
        except Exception as e:
            log.error("ISAPI so'rovi xato: %s", e)
            return None

        batch = data.get("InfoList", []) or []
        events.extend(batch)
        total = int(data.get("totalMatches", 0))
        got = int(data.get("numOfMatches", len(batch)))
        pos += got
        if got == 0 or pos >= total or (limit and len(events) >= limit):
            break
    return events[:limit] if limit else events


def event_to_record(ev):
    """AcsEvent -> {pid, name, stamp, state} (ismsiz yoki vaqtsiz hodisa — None)."""
    name = (ev.get("name") or "").strip()
    pid = str(ev.get("employeeNoString") or ev.get("employeeNo") or "").strip()
    t = ev.get("time", "")  # 2026-09-28T08:12:01+05:00
    if not name or "T" not in t:
        return None
    stamp = f"{t[:10]} {t[11:19]}"
    state = STATUS_RU.get(str(ev.get("attendanceStatus", "")).strip().lower(), NONE_RU)
    return {"pid": pid, "name": name, "stamp": stamp, "state": state,
            "reader": ev.get("deviceName") or ev.get("doorNo") or "ISAPI"}


def build_raw_html(records):
    """Punchlar ro'yxati -> IVMS «Отчет об исходных записях» HTML jadvali (sayt shuni o'qiydi)."""
    def tr(cells):
        return "<tr>" + "".join(f"<td>{escape(str(c))}</td>" for c in cells) + "</tr>"

    rows = [tr(["Отчет об исходных записях"]), tr(RAW_HEADER)]
    for r in records:
        rows.append(tr([r["pid"], r["name"], "Dimed", r["stamp"], r["state"],
                        r["reader"], "-", "ISAPI", "-", "-", "-"]))
    return ('<html xmlns:x="urn:schemas-microsoft-com:office:excel">\n'
            '<head><meta charset="utf-8"></head><body>\n<table border="1">\n'
            + "\n".join(rows) + "\n</table></body></html>")


def get_report_isapi(cfg, month):
    """Hikvision qurilmasidan ISAPI orqali davomat hodisalarini oladi va
    IVMS «Отчет об исходных записях» formatida HTML hisobot yaratadi."""
    start, end = month_range(month, isapi_settings(cfg)["tz"])
    events = fetch_isapi_events(cfg, start, end)
    if events is None:
        return None

    seen = set()
    records = []
    for ev in events:
        rec = event_to_record(ev)
        if not rec:
            continue
        key = (rec["pid"], rec["name"], rec["stamp"], rec["state"])
        if key in seen:  # sahifalash chegarasida takrorlangan hodisa
            continue
        seen.add(key)
        records.append(rec)

    if not records:
        log.warning("ISAPI: %s oy uchun hodisa topilmadi", month)
        return None
    records.sort(key=lambda r: (r["pid"], r["stamp"]))
    stateful = sum(1 for r in records if r["state"] != NONE_RU)
    log.info("ISAPI: %d ta punch (shundan Приход/Уход belgilangan: %d)", len(records), stateful)
    if stateful == 0:
        log.warning("ISAPI: birorta ham Приход/Уход holati yo'q — qurilmada davomat holati (attendanceStatus) yoqilganmi? "
                    "--test-isapi bilan tekshiring")
    return f"ivms_{month}.xls", build_raw_html(records).encode("utf-8")


def test_isapi(cfg):
    """Ulanishni sinaydi: oxirgi 24 soatdagi hodisalarni va ularning maydonlarini ko'rsatadi."""
    st = isapi_settings(cfg)
    now = datetime.now()
    fmt = "%Y-%m-%dT%H:%M:%S"
    events = fetch_isapi_events(cfg, (now - timedelta(hours=24)).strftime(fmt) + st["tz"], now.strftime(fmt) + st["tz"], limit=200)
    if events is None:
        print("XATO: qurilmaga ulanib bo'lmadi (agent.log ni ko'ring)")
        return False
    print(f"Ulandi: {st['base']} — oxirgi 24 soatda {len(events)} ta hodisa")
    if not events:
        return True
    print("Birinchi hodisa maydonlari:", ", ".join(sorted(events[0].keys())))
    counts = {}
    for ev in events:
        k = str(ev.get("attendanceStatus", "(yo'q)"))
        counts[k] = counts.get(k, 0) + 1
    print("attendanceStatus bo'yicha:", counts)
    for ev in events[:5]:
        rec = event_to_record(ev)
        print("  ", ev.get("time"), ev.get("name"), ev.get("attendanceStatus"), "->", rec["state"] if rec else "(o'tkazib yuboriladi)")
    return True


# ------------------------------------------------------------------- upload
def auth_headers(cfg):
    """Supabase so'rovlari uchun sarlavhalar.

    Tavsiya etilgan: 'agent' rolidagi alohida foydalanuvchi (agent_email/agent_password
    + supabase_anon_key) — u faqat ivms-reports bucketiga yuklay oladi.
    Eski config.json dagi supabase_service_key ham ishlaydi, lekin u butun bazaga
    to'liq (admin) ruxsat beradi — kompyuter buzilsa, hamma ma'lumot xavf ostida.
    """
    base = cfg["supabase_url"].rstrip("/")
    anon = cfg.get("supabase_anon_key")
    email = cfg.get("agent_email")
    password = cfg.get("agent_password")
    if anon and email and password:
        try:
            r = requests.post(
                f"{base}/auth/v1/token?grant_type=password",
                headers={"apikey": anon, "Content-Type": "application/json"},
                json={"email": email, "password": password},
                timeout=30,
            )
        except Exception as e:
            log.error("Agent login xato: %s", e)
            return None
        if r.status_code != 200:
            log.error("Agent login xato (%d): %s", r.status_code, r.text[:300])
            return None
        return {"Authorization": f"Bearer {r.json()['access_token']}", "apikey": anon}

    key = cfg.get("supabase_service_key")
    if key:
        log.warning("service_role kalit ishlatilmoqda — xavfsizroq usul: agent_email/agent_password (agent/README.md)")
        return {"Authorization": f"Bearer {key}", "apikey": key}

    log.error("config.json: supabase_anon_key + agent_email + agent_password kerak (agent/README.md)")
    return None


def upload_to_supabase(cfg, month, filename, content):
    """Faylni Supabase Storage ga yuklaydi: {bucket}/{month}/{filename}"""
    base = cfg["supabase_url"].rstrip("/")
    bucket = cfg.get("bucket", "ivms-reports")
    auth = auth_headers(cfg)
    if not auth:
        return False
    object_path = f"{month}/{filename}"
    url = f"{base}/storage/v1/object/{bucket}/{object_path}"
    headers = {
        **auth,
        "x-upsert": "true",
        "Content-Type": "application/vnd.ms-excel",
    }
    r = requests.post(url, headers=headers, data=content, timeout=60)
    if r.status_code in (200, 201):
        log.info("✓ Yuklandi: %s (%d bayt)", object_path, len(content))
        return True
    log.error("Yuklash xato (%d): %s", r.status_code, r.text[:300])
    return False


# --------------------------------------------------------------------- run
def run(cfg, force=False):
    state = load_state()
    now = datetime.now()

    if force:
        month = target_month(cfg, now)
    else:
        due, month = is_due(cfg, state, now)
        if not due:
            log.info("Hozircha ishlash vaqti emas (oy: %s, oxirgi: %s)", month, state.get("last_month"))
            return False

    log.info("=== Ishga tushdi: %s oy uchun ===", month)
    mode = cfg.get("mode", "folder")
    result = get_report_isapi(cfg, month) if mode == "isapi" else get_report_folder(cfg, month)

    if not result:
        state["last_status"] = "error"
        state["last_run"] = now.isoformat()
        save_state(state)
        log.error("Report olinmadi.")
        return False

    filename, content = result
    ok = upload_to_supabase(cfg, month, filename, content)

    state["last_run"] = now.isoformat()
    state["last_status"] = "ok" if ok else "error"
    if ok:
        state["last_month"] = month
    save_state(state)
    log.info("=== Yakun: %s ===", "muvaffaqiyatli" if ok else "xato")
    return ok


def show_status():
    state = load_state()
    print("IVMS Agent holati:")
    print(f"  Oxirgi yuklangan oy : {state.get('last_month') or '—'}")
    print(f"  Oxirgi ishga tushish: {state.get('last_run') or '—'}")
    print(f"  Holat               : {state.get('last_status')}")


def main():
    parser = argparse.ArgumentParser(description="Dimed Salary IVMS Agent")
    parser.add_argument("--now", action="store_true", help="Jadvalga qaramay darhol ishga tushirish")
    parser.add_argument("--loop", action="store_true", help="Doimiy ishlash (har N daqiqada tekshirish)")
    parser.add_argument("--status", action="store_true", help="Holatni ko'rsatish")
    parser.add_argument("--test-isapi", action="store_true", help="ISAPI ulanishini sinash (oxirgi 24 soat hodisalari)")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    cfg = load_config()

    if args.test_isapi:
        sys.exit(0 if test_isapi(cfg) else 1)

    if args.loop:
        poll = int(cfg.get("poll_minutes", 30))
        log.info("Loop rejimi: har %d daqiqada tekshiriladi. To'xtatish: Ctrl+C", poll)
        try:
            while True:
                run(cfg, force=False)
                time.sleep(poll * 60)
        except KeyboardInterrupt:
            log.info("To'xtatildi.")
    else:
        run(cfg, force=args.now)


if __name__ == "__main__":
    main()
