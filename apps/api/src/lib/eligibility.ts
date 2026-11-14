import { z } from 'zod'
import { getSetting, type Db } from '@damu/db'
import { DEFAULT_ELIGIBILITY, type EligibilitySettings } from '@damu/shared-types'

const shape = z.object({
	minAge: z.number().int().min(0),
	maxAge: z.number().int().min(1),
	minWeightKg: z.number().min(0),
	waitingMonthsMale: z.number().int().min(0),
	waitingMonthsFemale: z.number().int().min(0),
})

/** The eligibility values from the settings table. A missing or damaged value means the defaults, never an error page. */
export async function getEligibilitySettings(db: Db): Promise<EligibilitySettings> {
	const stored = await getSetting<unknown>(db, 'eligibility')
	const parsed = shape.safeParse(stored)
	return parsed.success ? parsed.data : DEFAULT_ELIGIBILITY
}
