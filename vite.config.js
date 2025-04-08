import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Listen on all network interfaces
    hmr: {
      clientPort: 443 // Necessary for HMR through HTTPS tunnels like ngrok
    },
    // Allow any subdomain of ngrok-free.app
    allowedHosts: ['.ngrok-free.app'] 
  }
});
