import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../client'
import { users } from '../schema'

export const listSuperAdmins = (db: Db) =>
	db.select({ id: users.id, name: users.name, email: users.email, addedAt: users.adminAddedAt }).from(users).where(eq(users.isSuperAdmin, true)).orderBy(sql`${users.adminAddedAt} is not null`, asc(users.adminAddedAt), asc(users.name))

export const promoteAdmin = (db: Db, id: string, by: string, now: Date) => db.update(users).set({ isSuperAdmin: true, adminAddedAt: now, adminAddedBy: by }).where(eq(users.id, id))
export const demoteAdmin = (db: Db, id: string) => db.update(users).set({ isSuperAdmin: false }).where(and(eq(users.id, id), eq(users.isSuperAdmin, true)))
