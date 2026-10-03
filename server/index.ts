import { createApp } from "./app.js";
const production = process.env.NODE_ENV === "production";
if (production && !process.env.ALLOWED_ORIGINS)
  throw new Error("Set ALLOWED_ORIGINS to the frontend origin.");
const app = createApp({
  origins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()),
});
const port = Number(process.env.PORT || 3001);
app.http.listen(port, "0.0.0.0", () =>
  console.log(`Heart Sync server listening on port ${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
