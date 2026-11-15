import { Hono, type Context } from 'hono'
import { closeDriveRow, driveBloodTypes, driveCounts, driveInterestList, driveTabCounts, getDrive, insertDrive, listDrives, openDriveCount, setArrived, updateDrive, writeAudit, type Drive } from '@damu/db'
import { DRIVE_DEFAULTS, DRIVE_TABS, driveArrivedInput, driveInput, drivePublishInput, driveRef, driveUpdateInput, maskPhone, normalizePhone, type DriveDay, type DriveDetail, type DriveSummary, type DriveItem, type DriveList, type DrivePublishInfo, type DriveTab } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { desk } from '../lib/desk'
import { driveAudience, driveStart, driveText, nairobiDay, runDriveAlerts, sendDriveNotice } from '../lib/drives'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { newShort } from '../lib/calls'
import { numberSetting } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** Mounted at /api/my-facilities/:id/drives. Any member of a verified facility; everyone else sees "not found". */
export const driveRoutes = new Hono<AppEnv>()

const DAY = 86_400_000
const bad = (field: string, message: string) => new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', { [field]: message })

const phase = (d: Drive, day: string) => (d.status === 'published' ? (d.date === day ? 'open' : d.date < day ? 'ended' : 'published') : d.status)
const item = (d: Drive, interested: number, day: string): DriveItem => ({
	id: d.id,
	code: driveRef(d.number),
	short: d.short,
	host: d.host,
	venue: d.venue,
	town: d.town,
	date: d.date,
	starts: d.starts,
	ends: d.ends,
	status: d.status,
	phase: phase(d, day),
	isPublic: d.isPublic,
	smsEnabled: d.smsEnabled,
	interested,
	target: d.target,
})

async function own(c: Context<AuthEnv>) {
	const f = await desk(c)
	const d = await getDrive(c.var.db, c.req.param('did') ?? '', f.id)
	if (!d) throw new ApiError(404, 'not_found', 'Not found.')
	return { f, d, now: c.var.clock.now() }
}
const editable = (d: Drive, now: Date) => {
	if (d.status !== 'draft' && d.status !== 'published') throw new ApiError(409, 'invalid_move', `A ${d.status.replace('_', ' ')} drive cannot be changed.`)
	if (driveStart(d).getTime() <= now.getTime()) throw new ApiError(409, 'drive_started', 'This drive has already started.')
}

/** The date is today or later and inside the window; the contact phone comes back in one form. */
async function check(c: Context<AuthEnv>, v: { date?: string; contactPhone?: string | null }, day: string) {
	if (v.date !== undefined) {
		const max = await numberSetting(c.var.db, 'drives.max_ahead_days', DRIVE_DEFAULTS.maxAheadDays)
		if (v.date < day) throw bad('date', 'Choose today or a later date')
		if (new Date(`${v.date}T00:00:00Z`).getTime() > new Date(`${day}T00:00:00Z`).getTime() + max * DAY) throw bad('date', `Choose a date within ${max} days`)
	}
	if (v.contactPhone) {
		const p = normalizePhone(v.contactPhone)
		if (!p) throw bad('contactPhone', 'Enter a Kenyan mobile number')
		return p
	}
	return null
}

driveRoutes.post('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const f = await desk(c)
	const input = parseInput(driveInput, await readJson(c))
	const now = clock.now()
	const day = nairobiDay(now)
	const phone = await check(c, input, day)
	if ((await openDriveCount(db, f.id, day)) >= (await numberSetting(db, 'drives.max_open', DRIVE_DEFAULTS.maxOpen))) throw new ApiError(409, 'too_many_drives', 'This facility has too many open drives. Cancel or finish one first.')
	const id = newId(now.getTime())
	const { number, short } = await insertDrive(db, { id, facilityId: f.id, host: input.host, venue: input.venue, town: input.town, date: input.date, starts: input.starts, ends: input.ends, publicText: input.publicText, target: input.target, contactName: input.contactName, contactPhone: phone, status: 'draft', createdBy: user.id, createdAt: now, updatedAt: now }, newShort)
	await writeAudit(db, { actorId: user.id, action: 'drive.create', target: id, detail: f.id }, now)
	return c.json({ id, number, code: driveRef(number), short, status: 'draft' }, 201)
})

driveRoutes.get('/', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock } = c.var
	const f = await desk(c)
	const tab = (c.req.query('tab') ?? 'upcoming') as DriveTab
	if (!DRIVE_TABS.includes(tab)) throw bad('tab', 'Choose upcoming, today or past')
	const day = nairobiDay(clock.now())
	const body: DriveList = { counts: await driveTabCounts(db, f.id, day), items: (await listDrives(db, f.id, tab, day)).map((d) => item(d, d.interested, day)) }
	return c.json(body)
})

driveRoutes.get('/:did', requireAuth, async (c: Context<AuthEnv>) => {
	const { d, now } = await own(c)
	const body: DriveDetail = {
		...item(d, 0, nairobiDay(now)),
		publicText: d.publicText,
		contactName: d.contactName, // private: only this facility's team reads it
		contactPhone: d.contactPhone,
		publishedAt: d.publishedAt?.toISOString() ?? null,
		canEdit: (d.status === 'draft' || d.status === 'published') && driveStart(d).getTime() > now.getTime(),
	}
	return c.json(body)
})

driveRoutes.patch('/:did', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, user } = c.var
	const { d, f, now } = await own(c)
	const input = parseInput(driveUpdateInput, await readJson(c))
	editable(d, now)
	const phone = await check(c, input, nairobiDay(now))
	const { contactPhone: _drop, ...rest } = input
	const next = { ...d, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) }
	if (next.ends <= next.starts) throw bad('ends', 'The drive must end after it starts')
	await updateDrive(db, d.id, { ...rest, ...('contactPhone' in input ? { contactPhone: phone } : {}), updatedAt: now })
	await writeAudit(db, { actorId: user.id, action: 'drive.update', target: d.id, detail: `${f.id} ${Object.keys(input).join(',')}` }, now)
	const moved = d.status === 'published' && (['date', 'starts', 'ends', 'venue', 'town'] as const).some((k) => k in input && input[k] !== d[k])
	if (moved) await sendDriveNotice(db, c.var.sms, c.var.config, { ...d, ...rest } as Drive, 'changed')
	return c.json({ id: d.id })
})

driveRoutes.post('/:did/cancel', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, user } = c.var
	const { d, f, now } = await own(c)
	editable(d, now)
	await updateDrive(db, d.id, { status: 'cancelled', cancelledAt: now, updatedAt: now })
	await writeAudit(db, { actorId: user.id, action: 'drive.cancel', target: d.id, detail: f.id }, now)
	if (d.status === 'published') await sendDriveNotice(db, c.var.sms, c.var.config, d, 'cancelled')
	return c.json({ status: 'cancelled' })
})

driveRoutes.get('/:did/publish', requireAuth, async (c: Context<AuthEnv>) => {
	const { d, now } = await own(c)
	if (d.status !== 'draft') throw new ApiError(409, 'invalid_move', 'Only a draft can be published.')
	const text = driveText(c.var.config, d)
	const { people: _people, ...audience } = await driveAudience(c.var.db, d, now)
	const body: DrivePublishInfo = { audience, sms: { text, length: text.length }, link: `${c.var.config.appUrl.replace(/\/$/, '')}/d/${d.short}` }
	return c.json(body)
})

driveRoutes.post('/:did/publish', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, user, sms, config } = c.var
	const { d, f, now } = await own(c)
	const input = parseInput(drivePublishInput, await readJson(c))
	if (!input.isPublic && !input.smsEnabled) throw bad('isPublic', 'Choose a public page, SMS, or both')
	if (d.status !== 'draft') throw new ApiError(409, 'invalid_move', 'Only a draft can be published.')
	editable(d, now)
	await updateDrive(db, d.id, { status: 'published', isPublic: input.isPublic, smsEnabled: input.smsEnabled, publishedAt: now, updatedAt: now })
	await writeAudit(db, { actorId: user.id, action: 'drive.publish', target: d.id, detail: `${f.id} public=${input.isPublic} sms=${input.smsEnabled}` }, now)
	if (input.smsEnabled) await runDriveAlerts(db, sms, config, { ...d, status: 'published', isPublic: input.isPublic, smsEnabled: true }, now)
	return c.json({ status: 'published' })
})

// ---------------------------------------------------------------- the day, closing, the summary

const percentOf = (donated: number, target: number | null) => (target ? Math.min(100, Math.round((donated / target) * 100)) : null)

driveRoutes.get('/:did/day', requireAuth, async (c: Context<AuthEnv>) => {
	const { db } = c.var
	const { d, now } = await own(c)
	if (d.status !== 'published') throw new ApiError(409, 'invalid_move', 'Only a published drive has a day page.')
	const today = nairobiDay(now)
	const counts = await driveCounts(db, d)
	const people = await driveInterestList(db, d.id)
	const body: DriveDay = {
		...item(d, people.length, today),
		phase: d.date <= today ? 'open' : 'published',
		publicText: d.publicText,
		contactName: d.contactName, // private: only this facility's team reads it
		contactPhone: d.contactPhone,
		publishedAt: d.publishedAt?.toISOString() ?? null,
		canEdit: driveStart(d).getTime() > now.getTime(),
		counts: { checkedIn: counts.checkedIn, donated: counts.donated, walkins: counts.walkins, signups: counts.signups },
		percent: percentOf(counts.donated, d.target),
		canClose: d.date <= today,
		canCancel: driveStart(d).getTime() > now.getTime(),
		// names and masked phones: the full number is never shown
		people: people.map((p) => {
			const phone = p.userId ? p.userPhone : p.phone
			return { id: p.id, name: p.name, phone: phone ? maskPhone(phone) : null, source: p.userId ? ('account' as const) : ('guest' as const), arrived: p.arrivedAt !== null }
		}),
	}
	return c.json({ ...body, phase: d.date <= today ? 'day' : 'before' })
})

driveRoutes.post('/:did/interest/:iid/arrived', requireAuth, async (c: Context<AuthEnv>) => {
	const { arrived } = parseInput(driveArrivedInput, await readJson(c))
	const { d, now } = await own(c)
	if (d.status !== 'published') throw new ApiError(409, 'invalid_move', 'This drive is not running.')
	if (d.date > nairobiDay(now)) throw new ApiError(409, 'drive_not_started', 'Arrivals can be ticked on the day of the drive.')
	if (!(await setArrived(c.var.db, d.id, c.req.param('iid') ?? '', arrived ? now : null))) throw new ApiError(404, 'not_found', 'Not found.')
	return c.json({ arrived })
})

driveRoutes.post('/:did/close', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, user } = c.var
	const { d, f, now } = await own(c)
	if (d.status !== 'published') throw new ApiError(409, 'invalid_move', `A ${d.status.replace('_', ' ')} drive cannot be closed.`)
	if (d.date > nairobiDay(now)) throw new ApiError(409, 'drive_not_started', 'A drive can be closed from its day. Cancel it instead.')
	await closeDriveRow(db, d, now)
	await writeAudit(db, { actorId: user.id, action: 'drive.close', target: d.id, detail: f.id }, now)
	return c.json({ status: 'closed' })
})

async function summaryOf(c: Context<AuthEnv>): Promise<DriveSummary> {
	const { d } = await own(c)
	if (d.status !== 'closed') throw new ApiError(409, 'invalid_move', 'The summary is ready once the drive is closed.')
	const counts = await driveCounts(c.var.db, d)
	const { types, pending } = await driveBloodTypes(c.var.db, d)
	return {
		code: driveRef(d.number),
		host: d.host,
		venue: d.venue,
		town: d.town,
		date: d.date,
		starts: d.starts,
		ends: d.ends,
		target: d.target,
		percent: percentOf(counts.donated, d.target),
		counts: { checkedIn: counts.checkedIn, donated: counts.donated, deferred: counts.deferred, tested: counts.tested, walkins: counts.walkins, byCode: counts.byCode },
		came: { interested: d.interestTotal ?? 0, interestedCame: d.interestCame ?? 0, byCode: counts.byCode, walkins: counts.walkins, signups: counts.signups },
		bloodTypes: types,
		pendingResults: pending,
	}
}

driveRoutes.get('/:did/summary', requireAuth, async (c: Context<AuthEnv>) => c.json(await summaryOf(c)))

driveRoutes.get('/:did/summary/download', requireAuth, async (c: Context<AuthEnv>) => {
	const o = await summaryOf(c)
	const cell = (v: string | number) => {
		const t = String(v).replace(/^[=+@-]/, "'$&")
		return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
	}
	const lines: [string, string | number][] = [
		['Drive', `${o.code} ${o.host}`],
		['Date', o.date],
		['Venue', `${o.venue}, ${o.town}`],
		['Target', o.target ?? ''],
		['Checked in', o.counts.checkedIn],
		['Donated', o.counts.donated],
		['Deferred', o.counts.deferred],
		['Tested only', o.counts.tested],
		['Walk-ins', o.counts.walkins],
		['Checked in by donor code', o.counts.byCode],
		['Said they were interested', o.came.interested],
		['Interested and came', o.came.interestedCame],
		['New sign-ups', o.came.signups],
		...Object.entries(o.bloodTypes).map(([t, n]): [string, number] => [`Blood type ${t}`, n]),
	]
	return new Response(lines.map(([k, v]) => `${cell(k)},${cell(v)}`).join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${o.code}-summary.csv"` } })
})
