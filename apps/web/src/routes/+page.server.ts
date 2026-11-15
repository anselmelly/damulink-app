import type { PublicCallList, PublicDriveList } from '@damu/shared-types'
import { publicGet } from '$lib/server/api'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request, getClientAddress }) => {
	const r = await publicGet<PublicCallList>('/public/calls', request, getClientAddress)
	const dr = await publicGet<PublicDriveList>('/public/drives', request, getClientAddress)
	return { calls: (r.data?.items ?? []).slice(0, 3), drives: (dr.data?.items ?? []).slice(0, 2) }
}
