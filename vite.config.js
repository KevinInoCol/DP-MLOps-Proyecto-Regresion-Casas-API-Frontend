import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// La API de Cloud Run no expone cabeceras CORS, así que el navegador no
// puede llamarla directamente. En desarrollo, Vite reenvía /api/* a la API.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target =
    env.VITE_API_URL ||
    'https://servicio-api-proyecto-regresion-kevin-inofuente-967741749170.us-central1.run.app'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
