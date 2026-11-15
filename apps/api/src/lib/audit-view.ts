import { actorFacilities, facilityNames, type Db } from '@damu/db'
import { AUDIT_LABELS, SETTING_FIELDS, maskPhone, normalizePhone, type AuditItem } from '@damu/shared-types'

type Row = { a: { id: number; at: Date; actorId: string | null; action: string; target: string | null; detail: string | null }; actor: string | null }
const maskPhones = (s: string) => s.replace(/(?:\+254|\b0)[17]\d{8}\b/g, (m) => { const p = normalizePhone(m); return p ? maskPhone(p) : '•••' })

/** Turns audit rows into what a person reads: "Name (Facility)", a label, and a one-line detail. Phones are masked, ids become names. */
export async function auditItems(db: Db, rows: Row[]): Promise<AuditItem[]> {
	const homes = await actorFacilities(db, [...new Set(rows.map((r) => r.a.actorId).filter((x): x is string => !!x))])
	const ID = /\b[0-9A-Z]{26}\b/g
	const facilityIds = [...new Set(rows.flatMap((r) => [...(r.a.detail ?? '').matchAll(ID)].map((m) => m[0]).concat(r.a.action.startsWith('facility_') && r.a.target ? [r.a.target] : [])))]
	const names = await facilityNames(db, facilityIds)
	return rows.map(({ a, actor }) => {
		const who = a.actorId ? (homes.get(a.actorId) ? `${actor ?? 'Someone'} (${homes.get(a.actorId)})` : (actor ?? 'Someone')) : 'System'
		let detail = (a.detail ?? '').replace(ID, (id) => names.get(id) ?? '').replace(/\s+/g, ' ').trim()
		if (/^[[{]|\[object/.test(detail)) detail = '' // old rows that logged raw JSON
		if (a.action === 'setting.change') detail = `${SETTING_FIELDS.find((f) => f.key === a.target)?.label ?? a.target ?? ''}: ${a.detail ?? ''}`
		else if (a.action.startsWith('facility_') && a.target) detail = [names.get(a.target), a.detail].filter(Boolean).join(', ')
		else if (!detail && a.target && !/^[0-9A-Z]{26}$/.test(a.target)) detail = a.target
		return { id: a.id, at: a.at.toISOString(), who, action: a.action, label: AUDIT_LABELS[a.action] ?? a.action, detail: maskPhones(detail) }
	})
}
