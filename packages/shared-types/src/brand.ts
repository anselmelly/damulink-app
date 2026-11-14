// The name lives here and nowhere else. Product code reads BRAND.
export type BrandProfile = { name: string; slug: string; codePrefix: string; domain: string; supportEmail: string; tagline: string; slogan: string }

export const BRANDS = {
	damulink: { name: 'DamuLink', slug: 'damulink', codePrefix: 'DL', domain: 'dm.anselmelly.com', supportEmail: 'hello@dm.anselmelly.com', tagline: 'Link donors, save lives', slogan: 'Help, found in time.' },
} as const satisfies Record<string, BrandProfile>

export type BrandKey = keyof typeof BRANDS
export const ACTIVE_BRAND: BrandKey = 'damulink'
export const BRAND: BrandProfile = BRANDS[ACTIVE_BRAND]
