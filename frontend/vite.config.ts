import { defineConfig } from 'vitest/config';
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
	// vitest 2.x's own vite peer (5.4.21, confirmed via `pnpm why vite`) is
	// duplicated alongside this project's direct vite 7.3.6 devDependency —
	// their Plugin/UserConfig types genuinely differ in shape across that
	// version gap, so @vitejs/plugin-react's vite-7-typed return doesn't
	// structurally satisfy vitest/config's vite-5-typed Plugin. Harmless at
	// runtime (same plugin object either way); the cast only silences the
	// type-level version skew.
	plugins: [react() as any],
	server: {
		proxy: Object.fromEntries(
			proxiedPrefixes.map((prefix) => [prefix, { target: backendTarget, changeOrigin: true }])
		)
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['./src/test/setup.ts']
	}
});
