import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'motion';
        },
      },
    },
  },
});
