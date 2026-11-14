import { facilityCodeExists, listFacilityEvents, listMemberFacilities, type Db, type Facility, type FacilityEvent } from '@damu/db'
import { newFacilityCode, type FacilityEventView, type MyFacilityView } from '@damu/shared-types'

export async function uniqueFacilityCode(db: Db): Promise<string> {
	let code: string
	do code = newFacilityCode()
	while (await facilityCodeExists(db, code))
	return code
}

export const eventView = (e: FacilityEvent, byName: string | null): FacilityEventView => ({ id: e.id, kind: e.kind, text: e.text, how: e.how, visible: e.visible, at: e.createdAt.toISOString(), byName })

/** One facility as its own people see it: status, code and the messages meant for them (never the reviewers' notes). */
export async function myFacilityView(db: Db, f: Facility, role: 'admin' | 'attendant'): Promise<MyFacilityView> {
	return {
		id: f.id,
		name: f.name,
		type: f.type,
		town: f.town,
		county: f.county,
		status: f.status,
		role,
		facilityCode: f.facilityCode,
		licenseNumber: f.licenseNumber,
		owner: f.owner,
		address: f.address,
		lat: f.lat,
		lng: f.lng,
		phone: f.phone,
		email: f.email,
		submittedAt: f.submittedAt?.toISOString() ?? null,
		messages: (await listFacilityEvents(db, f.id, true)).map(({ e, byName }) => eventView(e, byName)),
	}
}

export async function managedFacilities(db: Db, userId: string) {
	return (await listMemberFacilities(db, userId)).map(({ f, role }) => ({ id: f.id, name: f.name, status: f.status, role }))
}
