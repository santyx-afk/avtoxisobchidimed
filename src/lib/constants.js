// Umumiy konstantalar va standart sozlamalar

export const DEFAULT_SETTINGS = {
  late_penalty_per_min: 500, // kech qolgan har daqiqa uchun jarima (so'm)
  grace_period_min: 5, // kechikish uchun imtiyozli vaqt (daqiqa)
  overtime_multiplier: 1.5, // qo'shimcha ish soati koeffitsienti
  weekend_multiplier: 2, // dam olish kuni koeffitsienti
  weekend_days: [0], // 0=Yakshanba, 6=Shanba (bir nechta bo'lishi mumkin)
  holidays: [], // bayram kunlari ['YYYY-MM-DD', ...] — jarima qilinmaydi, haq to'lanadi
  rate_groups: [], // guruh stavkalari (tungi/kunduzgi hamshira, farrosh...): [{id,name,type,amount,employee_ids}]
  locked_months: [], // qulflangan (yopilgan) oylar ['YYYY-MM', ...] — o'zgartirib bo'lmaydi
  agent: {
    enabled: false,
    run_day: 1, // oyning qaysi kuni export qilinadi
    run_hour: 10, // soat
    last_run: null, // ISO — oxirgi muvaffaqiyatli yuklash
    last_status: 'idle', // idle | ok | error | waiting
  },
}

export const CALC_TYPE = {
  FIX: 'fix',
  HOURLY: 'hourly',
  DAILY: 'daily',
}

export const CALC_TYPE_LABEL = {
  fix: 'Fix oylik',
  hourly: 'Soatbay',
  daily: 'Kunbay',
}

export const REPORT_SOURCE_LABEL = {
  manual: "Qo'lda",
  agent: 'Agent',
}

// IVMS fayl formatlari
export const IVMS_FORMAT = {
  PUNCH_REPORT: 'punch_report', // "Punch Report": kunlik birinchi kirish / oxirgi chiqish
  RAW_RECORDS: 'raw_records', // "Отчет об исходных записях": xom punchlar (Приход / Уход)
}

export const IVMS_FORMAT_LABEL = {
  punch_report: 'Punch Report (birinchi kirish / oxirgi chiqish)',
  raw_records: 'Xom yozuvlar (Приход / Уход juftliklari)',
}

// Xom punch holatlari ("Состояние посещения")
export const PUNCH_STATE = {
  IN: 'in', // Приход
  OUT: 'out', // Уход
  BREAK_IN: 'break_in', // Приход при перерыве
  BREAK_OUT: 'break_out', // Уход при перерыве
  NONE: 'none', // Нет — hisobga olinmaydi
}

// Kunlik izohlar (attendance.issues[].type)
export const DAY_ISSUE = {
  UNCLOSED_IN: 'unclosed_in', // Приход bor, Уход bosilmagan
  ORPHAN_OUT: 'orphan_out', // oldidan Приход yo'q Уход
  ORPHAN_BREAK: 'orphan_break', // juftlanmagan tanaffus punchi
  ONLY_NONE: 'only_none', // kunda faqat «Нет» punchlar
  SHORT: 'short', // 1 daqiqadan qisqa juftlik
  MANUAL: 'manual', // kun qo'lda tuzatilgan
}

export const DAY_ISSUE_LABEL = {
  unclosed_in: 'Ketaman bosilmagan',
  orphan_out: "Приход'siz Уход",
  orphan_break: 'Tanaffus juftlanmadi',
  only_none: 'Faqat «Нет»',
  short: 'Juda qisqa juftlik',
  manual: "Qo'lda tuzatilgan",
}
