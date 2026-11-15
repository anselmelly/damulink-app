import { error } from '@sveltejs/kit'
import type { PublicCall } from '@damu/shared-types'
import { publicGet } from '$lib/server/api'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, request, getClientAddress }) => {
	const r = await publicGet<PublicCall>(`/public/calls/${encodeURIComponent(params.code)}`, request, getClientAddress)
	if (r.status === 404) error(404, 'This call was not found.')
	if (!r.data) error(502, 'Calls are not available right now. Please try again.')
	return { call: r.data }
}
