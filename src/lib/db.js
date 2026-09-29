// Ma'lumotlar qatlami — Supabase sozlangan bo'lsa real DB, aks holda DEMO (localStorage).
// Barcha sahifalar faqat shu modul orqali ma'lumot oladi.
import { isSupabaseConfigured, IS_DESKTOP } from './config'
import * as mock from './mockDb'
import * as real from './realDb'
import { desktopStorage } from './desktop'

// Windows ilovada ma'lumotlar diskdagi faylda (mockDb, faqat saqlash joyi boshqa)
if (IS_DESKTOP) mock.setStorage(desktopStorage)

const impl = isSupabaseConfigured ? real : mock

export const IS_DEMO = !isSupabaseConfigured && !IS_DESKTOP

// Windows ilovada demo ishchilar yaratilmaydi — baza bo'sh boshlanadi
export const seedIfEmpty = IS_DESKTOP ? () => {} : impl.seedIfEmpty
export const registerDemoReportBuilder = impl.registerDemoReportBuilder
export const resetDemoData = impl.resetDemoData

export const listEmployees = impl.listEmployees
export const createEmployee = impl.createEmployee
export const createEmployeesBulk = impl.createEmployeesBulk
export const updateEmployeesBulk = impl.updateEmployeesBulk
export const updateEmployee = impl.updateEmployee
export const deleteEmployee = impl.deleteEmployee

export const getSettings = impl.getSettings
export const updateSettings = impl.updateSettings

export const listReports = impl.listReports
export const getReport = impl.getReport
export const getReportByMonth = impl.getReportByMonth
export const getLatestReport = impl.getLatestReport
export const createReport = impl.createReport
export const deleteReport = impl.deleteReport

export const getAttendanceByReport = impl.getAttendanceByReport
export const saveMonthReport = impl.saveMonthReport

export const getCalculationsByReport = impl.getCalculationsByReport
export const getCalculationsByMonth = impl.getCalculationsByMonth
export const replaceCalculationsForReport = impl.replaceCalculationsForReport
export const getCalculationsForEmployee = impl.getCalculationsForEmployee
export const listCalculationTotals = impl.listCalculationTotals

export const listAdvances = impl.listAdvances
export const getAdvancesByEmployeeMonth = impl.getAdvancesByEmployeeMonth
export const createAdvance = impl.createAdvance
export const deleteAdvance = impl.deleteAdvance
