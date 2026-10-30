import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // PWA = the installable driver portal (Phase 4)
  plugins: [react(), VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Transport SaaS",
        short_name: "Transport SaaS",
        description: "Trips, expenses and routes for your transport business",
        theme_color: "#14173b",
        background_color: "#f2f3fa",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      // Never cache API calls: stale money numbers are worse than a loading spinner.
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    })],
  server: {
    port: 5173,
    // In dev, /api calls go to the Express server on your laptop.
    proxy: { "/api": "http://localhost:4000" },
  },
});
