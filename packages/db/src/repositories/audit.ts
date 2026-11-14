import { desc } from 'drizzle-orm'
import type { Db } from '../client'
import { auditLog } from '../schema'

export type AuditEntry = { actorId?: string | null; action: string; target?: string | null; detail?: string | null }

export async function writeAudit(db: Db, e: AuditEntry, now: Date): Promise<void> {
	await db.insert(auditLog).values({ at: now, actorId: e.actorId ?? null, action: e.action, target: e.target ?? null, detail: e.detail ?? null })
}

export async function listAudit(db: Db, limit = 50) {
	return db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit)
}
