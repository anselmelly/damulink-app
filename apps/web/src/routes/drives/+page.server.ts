import type { PublicDriveList } from '@damu/shared-types'
import { publicGet } from '$lib/server/api'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ url, request, getClientAddress }) => {
	const town = url.searchParams.get('town')?.trim() ?? ''
	const r = await publicGet<PublicDriveList>(`/public/drives${town ? `?town=${encodeURIComponent(town)}` : ''}`, request, getClientAddress)
	return { items: r.data?.items ?? [], failed: !r.data, town }
}
