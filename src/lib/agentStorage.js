// IVMS agent Supabase Storage integratsiyasi.
// Agent oldingi oy reportini `{oy}/ivms_{oy}.xls` yo'liga yuklaydi.
// Sayt ochilганda yangi fayllarni topib, avtomatik hisoblaydi.
import { supabase } from './supabase'
import { IVMS_BUCKET, isSupabaseConfigured } from './config'
import { processIvmsFile } from './runCalculation'
import * as db from './db'

const MONTH_RE = /^\d{4}-\d{2}$/

/** Storage bucketdagi agent report fayllarini ro'yxatlaydi */
export async function listAgentReports() {
  if (!isSupabaseConfigured || !supabase) return []
  const files = []
  // Ildizdagi papkalar (oylar)
  const { data: folders, error } = await supabase.storage.from(IVMS_BUCKET).list('', { limit: 100 })
  if (error) return []
  for (const folder of folders || []) {
    if (!MONTH_RE.test(folder.name)) continue
    const { data: monthFiles } = await supabase.storage.from(IVMS_BUCKET).list(folder.name, { limit: 100 })
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
 * Agent yuklagan yangi fayllarni topib avtomatik hisoblaydi.
 * @returns {{processed: string[]}} qayta ishlangan oylar
 */
export async function syncAgentReports() {
  if (!isSupabaseConfigured || !supabase) return { processed: [] }

  const [storageFiles, existingReports] = await Promise.all([listAgentReports(), db.listReports()])
  const existingByMonth = new Map(existingReports.map((r) => [r.month, r]))
  const processed = []

  for (const file of storageFiles) {
    const existing = existingByMonth.get(file.month)
    // Shu oy uchun report yo'q yoki fayl nomi/vaqti farq qilsa — qayta ishlaymiz
    const needsProcess = !existing || existing.file_name !== file.name || existing.source !== 'agent'
    if (!needsProcess) continue

    try {
      const { data, error } = await supabase.storage.from(IVMS_BUCKET).download(file.path)
      if (error || !data) continue
      const html = await data.text()
      await processIvmsFile({ html, fileName: file.name, source: 'agent' })
      processed.push(file.month)
    } catch (e) {
      // bitta fayl xato bo'lsa boshqasiga o'tamiz
    }
  }

  if (processed.length > 0) {
    await db.updateSettings({
      agent: { last_run: new Date().toISOString(), last_status: 'ok' },
    })
  }
  return { processed }
}
