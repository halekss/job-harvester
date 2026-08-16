import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/offers": "http://localhost:3000",
      "/harvest": "http://localhost:3000",
      "/connectors": "http://localhost:3000",
      "/campaigns": "http://localhost:3000",
    },
  },
});
