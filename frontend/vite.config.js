import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: "web",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@react-three") || id.includes("three")) return "three-vendor";
          if (
            id.includes("react-router") ||
            id.includes("react-dom") ||
            id.includes("scheduler") ||
            id.endsWith("\\react.js") ||
            id.endsWith("/react.js") ||
            id.includes("\\react\\") ||
            id.includes("/react/")
          ) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5178,
    host: "0.0.0.0",
  },
});
