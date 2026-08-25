import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Escáner Inteligente de Carne',
        short_name: 'Escáner Carne',
        description: 'PWA para escanear etiquetas de cajas de carne',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'https://cdn.iconscout.com/icon/free/png-256/free-meat-icon-download-in-svg-png-gif-file-formats--steak-food-beef-barbecue-camping-pack-nature-icons-1196924.png',
            sizes: '256x256',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
