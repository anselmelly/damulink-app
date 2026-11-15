import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/** The short link people share: it lands on the full call page. */
export const GET: RequestHandler = ({ params }) => redirect(302, `/calls/${encodeURIComponent(params.short)}`)
