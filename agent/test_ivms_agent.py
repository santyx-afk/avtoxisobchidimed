"""ISAPI rejimi testlari (qurilmasiz, soxta so'rovlar bilan). Ishga tushirish:
    python3 -m unittest discover -s agent -p "test_*.py"
"""
import sys
import types
import unittest
from pathlib import Path

# 'requests' o'rnatilmagan muhitda ham (CI) ishlashi uchun soxta modul
fake = types.ModuleType("requests")
fake.auth = types.SimpleNamespace(HTTPDigestAuth=lambda *a, **k: ("digest", a))
fake.packages = types.SimpleNamespace(urllib3=types.SimpleNamespace(disable_warnings=lambda: None))
fake.post = None
sys.modules["requests"] = fake
sys.path.insert(0, str(Path(__file__).resolve().parent))
import ivms_agent as agent  # noqa: E402


def ev(name, pid, time, status=None, **extra):
    d = {"name": name, "employeeNoString": pid, "time": time, "major": 5, "minor": 75}
    if status:
        d["attendanceStatus"] = status
    d.update(extra)
    return d


class FakeResponse:
    status_code = 200

    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self.data


class IsapiTests(unittest.TestCase):
    CFG = {"isapi": {"host": "192.168.1.64", "username": "admin", "password": "x", "page_size": 2}}

    def test_month_range_adds_half_day_both_sides(self):
        self.assertEqual(agent.month_range("2026-09", "+05:00"),
                         ("2026-08-31T12:00:00+05:00", "2026-10-01T12:00:00+05:00"))
        self.assertEqual(agent.month_range("2026-12", "+05:00")[1], "2027-01-01T12:00:00+05:00")

    def test_event_to_record_maps_status_and_skips_nameless(self):
        r = agent.event_to_record(ev("Ali Test", "'7", "2026-09-28T08:12:01+05:00", "checkIn"))
        self.assertEqual((r["stamp"], r["state"]), ("2026-09-28 08:12:01", "Приход"))
        self.assertEqual(agent.event_to_record(ev("Ali", "1", "2026-09-28T17:00:00+05:00", "checkOut"))["state"], "Уход")
        self.assertEqual(agent.event_to_record(ev("Ali", "1", "2026-09-28T12:00:00+05:00", "breakOut"))["state"], "Уход при перерыве")
        self.assertEqual(agent.event_to_record(ev("Ali", "1", "2026-09-28T12:30:00+05:00", "breakIn"))["state"], "Приход при перерыве")
        # holat bosilmagan / tanilmagan — «Нет»
        self.assertEqual(agent.event_to_record(ev("Ali", "1", "2026-09-28T09:00:00+05:00"))["state"], "Нет")
        self.assertEqual(agent.event_to_record(ev("Ali", "1", "2026-09-28T09:00:00+05:00", "undefined"))["state"], "Нет")
        self.assertIsNone(agent.event_to_record(ev("", "1", "2026-09-28T09:00:00+05:00", "checkIn")))
        self.assertIsNone(agent.event_to_record({"name": "Ali", "time": ""}))

    def test_pagination_collects_all_events(self):
        all_events = [ev("A", "1", f"2026-09-0{i}T08:00:00+05:00", "checkIn") for i in range(1, 6)]
        calls = []

        def post(url, json=None, **kw):
            pos = json["AcsEventCond"]["searchResultPosition"]
            calls.append(pos)
            page = all_events[pos:pos + 2]
            return FakeResponse({"AcsEvent": {"totalMatches": 5, "numOfMatches": len(page), "InfoList": page}})

        fake.post = post
        got = agent.fetch_isapi_events(self.CFG, "s", "e")
        self.assertEqual(len(got), 5)
        self.assertEqual(calls, [0, 2, 4])

    def test_wrong_password_returns_none(self):
        resp = FakeResponse({})
        resp.status_code = 401
        fake.post = lambda *a, **k: resp
        self.assertIsNone(agent.fetch_isapi_events(self.CFG, "s", "e"))

    def test_report_is_raw_records_format_with_month_detected(self):
        events = [
            ev("Ali Test", "7", "2026-09-28T08:12:01+05:00", "checkIn"),
            ev("Ali Test", "7", "2026-09-28T08:12:05+05:00", "checkIn"),  # takror — saytda siqiladi
            ev("Ali Test", "7", "2026-09-28T13:00:00+05:00"),
            ev("Ali Test", "7", "2026-09-28T17:30:00+05:00", "checkOut"),
            ev("Ali Test", "7", "2026-09-28T17:30:00+05:00", "checkOut"),  # aynan takror hodisa
            ev("", "9", "2026-09-28T17:30:00+05:00", "checkOut"),  # ismsiz — tashlanadi
        ]
        fake.post = lambda *a, **k: FakeResponse({"AcsEvent": {"totalMatches": len(events), "numOfMatches": len(events), "InfoList": events}})
        name, data = agent.get_report_isapi(self.CFG, "2026-09")
        self.assertEqual(name, "ivms_2026-09.xls")
        text = data.decode("utf-8")
        self.assertIn("Отчет об исходных записях", text)
        self.assertIn("Состояние посещения", text)
        self.assertEqual(text.count("<td>Ali Test</td>"), 4)  # 5 ta hodisadan aynan takrori tashlangan
        self.assertIn("2026-09-28 08:12:01", text)
        self.assertEqual(agent.file_month(data), "2026-09")

    def test_month_without_attendance_status_is_not_uploaded(self):
        events = [ev("Ali Test", "7", "2026-08-05T08:12:01+05:00"), ev("Ali Test", "7", "2026-08-05T17:30:00+05:00")]
        fake.post = lambda *a, **k: FakeResponse({"AcsEvent": {"totalMatches": 2, "numOfMatches": 2, "InfoList": events}})
        self.assertIsNone(agent.get_report_isapi(self.CFG, "2026-08"))
        forced = dict(self.CFG, allow_no_status=True)
        self.assertIsNotNone(agent.get_report_isapi(forced, "2026-08"))

    def test_no_events_returns_none(self):
        fake.post = lambda *a, **k: FakeResponse({"AcsEvent": {"totalMatches": 0, "numOfMatches": 0, "InfoList": []}})
        self.assertIsNone(agent.get_report_isapi(self.CFG, "2026-09"))


if __name__ == "__main__":
    unittest.main()
