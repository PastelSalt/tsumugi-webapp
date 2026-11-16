// Calendar dates are 'YYYY-MM-DD' strings interpreted in the user's time zone (PLAN-B-00 D-10).
const parts = (date, timeZone) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  return Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]))
}
export const validZone = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }
export const todayIn = (timeZone = 'UTC', now = new Date()) => { const p = parts(now, timeZone); return `${p.year}-${p.month}-${p.day}` }
/** 'YYYY-MM-DDTHH:mm:ss' in the user's zone (the shape the client already uses). */
export const localIso = (date, timeZone = 'UTC') => { const p = parts(new Date(date), timeZone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` }
export const localDate = (date, timeZone = 'UTC') => localIso(date, timeZone).slice(0, 10)
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)
