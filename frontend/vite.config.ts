import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Where the dev server's proxy finds each service: on this machine's
// localhost ports when Vite runs on the host, by compose service name when
// it runs in the frontend container (OPENSCALE_PROXY_HOSTS=compose).
const inCompose = process.env.OPENSCALE_PROXY_HOSTS === 'compose'
const upstream = (service: string, port: number) => `http://${inCompose ? service : 'localhost'}:${port}`

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
    // The browser only ever talks to the page's own origin; this forwards
    // the API (WebSockets too) and the embedded/linked tools to their
    // services, so the app works from any address -- including another
    // laptop on the LAN, whose "localhost" is not this machine. The same
    // routes exist in the deploy gateway (gateway/Caddyfile). No
    // changeOrigin on /api: the Host header stays the page's host, which
    // the control-plane's WebSocket origin check compares the Origin to.
    proxy: {
      '/api': { target: upstream('control-plane', 8080), ws: true },
      // MLflow's UI uses relative links, so the prefix is stripped; its
      // DNS-rebinding guard only accepts a local Host header.
      '/mlflow': {
        target: upstream('mlflow', 5000),
        rewrite: (p) => p.replace(/^\/mlflow/, '') || '/',
        headers: { host: 'localhost:5000' },
      },
      // These three serve from their prefix themselves (docker-compose.yml).
      '/jupyter': { target: upstream('jupyter', 8888), ws: true },
      '/grafana': { target: upstream('grafana', 3000), ws: true },
      '/prometheus': { target: upstream('prometheus', 9090) },
    },
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
