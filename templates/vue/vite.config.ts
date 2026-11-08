import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1424,
    strictPort: true,
  },
});
