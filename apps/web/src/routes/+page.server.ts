import type { PublicCallList } from '@damu/shared-types'
import { publicGet } from '$lib/server/api'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request, getClientAddress }) => {
	const r = await publicGet<PublicCallList>('/public/calls', request, getClientAddress)
	return { calls: (r.data?.items ?? []).slice(0, 3) }
}
