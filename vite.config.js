import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Use relative base path for asset linking
  server: {
    host: true, // Listen on all network interfaces
    hmr: {
      clientPort: 443 // Necessary for HMR through HTTPS tunnels like ngrok
    },
    // Allow any subdomain of ngrok-free.app
    allowedHosts: ['.ngrok-free.app'],
    // Add headers to prevent browser caching during development
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  }
});
