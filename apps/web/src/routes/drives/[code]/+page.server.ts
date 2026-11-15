import { error } from '@sveltejs/kit'
import type { PublicDrive } from '@damu/shared-types'
import { publicGet } from '$lib/server/api'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, request, getClientAddress }) => {
	const r = await publicGet<PublicDrive>(`/public/drives/${encodeURIComponent(params.code)}`, request, getClientAddress)
	if (r.status === 404) error(404, 'This drive was not found.')
	if (!r.data) error(502, 'Drives are not available right now. Please try again.')
	return { drive: r.data }
}
