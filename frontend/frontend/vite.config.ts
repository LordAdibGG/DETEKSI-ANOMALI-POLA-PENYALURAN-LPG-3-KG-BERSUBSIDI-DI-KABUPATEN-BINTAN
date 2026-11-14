import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Pemecahan bundel (Fase 9):
 * - Halaman dipecah per rute lewat React.lazy di App.tsx.
 * - Pustaka besar dipisah ke chunk vendor agar bisa di-cache dan diunduh paralel.
 * - Data acuan baseline-k10 (JSON) dipisah supaya tidak membengkakkan kode aplikasi.
 */
function pecahChunk(id: string): string | undefined {
  if (id.includes('baselineProfilSnapshot.json')) return 'data-profil'
  if (id.includes('baselineSnapshot.json')) return 'data-acuan'
  if (!id.includes('node_modules')) return undefined
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
  if (/node_modules\/(react-router|react-router-dom|@remix-run)\//.test(id)) return 'vendor-router'
  if (/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(id)) return 'vendor-motion'
  if (/node_modules\/@tanstack\//.test(id)) return 'vendor-query'
  if (/node_modules\/(d3-[a-z-]+|internmap)\//.test(id)) return 'vendor-d3'
  if (/node_modules\/(@radix-ui|aria-hidden|react-remove-scroll|react-style-singleton|use-callback-ref|use-sidecar|get-nonce|tslib)\//.test(id)) return 'vendor-radix'
  return undefined
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: pecahChunk,
      },
    },
  },
})
