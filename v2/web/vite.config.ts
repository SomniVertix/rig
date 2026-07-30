import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.RIG_HTTP_ADDR?.replace(/^:/, '') ?? '8789';
const backendTarget = `http://localhost:${backendPort}`;

// V2's Go backend serves REST unprefixed (no /api namespace) — proxy the exact
// path prefixes it owns, not a blanket '/', which would swallow Vite's own
// asset/HMR requests.
const proxiedPrefixes = [
	'/expeditions',
	'/expedition-by-spec',
	'/waypoints',
	'/waypoint-dependencies',
	'/specs',
	'/resolve',
	'/workspaces'
];

export default defineConfig({
	plugins: [react()],
	server: {
		proxy: Object.fromEntries(
			proxiedPrefixes.map((prefix) => [prefix, { target: backendTarget, changeOrigin: true }])
		)
	}
});
