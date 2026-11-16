import { AuditModel } from '../models.js'

// Security-relevant events (PLAN-B-04 section 9). IPs are truncated and no secrets are ever stored.
const truncateIp = (ip = '') => {
  const v4 = ip.replace('::ffff:', '').match(/^(\d+\.\d+\.\d+)\.\d+$/)
  if (v4) return `${v4[1]}.0`
  return ip.includes(':') ? `${ip.split(':').slice(0, 3).join(':')}::` : ''
}

export async function audit(req, userId, event, meta = '') {
  try {
    await AuditModel.create({ userId, event, ip: truncateIp(req?.ip), userAgent: (req?.get?.('user-agent') || '').slice(0, 120), meta: String(meta).slice(0, 200) })
  } catch { /* logging must never break a request */ }
}

export const recentActivity = (userId, limit = 50) => AuditModel.find({ userId }).sort({ at: -1 }).limit(limit).select('-userId').lean()
