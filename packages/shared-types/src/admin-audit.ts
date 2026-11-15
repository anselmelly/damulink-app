import { z } from 'zod'

/** The filter chips on the audit log: which actions belong to which. An action in no chip still shows under All. */
export const AUDIT_GROUPS = ['all', 'approvals', 'publications', 'edits', 'settings'] as const
export type AuditGroup = (typeof AUDIT_GROUPS)[number]
const MATCH: Record<Exclude<AuditGroup, 'all'>, { exact: string[]; prefix: string[] }> = {
	approvals: { exact: ['request.approve', 'request.reject', 'request.confirm'], prefix: ['facility_'] },
	publications: { exact: ['call.publish', 'drive.publish'], prefix: [] },
	edits: { exact: ['record.correct', 'call.edit', 'drive.update'], prefix: [] },
	settings: { exact: ['member.permission'], prefix: ['setting.', 'admin.'] },
}
export const auditMatch = (g: AuditGroup) => (g === 'all' ? null : MATCH[g])

export const AUDIT_LABELS: Record<string, string> = {
	facility_approve: 'Approved facility',
	facility_reject: 'Rejected facility',
	facility_ask: 'Asked a facility for details',
	facility_suspend: 'Suspended facility',
	facility_reactivate: 'Reactivated facility',
	'request.confirm': 'Confirmed request',
	'request.approve': 'Approved request',
	'request.reject': 'Rejected request',
	'request.raise': 'Raised request',
	'request.cancel': 'Cancelled request',
	'call.publish': 'Published call',
	'call.edit': 'Edited call',
	'call.close': 'Closed call',
	'call.extend': 'Extended call',
	'call.alert_more': 'Alerted more donors',
	'drive.create': 'Created drive',
	'drive.update': 'Edited drive',
	'drive.publish': 'Published drive',
	'drive.cancel': 'Cancelled drive',
	'drive.close': 'Closed drive',
	'record.correct': 'Edited donor record',
	'visit.record': 'Recorded a visit',
	'walkin.record': 'Recorded a walk-in',
	'lab.result': 'Entered a lab result',
	'setting.change': 'Changed setting',
	'admin.add': 'Added super admin',
	'admin.remove': 'Removed super admin',
	'member.permission': 'Changed a team permission',
	'checkin.lookup': 'Looked up a donor',
	'donors.view': 'Viewed the donor list',
	'account_deleted': 'Account deleted',
	'user.flag': 'Flagged user',
	'user.suspend': 'Suspended user',
	'user.reactivate': 'Reactivated user',
	'flag.dismiss': 'Dismissed flag',
}
export const auditQuery = z.object({ q: z.string().trim().max(100).optional(), group: z.string().optional(), page: z.coerce.number().int().min(1).max(100000).optional() })
export type AuditItem = { id: number; at: string; who: string; action: string; label: string; detail: string }
export type AuditPage = { items: AuditItem[]; total: number; page: number; pageSize: number }

// ---------- misuse
export type FlagItem = {
	id: string
	kind: 'rejected_requests' | 'no_shows'
	reason: string
	status: 'open' | 'dismissed' | 'actioned'
	flaggedAt: string
	person: { id: string; name: string; role: 'Requester' | 'Donor'; phone: string; joinedAt: string; suspended: boolean }
	evidence: { ref: string; note: string; at: string }[]
}
export type FlagList = { open: number; items: FlagItem[] }
export const suspendInput = z.object({ reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(300) })
export const dismissInput = z.object({ note: z.string().trim().max(300).optional() })
export const MISUSE_DEFAULTS = { rejectedCount: 3, rejectedDays: 7, noshowFacilities: 2, noshowDays: 30 }

// ---------- dashboard
export type AdminDashboard = {
	counts: { toVerify: number; flagged: number; facilitiesVerified: number; donors: number; openCalls: number; requestsToday: number; suspended: number }
	oldest: { id: string; name: string; town: string; status: string; submittedAt: string | null }[]
	recent: AuditItem[]
}
