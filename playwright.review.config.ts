import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Isolated review servers never attach to a running personal game session.
export default defineConfig({
  ...base,
  timeout: 180000,
  use: { ...base.use, baseURL: "http://127.0.0.1:5175" },
  webServer: [
    {
      command: "npm run dev:server",
      url: "http://127.0.0.1:3003/health",
      reuseExistingServer: false,
      env: { PORT: "3003", ALLOWED_ORIGINS: "http://127.0.0.1:5175" },
    },
    {
      command: "npm run dev:client -- --port 5175",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      env: { VITE_SERVER_URL: "http://127.0.0.1:3003", VITE_BASE_PATH: "/" },
    },
  ],
});
