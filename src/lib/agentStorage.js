// IVMS agent Supabase Storage integratsiyasi.
// Agent oldingi oy reportini `{oy}/ivms_{oy}.xls` yo'liga yuklaydi.
// Sayt ochilganda yangi fayllarni topib, avtomatik hisoblaydi.
import { supabase } from './supabase'
import { IVMS_BUCKET, isSupabaseConfigured } from './config'
import { processIvmsFile } from './runCalculation'
import { reportBufferToHtml } from './readReportFile'
import * as db from './db'

const MONTH_RE = /^\d{4}-\d{2}$/

/** Storage bucketdagi agent report fayllarini ro'yxatlaydi (eng yangi oylar birinchi) */
export async function listAgentReports() {
  if (!isSupabaseConfigured || !supabase) return []
  const bucket = supabase.storage.from(IVMS_BUCKET)
  const files = []
  // Ildizdagi papkalar (oylar)
  const { data: folders, error } = await bucket.list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } })
  if (error) return []
  for (const folder of folders || []) {
    if (!MONTH_RE.test(folder.name)) continue
    const { data: monthFiles } = await bucket.list(folder.name, { limit: 100 })
    for (const f of monthFiles || []) {
      if (f.id === null) continue
      files.push({
        month: folder.name,
        name: f.name,
        path: `${folder.name}/${f.name}`,
        updated_at: f.updated_at || f.created_at,
      })
    }
  }
  return files
}

/**
 * Agent fayli qayta ishlanishi kerakmi: shu oy hisoboti yo'q yoki fayl hisobotdan yangiroq
 * (agent qayta yuklagan). Keyinroq qo'lda yuklangan (tuzatilgan) hisobot ustidan yozilmaydi,
 * qulflangan oyga tegilmaydi.
 */
export function shouldProcessAgentFile(file, report, lockedMonths = []) {
  if (lockedMonths.includes(file.month)) return false
  if (!report) return true
  const fileTime = Date.parse(file.updated_at || '')
  const reportTime = Date.parse(report.uploaded_at || '')
  return Number.isFinite(fileTime) && (!Number.isFinite(reportTime) || fileTime > reportTime)
}

/**
 * Agent yuklagan yangi fayllarni topib avtomatik hisoblaydi. Xatolar sozlamalardagi
 * agent.last_status / last_error ga yoziladi (Sozlamalar sahifasida ko'rinadi).
 * @returns {{processed: string[], errors: string[]}}
 */
export async function syncAgentReports() {
  if (!isSupabaseConfigured || !supabase) return { processed: [], errors: [] }

  const [storageFiles, existingReports, settings] = await Promise.all([
    listAgentReports(), db.listReports(), db.getSettings(),
  ])
  const reportByMonth = new Map(existingReports.map((r) => [r.month, r]))
  const locked = settings.locked_months || []
  const processed = []
  const errors = []

  for (const file of storageFiles) {
    if (!shouldProcessAgentFile(file, reportByMonth.get(file.month), locked)) continue
    try {
      const { data, error } = await supabase.storage.from(IVMS_BUCKET).download(file.path)
      if (error || !data) throw new Error(error?.message || 'yuklab olinmadi')
      const html = await reportBufferToHtml(await data.arrayBuffer())
      await processIvmsFile({ html, fileName: file.name, source: 'agent', expectedMonth: file.month })
      processed.push(file.month)
    } catch (e) {
      // 23505 — shu oyni boshqa oynada kimdir allaqachon saqladi
      if (e?.code !== '23505') errors.push(`${file.path}: ${e?.message || e}`)
    }
  }

  const lastError = errors.join('; ')
  if (processed.length > 0 || lastError !== (settings.agent?.last_error || '')) {
    await db.updateSettings({
      agent: {
        last_run: new Date().toISOString(),
        last_status: errors.length ? 'error' : 'ok',
        last_error: lastError,
      },
    })
  }
  return { processed, errors }
}
