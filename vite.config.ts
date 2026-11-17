import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function sqliteDevBridge(): Plugin {
  return {
    name: "joyce-sqlite-dev-bridge",
    async configureServer(server) {
      // @ts-ignore -- dev-only Node bridge using built-in node:sqlite
      const { createSqliteMiddleware } = await import("./vite-sqlite-bridge.mjs");
      server.middlewares.use("/api/invoke", createSqliteMiddleware());
    },
  };
}

// Tauri expects a fixed port and must not clear the terminal.
export default defineConfig({
  plugins: [react(), sqliteDevBridge()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/joyce_restobar_ledger.db*"] },
  },
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
