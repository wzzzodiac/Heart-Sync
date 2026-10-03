import { defineConfig } from "vite";
export default defineConfig({
  root: "client",
  envDir: "..",
  base: process.env.VITE_BASE_PATH || "/",
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
