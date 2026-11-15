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
		type: varchar('type', { length: 40 }).notNull(), // hospital, health centre, dispensary, clinic, blood bank
		town: varchar('town', { length: 80 }).notNull(),
		county: varchar('county', { length: 80 }).notNull(),
		// `incomplete`: signed up but the profile is not finished. `needs_info`: the reviewer asked a question.
		status: mysqlEnum('status', ['incomplete', 'pending', 'needs_info', 'verified', 'rejected', 'suspended']).notNull().default('pending'),
		licenseNumber: varchar('license_number', { length: 60 }),
		owner: varchar('owner', { length: 150 }),
		address: varchar('address', { length: 200 }),
		lat: decimal('lat', { precision: 9, scale: 6, mode: 'number' }),
		lng: decimal('lng', { precision: 9, scale: 6, mode: 'number' }),
		phone: varchar('phone', { length: 20 }),
		email: varchar('email', { length: 254 }),
		/** What attendants type at login to open the facility side. */
		facilityCode: varchar('facility_code', { length: 12 }),
		/** The public invite link: /join/<slug>. Only verified facilities answer to it. */
		slug: varchar('slug', { length: 80 }),
		createdBy: varchar('created_by', { length: 26 }),
		submittedAt: datetime('submitted_at', { fsp: 3 }),
		verifiedAt: datetime('verified_at', { fsp: 3 }),
	},
	(t) => [index('facilities_name_idx').on(t.name), index('facilities_town_idx').on(t.town), uniqueIndex('facilities_code_uq').on(t.facilityCode), uniqueIndex('facilities_slug_uq').on(t.slug), index('facilities_license_idx').on(t.licenseNumber), index('facilities_status_idx').on(t.status, t.submittedAt)],
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
		// empty for people who run or work at a facility without being donors
		sex: mysqlEnum('sex', ['female', 'male']),
		dateOfBirth: date('date_of_birth', { mode: 'string' }),
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
	town: varchar('town', { length: 80 }),
	county: varchar('county', { length: 80 }),
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

// ---------- phase 2b: donor settings ----------
/** A donor's alert and reminder choices. No row yet means the defaults (alerts follow the sign-up SMS choice). */
export const donorPrefs = mysqlTable('donor_prefs', {
	userId: varchar('user_id', { length: 26 }).primaryKey(),
	smsAlerts: boolean('sms_alerts').notNull(),
	emailAlerts: boolean('email_alerts').notNull().default(false),
	available: boolean('available').notNull().default(true),
	pausedUntil: datetime('paused_until', { fsp: 3 }),
	weeklyCap: int('weekly_cap'), // null = the system default
	quietFrom: int('quiet_from'), // hour 0-23, null = the system default
	quietTo: int('quiet_to'),
	reminderCycle: mysqlEnum('reminder_cycle', ['on_day', 'days_before', 'custom', 'off']).notNull().default('on_day'),
	reminderDaysBefore: int('reminder_days_before').notNull().default(3),
	reminderCycleMonths: int('reminder_cycle_months'),
	appointmentReminders: boolean('appointment_reminders').notNull().default(true),
	updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
})

// ---------- phase 3a: facilities, members and the review trail ----------
/** Who runs a facility. The person who adds it is its admin; attendants are added later. */
export const facilityMembers = mysqlTable(
	'facility_members',
	{
		facilityId: varchar('facility_id', { length: 26 }).notNull(),
		userId: varchar('user_id', { length: 26 }).notNull(),
		role: mysqlEnum('role', ['admin', 'attendant']).notNull(),
		roleTitle: varchar('role_title', { length: 80 }), // "Laboratory in charge", as the applicant wrote it
		canApprove: boolean('can_approve').notNull().default(false), // may approve or reject blood requests (admins always may)
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
	},
	(t) => [uniqueIndex('facility_members_uq').on(t.facilityId, t.userId), index('facility_members_user_idx').on(t.userId)],
)

/** What happened to a facility's application. `visible` events (questions, replies, reasons) are shown to the applicant; notes are for reviewers only. */
export const facilityEvents = mysqlTable(
	'facility_events',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		facilityId: varchar('facility_id', { length: 26 }).notNull(),
		actorId: varchar('actor_id', { length: 26 }),
		kind: mysqlEnum('kind', ['submitted', 'resubmitted', 'ask', 'reply', 'approve', 'reject', 'suspend', 'reactivate', 'note']).notNull(),
		how: varchar('how', { length: 80 }), // how the reviewer checked
		text: text('text'),
		visible: boolean('visible').notNull().default(false),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
	},
	(t) => [index('facility_events_facility_idx').on(t.facilityId, t.createdAt)],
)

// ---------- phase 3b: inviting people to a facility ----------
/** An admin invites someone by email. The link works once, for 14 days. */
export const facilityInvites = mysqlTable(
	'facility_invites',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		facilityId: varchar('facility_id', { length: 26 }).notNull(),
		email: varchar('email', { length: 254 }).notNull(),
		role: mysqlEnum('role', ['admin', 'attendant']).notNull(),
		tokenHash: varchar('token_hash', { length: 64 }).notNull(),
		invitedBy: varchar('invited_by', { length: 26 }).notNull(),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
		expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
		acceptedAt: datetime('accepted_at', { fsp: 3 }),
		revokedAt: datetime('revoked_at', { fsp: 3 }),
	},
	(t) => [uniqueIndex('facility_invites_hash_uq').on(t.tokenHash), index('facility_invites_facility_idx').on(t.facilityId, t.email)],
)

// ---------- phase 4a: requests for blood ----------
/** A request for blood. The patient columns are private: only the requester and the facility's team ever read them. */
export const bloodRequests = mysqlTable(
	'blood_requests',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		number: int('number').notNull(), // REQ-0042, one running number for the whole system
		facilityId: varchar('facility_id', { length: 26 }).notNull(),
		requesterId: varchar('requester_id', { length: 26 }), // null when the facility raised it
		raisedBy: varchar('raised_by', { length: 26 }), // the attendant, for a facility's own request
		source: mysqlEnum('source', ['public', 'facility']).notNull(),
		patientRef: varchar('patient_ref', { length: 120 }).notNull(),
		patientRefKey: varchar('patient_ref_key', { length: 120 }).notNull(), // normalised, for "one open request per patient"
		patientName: varchar('patient_name', { length: 120 }),
		relation: varchar('relation', { length: 20 }),
		bloodTypeAsked: varchar('blood_type_asked', { length: 8 }).notNull(),
		unitsAsked: int('units_asked').notNull(),
		neededBy: datetime('needed_by', { fsp: 3 }).notNull(),
		urgencyAsked: mysqlEnum('urgency_asked', ['normal', 'urgent', 'surge']).notNull(),
		note: text('note'),
		internalNote: text('internal_note'),
		status: mysqlEnum('status', ['pending', 'needs_info', 'confirmed', 'approved', 'published', 'closed', 'rejected', 'cancelled']).notNull(),
		bloodType: varchar('blood_type', { length: 4 }), // the facility's confirmed values
		units: int('units'),
		urgency: mysqlEnum('urgency', ['normal', 'urgent', 'surge']),
		confirmedBy: varchar('confirmed_by', { length: 26 }),
		confirmedAt: datetime('confirmed_at', { fsp: 3 }),
		decidedBy: varchar('decided_by', { length: 26 }),
		decidedAt: datetime('decided_at', { fsp: 3 }),
		rejectReason: varchar('reject_reason', { length: 30 }),
		rejectMessage: text('reject_message'),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
		updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
	},
	(t) => [
		uniqueIndex('blood_requests_number_uq').on(t.number),
		index('blood_requests_facility_idx').on(t.facilityId, t.status, t.createdAt),
		index('blood_requests_requester_idx').on(t.requesterId, t.createdAt),
		index('blood_requests_patient_idx').on(t.facilityId, t.patientRefKey, t.status),
	],
)

/** What happened to a request. `visibleToRequester` events make up the requester's timeline. */
export const requestEvents = mysqlTable(
	'request_events',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		requestId: varchar('request_id', { length: 26 }).notNull(),
		kind: mysqlEnum('kind', ['sent', 'raised', 'confirmed', 'asked', 'replied', 'approved', 'rejected', 'cancelled', 'published', 'closed']).notNull(),
		actorId: varchar('actor_id', { length: 26 }),
		note: text('note'),
		visibleToRequester: boolean('visible_to_requester').notNull().default(true),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
	},
	(t) => [index('request_events_request_idx').on(t.requestId, t.createdAt)],
)

/** A published request: the public appeal. One per request. `number` is the public CALL-0187 code, `short` the link code. */
export const calls = mysqlTable(
	'calls',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		number: int('number').notNull(),
		short: varchar('short', { length: 8 }).notNull(),
		requestId: varchar('request_id', { length: 26 }).notNull(),
		facilityId: varchar('facility_id', { length: 26 }).notNull(),
		bloodType: varchar('blood_type', { length: 4 }).notNull(), // the patient's type, shown on the page
		types: json('types').$type<string[]>().notNull(), // donor types invited (compatible, maybe narrowed)
		urgency: mysqlEnum('urgency', ['normal', 'urgent', 'surge']).notNull(),
		publicText: varchar('public_text', { length: 500 }).notNull(),
		isPublic: boolean('is_public').notNull(),
		smsEnabled: boolean('sms_enabled').notNull().default(false),
		status: mysqlEnum('status', ['live', 'closed', 'expired', 'taken_down']).notNull(),
		unitsNeeded: int('units_needed').notNull(),
		publishedAt: datetime('published_at', { fsp: 3 }).notNull(),
		closesAt: datetime('closes_at', { fsp: 3 }).notNull(),
		extendedDays: int('extended_days').notNull().default(0),
		ringSent: int('ring_sent').notNull().default(0), // the furthest ring alerted so far (SMS)
		closedAt: datetime('closed_at', { fsp: 3 }),
		closeReason: varchar('close_reason', { length: 20 }),
		createdBy: varchar('created_by', { length: 26 }).notNull(),
	},
	(t) => [uniqueIndex('calls_number_uq').on(t.number), uniqueIndex('calls_short_uq').on(t.short), uniqueIndex('calls_request_uq').on(t.requestId), index('calls_facility_idx').on(t.facilityId, t.status), index('calls_live_idx').on(t.status, t.closesAt)],
)

/** A donor who said YES to a call. The facility sees these rows; the requester and the public never do. */
export const callResponses = mysqlTable(
	'call_responses',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		callId: varchar('call_id', { length: 26 }).notNull(),
		userId: varchar('user_id', { length: 26 }).notNull(),
		ring: int('ring').notNull(),
		status: mysqlEnum('status', ['willing', 'scheduled', 'donated', 'not_needed']).notNull(),
		repliedAt: datetime('replied_at', { fsp: 3 }).notNull(),
		scheduledAt: datetime('scheduled_at', { fsp: 3 }),
		donationId: varchar('donation_id', { length: 26 }),
	},
	(t) => [uniqueIndex('call_responses_donor_uq').on(t.callId, t.userId), index('call_responses_call_idx').on(t.callId, t.repliedAt)],
)

/** One SMS alert to one donor for one call. Reserved before sending, so a retry never texts anyone twice; also the record of what was sent (no text, no full number). */
export const callAlerts = mysqlTable(
	'call_alerts',
	{
		id: varchar('id', { length: 26 }).primaryKey(),
		callId: varchar('call_id', { length: 26 }).notNull(),
		userId: varchar('user_id', { length: 26 }).notNull(),
		ring: int('ring').notNull(),
		status: mysqlEnum('status', ['reserved', 'sent', 'failed']).notNull(),
		error: varchar('error', { length: 200 }),
		createdAt: datetime('created_at', { fsp: 3 }).notNull(),
		sentAt: datetime('sent_at', { fsp: 3 }),
	},
	(t) => [uniqueIndex('call_alerts_donor_uq').on(t.callId, t.userId), index('call_alerts_user_idx').on(t.userId, t.sentAt)],
)
