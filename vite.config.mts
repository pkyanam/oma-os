import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";
import { disableUnrequestedRemoteAI } from "./scripts/local-cloudflare-config.mjs";
import { offlineDesktopPlugin } from "./scripts/offline-build.mjs";
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    offlineDesktopPlugin(),
    cloudflare(
      command === "serve"
        ? {
            remoteBindings:
              process.env.OMA_REMOTE_AI === "1" ||
              process.env.OMA_REMOTE_BROWSER === "1",
            config(config) {
              disableUnrequestedRemoteAI(
                config,
                process.env.OMA_REMOTE_AI,
                process.env.OMA_REMOTE_BROWSER,
              );
            },
          }
        : {},
    ),
  ],
  optimizeDeps: { include: ["just-bash", "just-bash/browser"] },
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
