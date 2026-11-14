import { mysqlTable, varchar, text, datetime, bigint, json, index, int, boolean, date, decimal, mysqlEnum, uniqueIndex } from 'drizzle-orm/mysql-core'

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

// ---------- phase 1: accounts ----------

export const facilities = mysqlTable(
	'facilities',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		name: varchar('name', { length: 150 }).notNull(),
		type: varchar('type', { length: 40 }).notNull(), // hospital, health centre, blood bank
		town: varchar('town', { length: 80 }).notNull(),
		county: varchar('county', { length: 80 }).notNull(),
		status: mysqlEnum('status', ['pending', 'verified', 'suspended']).notNull().default('pending'),
	},
	(t) => [index('facilities_name_idx').on(t.name), index('facilities_town_idx').on(t.town)],
)

export const users = mysqlTable(
	'users',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
		email: varchar('email', { length: 254 }).notNull(),
		emailVerifiedAt: datetime('email_verified_at', { fsp: 3 }),
		phone: varchar('phone', { length: 16 }).notNull(),
		phoneVerifiedAt: datetime('phone_verified_at', { fsp: 3 }),
		passwordHash: varchar('password_hash', { length: 255 }).notNull(),
		status: mysqlEnum('status', ['active', 'suspended']).notNull().default('active'),
		tokenVersion: int('token_version').notNull().default(0),
		isSuperAdmin: boolean('is_super_admin').notNull().default(false),
		sex: mysqlEnum('sex', ['female', 'male']).notNull(),
		dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
		donorCode: varchar('donor_code', { length: 12 }),
		homeFacilityId: varchar('home_facility_id', { length: 26 }),
		unlistedFacilityName: varchar('unlisted_facility_name', { length: 150 }),
		smsOptIn: boolean('sms_opt_in').notNull().default(false),
		// recorded by a medical facility (never by the donor): a blood type makes a donor Verified
		bloodType: mysqlEnum('blood_type', ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']),
		weightKg: decimal('weight_kg', { precision: 4, scale: 1, mode: 'number' }),
		lastDonationOn: date('last_donation_on', { mode: 'string' }),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
		lastLoginAt: datetime('last_login_at', { fsp: 3 }),
	},
	(t) => [uniqueIndex('users_email_uq').on(t.email), uniqueIndex('users_phone_uq').on(t.phone), uniqueIndex('users_donor_code_uq').on(t.donorCode)],
)

export const userExtraFacilities = mysqlTable(
	'user_extra_facilities',
	{ userId: varchar('user_id', { length: 26 }).notNull(), facilityId: varchar('facility_id', { length: 26 }).notNull() },
	(t) => [uniqueIndex('user_extra_facilities_uq').on(t.userId, t.facilityId)],
)

/** People who said their facility is not listed: the demand list the super admin sees later. */
export const facilityRequests = mysqlTable('facility_requests', {
	id: varchar('id', { length: 26 }).primaryKey(),
	name: varchar('name', { length: 150 }).notNull(),
	userId: varchar('user_id', { length: 26 }).notNull(),
	createdAt: datetime('created_at', { fsp: 3 }).notNull(),
})

/** Opaque, stored hashed, rotated on every use. A used token that comes back again kills its whole family. */
export const refreshTokens = mysqlTable(
	'refresh_tokens',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		userId: varchar('user_id', { length: 26 }).notNull(),
		familyId: varchar('family_id', { length: 26 }).notNull(),
		tokenHash: varchar('token_hash', { length: 64 }).notNull(),
		expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
		usedAt: datetime('used_at', { fsp: 3 }),
		revokedAt: datetime('revoked_at', { fsp: 3 }),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
		userAgent: varchar('user_agent', { length: 255 }),
	},
	(t) => [uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash), index('refresh_tokens_family_idx').on(t.familyId), index('refresh_tokens_user_idx').on(t.userId)],
)

/** Counters for throttling, keyed like `login:email:<hash>`. */
export const rateLimits = mysqlTable('rate_limits', {
	key: varchar('key', { length: 190 }).primaryKey(),
	windowStart: datetime('window_start', { fsp: 3 }).notNull(),
	count: int('count').notNull(),
})

// ---------- phase 1b: verification and reset ----------
/** One-use links sent by email: verify the address, or reset the password. Stored hashed. */
export const authTokens = mysqlTable(
	'auth_tokens',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		userId: varchar('user_id', { length: 26 }).notNull(),
		kind: mysqlEnum('kind', ['verify_email', 'reset_password']).notNull(),
		tokenHash: varchar('token_hash', { length: 64 }).notNull(),
		expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
		usedAt: datetime('used_at', { fsp: 3 }),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
	},
	(t) => [uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash), index('auth_tokens_user_idx').on(t.userId, t.kind)],
)

/** Six-digit phone codes, stored hashed. Five wrong tries lock the code for 15 minutes. */
export const phoneOtps = mysqlTable(
	'phone_otps',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		userId: varchar('user_id', { length: 26 }).notNull(),
		phone: varchar('phone', { length: 16 }).notNull(),
		codeHash: varchar('code_hash', { length: 64 }).notNull(),
		expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
		attempts: int('attempts').notNull().default(0),
		lockedUntil: datetime('locked_until', { fsp: 3 }),
		usedAt: datetime('used_at', { fsp: 3 }),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
	},
	(t) => [index('phone_otps_user_idx').on(t.userId, t.createdAt)],
)

// ---------- phase 2a: asking to donate or get tested ----------
/** A donor asks a facility for a blood type test or a donation; the facility approves and sets a date. */
export const donationRequests = mysqlTable(
	'donation_requests',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		userId: varchar('user_id', { length: 26 }).notNull(),
		facilityId: varchar('facility_id', { length: 26 }).notNull(),
		kind: mysqlEnum('kind', ['test', 'donate']).notNull(),
		days: varchar('days', { length: 27 }).notNull(), // 'mon,wed,fri'
		timeOfDay: mysqlEnum('time_of_day', ['morning', 'afternoon', 'any']).notNull(),
		status: mysqlEnum('status', ['requested', 'scheduled', 'completed', 'cancelled', 'no_show']).notNull().default('requested'),
		scheduledAt: datetime('scheduled_at', { fsp: 3 }),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
		updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
	},
	(t) => [index('donation_requests_user_idx').on(t.userId, t.createdAt), index('donation_requests_facility_idx').on(t.facilityId, t.status)],
)
