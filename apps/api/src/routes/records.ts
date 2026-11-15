import { Hono, type Context } from 'hono'
import { findDonorByCode, donationBefore, getMembership, hasRecordHere, insertCorrections, latestDonationHere, listCorrections, recordDonorFacts, updateDonation, writeAudit } from '@damu/db'
import { CORRECTION_DEFAULTS, CORRECTION_REASONS, addMonths, correctionInput, normalizeDonorCode, type CorrectionLogItem, type RecordView } from '@damu/shared-types'
import type { AppEnv } from '../app'
import { desk } from '../lib/desk'
import { getEligibilitySettings } from '../lib/eligibility'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { numberSetting } from '../lib/requests'
import { parseInput, readJson } from '../lib/validate'
import { requireAuth, type AuthEnv } from '../middleware/auth'

/** Mounted at /api/my-facilities/:id/records. Only records this facility made; any other donor is "not found". */
export const recordRoutes = new Hono<AppEnv>()

async function open(c: Context<AuthEnv>) {
	const { db, user } = c.var
	const f = await desk(c)
	const donor = await findDonorByCode(db, normalizeDonorCode(c.req.param('code') ?? ''))
	if (!donor || !(await hasRecordHere(db, donor.id, f.id))) throw new ApiError(404, 'not_found', 'Not found.')
	const isAdmin = (await getMembership(db, f.id, user.id))?.role === 'admin'
	return { f, donor, isAdmin }
}
const hoursOld = (from: Date | null | undefined, now: Date) => (from ? (now.getTime() - from.getTime()) / 3600_000 : Infinity)

recordRoutes.get('/:code', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock } = c.var
	const { f, donor, isAdmin } = await open(c)
	const now = clock.now()
	const don = await latestDonationHere(db, donor.id, f.id)
	const limit = await numberSetting(db, 'corrections.attendant_hours', CORRECTION_DEFAULTS.attendantHours)
	const ownType = donor.bloodTypeFacilityId === f.id
	const oldest = Math.min(ownType ? hoursOld(donor.bloodTypeAt, now) : 0, don ? hoursOld(don.createdAt, now) : 0)
	const log: CorrectionLogItem[] = (await listCorrections(db, f.id, donor.id)).map(({ c: x, by }) => ({ id: x.id, field: x.field, oldValue: x.oldValue, newValue: x.newValue, reason: x.reason, note: x.note, by, at: x.createdAt.toISOString() }))
	const body: RecordView = { name: donor.name, code: donor.donorCode!, bloodType: donor.bloodType, weightKg: donor.weightKg, lastDonationOn: donor.lastDonationOn, own: { bloodType: ownType, donation: !!don }, locked: !isAdmin && oldest > limit, log }
	return c.json(body)
})

recordRoutes.post('/:code/correct', requireAuth, async (c: Context<AuthEnv>) => {
	const { db, clock, user } = c.var
	const { f, donor, isAdmin } = await open(c)
	const input = parseInput(correctionInput, await readJson(c))
	const now = clock.now()
	const today = now.toISOString().slice(0, 10)
	const limit = await numberSetting(db, 'corrections.attendant_hours', CORRECTION_DEFAULTS.attendantHours)
	const don = await latestDonationHere(db, donor.id, f.id)
	const bad = (fields: Record<string, string>) => new ApiError(422, 'invalid_input', 'Please check the highlighted fields.', fields)
	const rows: Parameters<typeof insertCorrections>[1] = []
	const base = { userId: donor.id, facilityId: f.id, reason: input.reason, note: input.note || null, correctedBy: user.id, createdAt: now }
	const locked = (made: Date | null | undefined) => {
		if (!isAdmin && hoursOld(made, now) > limit) throw new ApiError(403, 'locked', 'This record is older than a day. Only a facility admin can change it.')
	}

	if (input.bloodType !== undefined && input.bloodType !== donor.bloodType) {
		if (donor.bloodTypeFacilityId !== f.id) throw new ApiError(409, 'not_your_record', 'This blood type was verified by another facility, so it cannot be changed here.')
		locked(donor.bloodTypeAt)
		rows.push({ ...base, id: newId(now.getTime()), field: 'blood_type', oldValue: donor.bloodType, newValue: input.bloodType })
	}
	if (input.weightKg !== undefined && input.weightKg !== donor.weightKg) {
		if (!don) throw new ApiError(409, 'not_your_record', 'The weight was not recorded by this facility.')
		locked(don.createdAt)
		rows.push({ ...base, id: newId(now.getTime() + 1), field: 'weight', oldValue: donor.weightKg == null ? null : String(donor.weightKg), newValue: String(input.weightKg) })
	}
	if (input.lastDonationOn !== undefined && input.lastDonationOn !== don?.donatedOn) {
		if (!don) throw new ApiError(409, 'not_your_record', 'The donation was not recorded by this facility.')
		locked(don.createdAt)
		const s = await getEligibilitySettings(db)
		const d = input.lastDonationOn
		if (d > today) throw bad({ lastDonationOn: 'A donation cannot be in the future' })
		if (donor.dateOfBirth && d < addMonths(donor.dateOfBirth, s.minAge * 12)) throw bad({ lastDonationOn: `The donor was under ${s.minAge} on that date` })
		const prev = await donationBefore(db, donor.id, d, don.id)
		if (prev && d < addMonths(prev.donatedOn, donor.sex === 'male' ? s.waitingMonthsMale : s.waitingMonthsFemale)) throw bad({ lastDonationOn: 'That is inside the waiting period after the donation before it' })
		rows.push({ ...base, id: newId(now.getTime() + 2), field: 'last_donation', oldValue: don.donatedOn, newValue: d })
	}
	if (!rows.length) throw bad({ bloodType: 'Change at least one value' })

	for (const r of rows) {
		if (r.field === 'blood_type') await recordDonorFacts(db, donor.id, { bloodType: r.newValue as any })
		if (r.field === 'weight') {
			await recordDonorFacts(db, donor.id, { weightKg: Number(r.newValue) })
			await updateDonation(db, don!.id, { weightKg: Number(r.newValue) })
		}
		if (r.field === 'last_donation') {
			await updateDonation(db, don!.id, { donatedOn: r.newValue })
			await recordDonorFacts(db, donor.id, { lastDonationOn: r.newValue })
		}
	}
	await insertCorrections(db, rows)
	await writeAudit(db, { actorId: user.id, action: 'record.correct', target: donor.id, detail: `${f.id} ${rows.map((r) => r.field).join(',')} ${input.reason}` }, now)
	return c.json({ ok: true, reasonText: CORRECTION_REASONS[input.reason] })
})
