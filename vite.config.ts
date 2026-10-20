import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the sync server runs separately (npm run dev starts both)
const SERVER = `localhost:${process.env.SERVER_PORT ?? 1234}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://${SERVER}`,
      '/ws': { target: `ws://${SERVER}`, ws: true },
    },
  },
});
