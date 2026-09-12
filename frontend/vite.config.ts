import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Vite's dev server binds to localhost only by default, which is
    // unreachable from outside its own container -- host: true binds
    // 0.0.0.0 so `docker compose`'s port mapping can actually reach it.
    // Harmless for host-machine dev too (still reachable at localhost).
    host: true,
    port: 5173,
    watch: {
      // The frontend container's source is a bind mount from the Windows
      // host (docker-compose.yml's `./frontend:/app`) -- native filesystem
      // change events from the host don't propagate through that mount
      // into the container's Linux filesystem, so Vite's default watcher
      // never fires and HMR silently does nothing. Polling reads mtimes
      // directly instead of waiting for an event that never arrives.
      // Irrelevant (and free) for host-machine dev, where native events
      // work fine.
      usePolling: true,
      interval: 300,
    },
  },
})
