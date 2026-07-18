import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.RELENTLESS_WEB_PORT ?? '8788';
const backendTarget = `http://localhost:${backendPort}`;

export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			'/api': {
				target: backendTarget,
				changeOrigin: true
			},
			'/docs': {
				target: backendTarget,
				changeOrigin: true
			}
		}
	}
});
