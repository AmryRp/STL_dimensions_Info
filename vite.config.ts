import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Static output works on both Vercel and Sites without a server.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1' },
});
