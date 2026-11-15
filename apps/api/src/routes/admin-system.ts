import { Hono, type Context } from 'hono'
import { addRequestEvent, auditPage, cancelOpenRequestsOf, dashboardCounts, demoteAdmin, findUserByEmail, findUserById, getFlag, getSetting, listFlags, listSuperAdmins, oldestQueue, openFlagCount, promoteAdmin, resolveFlag, resolveOpenFlagsOf, revokeAllForUser, setSetting, updateUser, writeAudit } from '@damu/db'
import { ALERT_LIMIT_DEFAULTS, AUDIT_GROUPS, BLOOD_TYPES, DEFAULT_ELIGIBILITY, SETTING_FIELDS, SETTING_GROUPS, addAdminInput, auditMatch, auditQuery, compatibleTypes, dismissInput, maskPhone, settingsChangeInput, suspendInput, type AdminDashboard, type AdminSettings, type AdminUserRow, type AuditGroup, type AuditPage, type FlagItem, type FlagList } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { auditItems } from '../lib/audit-view'
import { nairobiDay } from '../lib/drives'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { parseInput, readJson } from '../lib/validate'
import type { AuthEnv } from '../middleware/auth'

/** Mounted inside the super admin router, so every route here is already super-admin only. */
export const adminSystemRoutes = new Hono<AppEnv>()

const OBJECTS: Record<string, Record<string, number>> = { eligibility: DEFAULT_ELIGIBILITY as unknown as Record<string, number>, alert_limits: ALERT_LIMIT_DEFAULTS }
const split = (key: string) => {
	const i = key.indexOf('.')
	return i > 0 && key.slice(0, i) in OBJECTS ? ([key.slice(0, i), key.slice(i + 1)] as const) : null
}
const bad = (fields: Record<string, string>) => new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', fields)

/** Current values of every editable key: what is stored, or the default. */
async function current(c: Context<AuthEnv>) {
	const objs: Record<string, Record<string, number>> = {}
	for (const [name, defs] of Object.entries(OBJECTS)) objs[name] = { ...defs, ...((await getSetting<Record<string, number>>(c.var.db, name)) ?? {}) }
	const out: Record<string, number> = {}
	for (const f of SETTING_FIELDS) {
		const o = split(f.key)
		if (o) out[f.key] = Number(objs[o[0]][o[1]])
		else {
			const v = await getSetting<unknown>(c.var.db, f.key)
			out[f.key] = typeof v === 'number' && Number.isFinite(v) ? v : f.def
		}
	}
	return { out, objs }
}

adminSystemRoutes.get('/settings', async (c: Context<AuthEnv>) => {
	const { out } = await current(c)
	const body: AdminSettings = {
		groups: SETTING_GROUPS.map((g) => ({ ...g, fields: g.fields.map((f) => ({ ...f, value: out[f.key] })) })),
		compatibility: Object.fromEntries(BLOOD_TYPES.map((p) => [p, compatibleTypes(p)])),
	}
	return c.json(body)
})

adminSystemRoutes.patch('/settings', async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const { changes } = parseInput(settingsChangeInput, await readJson(c))
	const { out, objs } = await current(c)
	const errors: Record<string, string> = {}
	const next = { ...out }
	for (const [key, v] of Object.entries(changes)) {
		const f = SETTING_FIELDS.find((x) => x.key === key)
		if (!f) errors[key] = 'This setting cannot be changed here'
		else if (typeof v !== 'number' || !Number.isInteger(v)) errors[key] = 'Enter a whole number'
		else if (v < f.min || v > f.max) errors[key] = `Choose a value from ${f.min} to ${f.max}`
		else next[key] = v
	}
	if (!Object.keys(errors).length) {
		if (next['eligibility.minAge'] >= next['eligibility.maxAge']) errors[('eligibility.maxAge' in changes ? 'eligibility.maxAge' : 'eligibility.minAge')] = 'The minimum age must be below the maximum age'
		if (next['rings.ring2_km'] >= next['rings.ring3_km']) errors[('rings.ring3_km' in changes ? 'rings.ring3_km' : 'rings.ring2_km')] = 'Ring 2 must be closer than ring 3'
	}
	if (Object.keys(errors).length) throw bad(errors)

	const now = clock.now()
	const touched = new Set<string>()
	for (const key of Object.keys(changes)) {
		if (next[key] === out[key]) continue
		const o = split(key)
		if (o) {
			objs[o[0]][o[1]] = next[key]
			touched.add(o[0])
		} else await setSetting(db, key, next[key], now)
		await writeAudit(db, { actorId: user.id, action: 'setting.change', target: key, detail: `${out[key]} to ${next[key]}` }, now)
	}
	for (const name of touched) await setSetting(db, name, objs[name], now)
	return c.json({ saved: true })
})

// ---------- super admins
adminSystemRoutes.get('/admins', async (c: Context<AuthEnv>) => {
	const rows = await listSuperAdmins(c.var.db)
	const body: AdminUserRow[] = rows.map((r) => ({ id: r.id, name: r.name, email: r.email, you: r.id === c.var.user.id, addedAt: r.addedAt?.toISOString() ?? null }))
	return c.json(body)
})

adminSystemRoutes.post('/admins', async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const { email } = parseInput(addAdminInput, await readJson(c))
	const u = await findUserByEmail(db, email)
	if (!u) throw new ApiError(404, 'not_found', 'No account has this email. They need to sign up first.')
	if (u.isSuperAdmin) throw new ApiError(409, 'already_admin', 'This person is already a super admin.')
	if (!u.emailVerifiedAt) throw new ApiError(409, 'email_not_verified', 'This account has not verified its email yet.')
	if (u.status !== 'active') throw new ApiError(409, 'not_active', 'This account is suspended.')
	const now = clock.now()
	await promoteAdmin(db, u.id, user.id, now)
	await writeAudit(db, { actorId: user.id, action: 'admin.add', target: u.id }, now)
	return c.json({ id: u.id }, 201)
})

adminSystemRoutes.delete('/admins/:id', async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const id = c.req.param('id') ?? ''
	if (id === user.id) throw new ApiError(409, 'cannot_remove_self', 'You cannot remove yourself. Ask another super admin.')
	const u = await findUserById(db, id)
	if (!u || !u.isSuperAdmin) throw new ApiError(404, 'not_found', 'Not found.')
	await demoteAdmin(db, id)
	await writeAudit(db, { actorId: user.id, action: 'admin.remove', target: id }, clock.now())
	return c.json({ removed: true })
})

// ---------- audit log
adminSystemRoutes.get('/audit', async (c: Context<AuthEnv>) => {
	const q = parseInput(auditQuery, Object.fromEntries(new URL(c.req.url).searchParams))
	const group = (AUDIT_GROUPS as readonly string[]).includes(q.group ?? '') ? (q.group as AuditGroup) : 'all'
	const m = auditMatch(group)
	const page = q.page ?? 1
	const { rows, total } = await auditPage(c.var.db, { q: q.q || undefined, exact: m?.exact, prefix: m?.prefix, page, pageSize: 25 })
	const body: AuditPage = { items: await auditItems(c.var.db, rows), total, page, pageSize: 25 }
	return c.json(body)
})

// ---------- misuse
adminSystemRoutes.get('/flags', async (c: Context<AuthEnv>) => {
	const { db } = c.var
	const rows = await listFlags(db, c.req.query('status') === 'all' ? 'all' : 'open')
	const body: FlagList = {
		open: await openFlagCount(db),
		items: rows.map(({ f, name, phone, createdAt, userStatus }) => ({
			id: f.id,
			kind: f.kind,
			reason: f.reason,
			status: f.status,
			flaggedAt: f.createdAt.toISOString(),
			person: { id: f.userId, name, role: f.kind === 'no_shows' ? 'Donor' : 'Requester', phone: maskPhone(phone), joinedAt: createdAt.toISOString(), suspended: userStatus === 'suspended' },
			evidence: f.evidence as FlagItem['evidence'],
		})),
	}
	return c.json(body)
})

adminSystemRoutes.post('/flags/:id/dismiss', async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const { note } = parseInput(dismissInput, await readJson(c))
	const f = await getFlag(db, c.req.param('id') ?? '')
	if (!f) throw new ApiError(404, 'not_found', 'Not found.')
	if (f.status !== 'open') throw new ApiError(409, 'already_done', 'This flag is already closed.')
	await resolveFlag(db, f.id, 'dismissed', note ?? null, user.id, clock.now())
	await writeAudit(db, { actorId: user.id, action: 'flag.dismiss', target: f.userId, detail: f.kind }, clock.now())
	return c.json({ status: 'dismissed' })
})

async function target(c: Context<AuthEnv>) {
	const u = await findUserById(c.var.db, c.req.param('id') ?? '')
	if (!u) throw new ApiError(404, 'not_found', 'Not found.')
	return u
}
adminSystemRoutes.post('/users/:id/suspend', async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const { reason } = parseInput(suspendInput, await readJson(c))
	const u = await target(c)
	if (u.id === user.id) throw new ApiError(409, 'cannot_suspend_self', 'You cannot suspend yourself.')
	if (u.isSuperAdmin) throw new ApiError(409, 'is_admin', 'Remove their super admin role first.')
	const now = clock.now()
	await updateUser(db, u.id, { status: 'suspended' })
	await revokeAllForUser(db, u.id, now)
	for (const id of await cancelOpenRequestsOf(db, u.id, now)) await addRequestEvent(db, { id: newId(now.getTime()), requestId: id, kind: 'cancelled', actorId: user.id, note: 'Account suspended', visibleToRequester: false, createdAt: now })
	await resolveOpenFlagsOf(db, u.id, user.id, now)
	await writeAudit(db, { actorId: user.id, action: 'user.suspend', target: u.id, detail: reason }, now)
	return c.json({ status: 'suspended' })
})
adminSystemRoutes.post('/users/:id/reactivate', async (c: Context<AuthEnv>) => {
	const { db, user, clock } = c.var
	const u = await target(c)
	await updateUser(db, u.id, { status: 'active' })
	await writeAudit(db, { actorId: user.id, action: 'user.reactivate', target: u.id }, clock.now())
	return c.json({ status: 'active' })
})

// ---------- dashboard
adminSystemRoutes.get('/dashboard', async (c: Context<AuthEnv>) => {
	const { db, clock } = c.var
	const now = clock.now()
	const counts = await dashboardCounts(db, new Date(`${nairobiDay(now)}T00:00:00+03:00`))
	const { rows } = await auditPage(db, { page: 1, pageSize: 8 })
	const body: AdminDashboard = {
		counts: { ...counts, flagged: await openFlagCount(db) },
		oldest: (await oldestQueue(db, 3)).map((r) => ({ ...r, submittedAt: r.submittedAt?.toISOString() ?? null })),
		recent: await auditItems(db, rows),
	}
	return c.json(body)
})
