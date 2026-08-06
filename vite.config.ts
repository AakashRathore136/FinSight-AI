/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
    build: {
      // Source maps are dev-only; shipping them in production exposes the
      // client bundle source (and the Vite index.html in dist/). Server-side
      // source maps are also disabled in the `build` script (esbuild emits no
      // --sourcemap), so no *.map files ever reach the static file server.
      sourcemap: mode === "production" ? false : true,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    optimizeDeps: {
      exclude: ['vite-plugin-pwa'],
    },
  };
});
