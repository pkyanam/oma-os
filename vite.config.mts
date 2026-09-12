import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";
import { disableUnrequestedRemoteAI } from "./scripts/local-cloudflare-config.mjs";
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    cloudflare(
      command === "serve"
        ? {
            remoteBindings: process.env.OMA_REMOTE_AI === "1",
            config(config) {
              disableUnrequestedRemoteAI(config, process.env.OMA_REMOTE_AI);
            },
          }
        : {},
    ),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "es6-promise-pool": fileURLToPath(
        new URL(
          "./node_modules/.cache/oma/es6-promise-pool.cjs",
          import.meta.url,
        ),
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3018,
    strictPort: true,
    watch: {
      ignored: [
        "**/.next/**",
        "**/dist/**",
        "**/.wrangler/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    },
  },
  build: { target: "es2022", sourcemap: false },
}));
