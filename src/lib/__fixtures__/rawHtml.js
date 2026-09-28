// Test yordamchisi: "Отчет об исходных записях" HTML-xls yasaydi (haqiqiy fayldagidek 11 ustun)
export const RAW_HEADER = [
  'Идентификатор человека', 'Имя', 'Департамент', 'Время', 'Состояние посещения',
  'Точка проверки посещения', 'Пользовательское название', 'Источник данных', 'Тип обращения',
  'Температуры', 'Аварийный режим',
]

export const STATE_RU = {
  in: 'Приход', out: 'Уход', break_in: 'Приход при перерыве', break_out: 'Уход при перерыве', none: 'Нет',
}

/** punch: [personId, name, 'YYYY-MM-DD HH:MM:SS', state('in'|'out'|...)] */
export function rawRow([pid, name, time, state]) {
  return [`'${pid}`, name, 'Dimed/Test', time, STATE_RU[state] || state, 'Door1_Entrance', '-', 'Журнал', '-', '-', '-']
}

const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`

export function rawHtml(punches, { extra = {} } = {}) {
  const rows = punches.map((p, i) => tr(rawRow(p)) + (extra[i] || ''))
  return `<html><body><table>${tr(['Отчет об исходных записях'])}${tr(RAW_HEADER)}${rows.join('')}</table></body></html>`
}
