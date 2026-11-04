import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev server proxies /v1/* and /health to the ASE API (default localhost:3000,
// override with VITE_API_TARGET) so the frontend and engine share one origin
// in development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': process.env.VITE_API_TARGET ?? 'http://localhost:3000',
      '/health': process.env.VITE_API_TARGET ?? 'http://localhost:3000',
    },
  },
});
