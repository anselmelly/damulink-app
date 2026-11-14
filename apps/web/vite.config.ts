import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// In development /api goes to the API process, so the browser sees one origin (as it will behind Caddy).
export default defineConfig({
	plugins: [tailwindcss(), sveltekit({ adapter: adapter(), alias: { '$lib': 'src/lib' } })],
	server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:8790' } },
})
