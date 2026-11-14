import { mysqlTable, varchar, text, datetime, bigint, json, index } from 'drizzle-orm/mysql-core'

/** One row per tunable value (alert limits, request limits...). Seeded by the app, edited by the super admin. */
export const settings = mysqlTable('settings', {
	key: varchar('key', { length: 100 }).primaryKey(),
	value: json('value').notNull(),
	updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
})

/** Append-only: triggers in the migration refuse UPDATE and DELETE. */
export const auditLog = mysqlTable(
	'audit_log',
	{
		id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
		at: datetime('at', { fsp: 3 }).notNull(),
		actorId: varchar('actor_id', { length: 26 }),
		action: varchar('action', { length: 100 }).notNull(),
		target: varchar('target', { length: 100 }),
		detail: text('detail'),
	},
	(t) => [index('audit_log_at_idx').on(t.at)],
)
