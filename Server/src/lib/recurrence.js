import { addDays } from './dates.js'

// A deliberately small repeat rule (PLAN-B-19 section 7): every N days, weeks, months, or years.
// Month and year steps clamp to the last day of the month ("repeat on the 31st" lands on the 30th or 28th).
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

export function nextDue(base, { freq, interval = 1 }) {
  if (freq === 'daily') return addDays(base, interval)
  if (freq === 'weekly') return addDays(base, 7 * interval)
  const [y, m, d] = base.split('-').map(Number)
  const months = freq === 'monthly' ? interval : 12 * interval
  const total = (m - 1) + months
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const day = Math.min(d, lastDay(year, month))
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
