import { createServer } from "node:http";
import { Server } from "socket.io";
import { Engine, type EngineOptions } from "./engine.js";
import { loadBank } from "./bank.js";
import type { Ack, Command } from "../shared/schema.js";
export function createApp(
  options: EngineOptions & { origins?: string[]; tickMs?: number } = {},
) {
  const engine = new Engine(loadBank(), options);
  const origins = options.origins ?? [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  const http = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end('{"ok":true}');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  const io = new Server(http, {
    cors: { origin: origins, methods: ["GET", "POST"] },
    allowRequest: (req, done) =>
      done(
        null,
        typeof req.headers.origin === "string" &&
          origins.includes(req.headers.origin),
      ),
    maxHttpBufferSize: 32768,
    serveClient: false,
  });
  engine.onChange = (id, snapshot) =>
    io.sockets.sockets.get(id)?.emit("snapshot", snapshot);
  engine.onClose = (id, reason) => {
    const s = io.sockets.sockets.get(id);
    if (s) {
      s.emit("session-ended", reason);
      s.disconnect(true);
    }
  };
  // Per-address admission limits complement per-socket event limits. Do not trust arbitrary forwarded IP headers.
  const attempts = new Map<string, { count: number; expires: number }>();
  io.on("connection", (socket) => {
    let windowStart = Date.now(),
      count = 0;
    const cache = new Map<string, { fingerprint: string; ack: Ack }>();
    const idle = setTimeout(() => {
      if (!engine.connections.has(socket.id)) socket.disconnect(true);
    }, 15000);
    idle.unref();
    socket.on("command", (input: unknown, ack: unknown) => {
      if (typeof ack !== "function") return;
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 25) {
        ack({
          ok: false,
          error: "Please slow down and try again.",
          code: "RATE_LIMIT",
        });
        return;
      }
      if (typeof input !== "object" || input === null) {
        ack({ ok: false, error: "Malformed command.", code: "INVALID_ACTION" });
        return;
      }
      const cmd = input as Command;
      const fingerprint = JSON.stringify(input);
      const cached =
        typeof cmd.requestId === "string"
          ? cache.get(cmd.requestId)
          : undefined;
      if (cached) {
        ack(
          cached.fingerprint === fingerprint
            ? cached.ack
            : {
                ok: false,
                error: "Request ID already used.",
                code: "INVALID_ACTION",
              },
        );
        return;
      }
      if (["create", "join", "resume"].includes(cmd.type)) {
        const address = socket.handshake.address;
        const rate = attempts.get(address) ?? {
          count: 0,
          expires: now + 60000,
        };
        if (now >= rate.expires) {
          rate.count = 0;
          rate.expires = now + 60000;
        }
        rate.count++;
        attempts.set(address, rate);
        if (rate.count > 30) {
          ack({
            ok: false,
            error: "Too many room attempts. Try again in a minute.",
            code: "RATE_LIMIT",
          });
          return;
        }
      }
      const result = engine.execute(socket.id, input);
      // Cache successful commands before acknowledging, including admission. Retry uses the exact request ID.
      if (result.ok && typeof cmd.requestId === "string") {
        cache.set(cmd.requestId, { fingerprint, ack: result });
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
      }
      ack(result);
      if (result.ok && cmd.type === "leave") {
        cache.clear();
        setTimeout(() => socket.disconnect(true), 50);
      }
    });
    socket.on("disconnect", () => {
      clearTimeout(idle);
      engine.disconnect(socket.id);
    });
  });
  const timer = setInterval(() => {
    engine.tick();
    for (const [key, entry] of attempts)
      if (Date.now() > entry.expires) attempts.delete(key);
  }, options.tickMs ?? 100);
  timer.unref();
  return {
    http,
    io,
    engine,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
