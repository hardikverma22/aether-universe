import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5195, host: true }, build: { target: 'esnext' } });
