import { Hono, type Context } from 'hono'
import { demoteAdmin, findUserByEmail, findUserById, getSetting, listSuperAdmins, promoteAdmin, setSetting, writeAudit } from '@damu/db'
import { ALERT_LIMIT_DEFAULTS, BLOOD_TYPES, DEFAULT_ELIGIBILITY, SETTING_FIELDS, SETTING_GROUPS, addAdminInput, compatibleTypes, settingsChangeInput, type AdminSettings, type AdminUserRow } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { ApiError } from '../lib/errors'
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
