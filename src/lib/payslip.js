// Individual oylik varaqasi (payslip) — chop etish uchun toza HTML
import { formatSom, formatSigned, formatMonth, minutesToHours } from './format'
import { CALC_TYPE_LABEL } from './constants'

/**
 * Chop etish uchun toza HTML string qaytaradi (styllar inline).
 * @param {{employee, summary, month, clinicName?}}
 */
export function payslipHtml({ employee, summary, month, clinicName = 'Dimed' }) {
  const s = summary || {}
  const emp = employee || {}
  const notes = (s.notes || '').split('\n').filter(Boolean)

  const money = (v) => formatSom(v) + " so'm"
  const diffColor = (s.difference || 0) < 0 ? '#dc2626' : (s.difference || 0) > 0 ? '#059669' : '#334155'

  const line = (label, value, opts = {}) => `
    <tr>
      <td style="padding:7px 0;color:#475569;">${label}</td>
      <td style="padding:7px 0;text-align:right;font-variant-numeric:tabular-nums;${opts.strong ? 'font-weight:700;' : ''}${opts.color ? `color:${opts.color};` : ''}">${value}</td>
    </tr>`

  const metricLines = [
    line('Ish kunlari (kelgan / kutilgan)', `${s.work_days ?? 0} / ${s.expected_work_days ?? 0}`),
    line('Jami ishlangan soat', `${minutesToHours((s.total_hours || 0) * 60)} s`),
    s.overtime_hours > 0 ? line('Qo‘shimcha (overtime)', `${s.overtime_hours} s`) : '',
    s.weekend_hours > 0 ? line('Dam olish / bayram', `${s.weekend_hours} s`) : '',
    s.late_count > 0 ? line('Kech qolish', `${s.late_count} kun / ${s.total_late_minutes} daqiqa`) : '',
  ].join('')

  const moneyLines = [
    line('Belgilangan (asos)', money(s.base_salary)),
    line('Kelgan kunlar uchun', money(s.calculated_salary)),
    s.overtime_pay > 0 ? line('Overtime', '+' + money(s.overtime_pay), { color: '#059669' }) : '',
    s.weekend_pay > 0 ? line('Dam olish / bayram', '+' + money(s.weekend_pay), { color: '#059669' }) : '',
    s.penalties > 0 ? line('Kech qolish jarimasi', '−' + money(s.penalties), { color: '#dc2626' }) : '',
    s.advance_deduction > 0 ? line('Avans (ushlab qolindi)', '−' + money(s.advance_deduction), { color: '#dc2626' }) : '',
  ].join('')

  const notesHtml = notes.length
    ? `<div style="margin-top:16px;">
         <div style="font-weight:600;color:#334155;margin-bottom:6px;">Farq sabablari</div>
         <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.7;">
           ${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
         </ul>
       </div>` : ''

  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8">
<title>Oylik varaqasi — ${escapeHtml(emp.name || '')} — ${formatMonth(month)}</title>
<style>
  * { box-sizing:border-box; }
  body { font-family: Arial, 'Segoe UI', sans-serif; color:#1e293b; margin:0; padding:24px; background:#f1f5f9; }
  .sheet { max-width:720px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1f72eb; padding-bottom:14px; margin-bottom:18px; }
  .brand { font-size:22px; font-weight:800; color:#1f72eb; }
  .sub { color:#64748b; font-size:13px; margin-top:2px; }
  .title { text-align:right; }
  .title b { font-size:16px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  .section-title { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; margin:18px 0 4px; }
  .net { display:flex; justify-content:space-between; align-items:center; margin-top:18px; padding:14px 16px; background:#eff6ff; border-radius:10px; }
  .net .label { color:#475569; font-weight:600; }
  .net .value { font-size:22px; font-weight:800; color:#1f72eb; font-variant-numeric:tabular-nums; }
  .diff { text-align:right; margin-top:6px; font-size:13px; font-weight:600; color:${diffColor}; }
  .sign { display:flex; gap:40px; margin-top:40px; }
  .sign > div { flex:1; }
  .sign .line { border-top:1px solid #94a3b8; margin-top:38px; padding-top:6px; font-size:12px; color:#64748b; text-align:center; }
  .foot { margin-top:22px; text-align:center; color:#94a3b8; font-size:11px; }
  @media print { body { background:#fff; padding:0; } .sheet { box-shadow:none; border-radius:0; max-width:100%; } .noprint { display:none; } }
</style></head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="brand">${escapeHtml(clinicName)}</div>
        <div class="sub">HR oylik hisoblash tizimi</div>
      </div>
      <div class="title">
        <b>Oylik varaqasi</b>
        <div class="sub">${formatMonth(month)}</div>
      </div>
    </div>

    <table>
      <tr><td style="padding:4px 0;color:#475569;">Ishchi</td><td style="padding:4px 0;text-align:right;font-weight:700;">${escapeHtml(emp.name || '')}</td></tr>
      ${emp.position ? `<tr><td style="padding:4px 0;color:#475569;">Lavozim</td><td style="padding:4px 0;text-align:right;">${escapeHtml(emp.position)}</td></tr>` : ''}
      ${emp.department ? `<tr><td style="padding:4px 0;color:#475569;">Departament</td><td style="padding:4px 0;text-align:right;">${escapeHtml(emp.department)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#475569;">Hisoblash turi</td><td style="padding:4px 0;text-align:right;">${CALC_TYPE_LABEL[emp.calc_type] || ''}</td></tr>
    </table>

    <div class="section-title">Davomat</div>
    <table>${metricLines}</table>

    <div class="section-title">Hisob-kitob</div>
    <table>${moneyLines}</table>

    <div class="net">
      <span class="label">NET oylik (qo‘lga tegadigan)</span>
      <span class="value">${money(s.net_salary)}</span>
    </div>
    <div class="diff">Belgilangandan farq: ${formatSigned(s.difference)} so'm</div>

    ${notesHtml}

    <div class="sign">
      <div><div class="line">Ishchi imzosi</div></div>
      <div><div class="line">Buxgalter imzosi</div></div>
    </div>

    <div class="foot">Yaratilgan: ${new Date().toLocaleDateString('ru-RU')} · ${escapeHtml(clinicName)} — Dimed Salary</div>
  </div>
</body></html>`
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

/** Yangi oynada payslip ochib, chop etish dialogini chaqiradi */
export function printPayslip(args) {
  const html = payslipHtml(args)
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) {
    // Popup bloklangan bo'lsa — yuklab olishga o'tamiz
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payslip_${(args.employee?.name || 'ishchi').replace(/\s+/g, '_')}_${args.month}.html`
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { try { w.print() } catch (e) { /* e'tiborsiz */ } }, 350)
}
