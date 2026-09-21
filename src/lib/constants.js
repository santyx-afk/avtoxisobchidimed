// Umumiy konstantalar va standart sozlamalar

export const DEFAULT_SETTINGS = {
  late_penalty_per_min: 500, // kech qolgan har daqiqa uchun jarima (so'm)
  grace_period_min: 5, // kechikish uchun imtiyozli vaqt (daqiqa)
  overtime_multiplier: 1.5, // qo'shimcha ish soati koeffitsienti
  weekend_multiplier: 2, // dam olish kuni koeffitsienti
  weekend_days: [0], // 0=Yakshanba, 6=Shanba (bir nechta bo'lishi mumkin)
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
}

export const CALC_TYPE_LABEL = {
  fix: 'Fix oylik',
  hourly: 'Soatbay',
}

export const REPORT_SOURCE_LABEL = {
  manual: "Qo'lda",
  agent: 'Agent',
}
