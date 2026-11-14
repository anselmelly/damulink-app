import { eq } from 'drizzle-orm'
import { loadDotEnv } from './dotenv'
import { makeDb } from './client'
import { facilities } from './schema'

// Development data: invented medical facilities (the same fictional places the design mocks use), safe to run again.
loadDotEnv()
const need = (k: string) => {
	const v = process.env[k]
	if (!v) throw new Error(`Missing ${k}`)
	return v
}

type Seed = { name: string; type: 'hospital' | 'health centre' | 'blood bank'; town: string; county: string; status?: 'verified' | 'pending' | 'rejected' }
const SEED: Seed[] = [
	{ name: 'Eastlands Hospital', type: 'hospital', town: 'Nairobi', county: 'Nairobi' },
	{ name: 'Capital Blood Bank', type: 'blood bank', town: 'Nairobi', county: 'Nairobi' },
	{ name: 'Rift County Hospital', type: 'hospital', town: 'Nakuru', county: 'Nakuru' },
	{ name: 'Lakeside Health Centre', type: 'health centre', town: 'Naivasha', county: 'Nakuru' },
	{ name: 'Lakeview Hospital', type: 'hospital', town: 'Kisumu', county: 'Kisumu' },
	{ name: 'Coast Medical Centre', type: 'hospital', town: 'Mombasa', county: 'Mombasa' },
	{ name: 'Highlands Mission Hospital', type: 'hospital', town: 'Eldoret', county: 'Uasin Gishu' },
	{ name: 'Mount Valley Health Centre', type: 'health centre', town: 'Nyeri', county: 'Nyeri' },
	{ name: 'Riverside Health Centre', type: 'health centre', town: 'Thika', county: 'Kiambu' },
	{ name: 'Sunrise Clinic', type: 'health centre', town: 'Kisii', county: 'Kisii', status: 'rejected' }, // not verified: stays out of the public list and the review queue
]

/** A fixed 26-character id per facility, so running the seed again updates rows instead of adding copies. */
const idFor = (name: string) => ('01SEED' + name.toUpperCase().replace(/[^A-Z0-9]/g, '')).padEnd(26, '0').slice(0, 26)

const { db, pool } = makeDb({ host: need('DB_HOST'), port: Number(process.env.DB_PORT ?? 3306), user: need('DB_USER'), password: need('DB_PASSWORD'), database: need('DB_NAME') })
for (const f of SEED) {
	const row = { id: idFor(f.name), name: f.name, type: f.type, town: f.town, county: f.county, status: f.status ?? 'verified' }
	await db.insert(facilities).values(row).onDuplicateKeyUpdate({ set: { name: row.name, type: row.type, town: row.town, county: row.county, status: row.status } })
}
const verified = (await db.select().from(facilities).where(eq(facilities.status, 'verified'))).length
console.log(`seeded ${SEED.length} facilities into ${process.env.DB_NAME} (${verified} verified in total)`)
await pool.end()
