import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` (mode "phone") serves over HTTPS on the LAN and proxies /api to the
// local backend. Phones only allow camera/mic on HTTPS pages, and an HTTPS page can't call
// the plain-HTTP backend (mixed content) - so the proxy keeps everything on one origin.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5180, // fixed so it doesn't collide with other Vite projects on the default 5173
    strictPort: true,
    allowedHosts: true, // lets tunnel hostnames (cloudflared / ngrok) through
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}));
