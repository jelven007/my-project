import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // The Ant Design vendor chunk is inherently large but isolated and
    // long-cached; treat that as expected rather than a warning.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Split the heavy Ant Design UI kit from app code so the vendor bundle
        // caches independently and no single chunk trips the size warning.
        manualChunks: {
          antd: ["antd", "@ant-design/icons"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
