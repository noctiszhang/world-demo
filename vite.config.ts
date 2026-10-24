import { defineConfig } from "vite";

// GitHub Pages project site needs a base path; local/dev and root hosts use "/".
const base = process.env.GITHUB_PAGES === "true" ? "/world-demo/" : "/";

export default defineConfig({
  base,
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    // Cloudflare quick tunnels / Cursor port-forward hostnames
    allowedHosts: true,
  },
});
