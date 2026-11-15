import type { PublicCallList } from '@damu/shared-types'
import { publicGet } from '$lib/server/api'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ url, request, getClientAddress }) => {
	const q = new URLSearchParams()
	for (const k of ['bloodType', 'town', 'urgent']) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k)!)
	const r = await publicGet<PublicCallList>(`/public/calls?${q}`, request, getClientAddress)
	return { items: r.data?.items ?? [], failed: !r.data, filters: { bloodType: url.searchParams.get('bloodType') ?? '', town: url.searchParams.get('town') ?? '', urgent: url.searchParams.get('urgent') === '1' } }
}
