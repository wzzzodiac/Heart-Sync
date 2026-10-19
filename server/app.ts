import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { Engine, type EngineOptions } from "./engine.js";
import { loadBank } from "./bank.js";
import type { Ack, Command } from "../shared/schema.js";
export function createApp(
  options: EngineOptions & {
    origins?: string[];
    tickMs?: number;
    joinTimeoutMs?: number;
    maxTransports?: number;
  } = {},
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
  const now = engine.now;
  const maxTransports = options.maxTransports ?? 40;
  const transports = new Map<Socket["conn"], number>();
  const opens = new Map<string, { count: number; expires: number }>();
  const attempts = new Map<string, { count: number; expires: number }>();
  function allowAddress(map: typeof opens, address: string, limit: number) {
    let entry = map.get(address);
    if (!entry || now() >= entry.expires) {
      if (!entry && map.size >= 1024) return false;
      entry = { count: 0, expires: now() + 60000 };
      map.set(address, entry);
    }
    return ++entry.count <= limit;
  }
  const io = new Server(http, {
    cors: { origin: origins, methods: ["GET", "POST"] },
    allowRequest: (req, done) =>
      done(
        null,
        typeof req.headers.origin === "string" &&
          origins.includes(req.headers.origin) &&
          io.engine.clientsCount < maxTransports &&
          allowAddress(opens, req.socket.remoteAddress ?? "unknown", 80),
      ),
    maxHttpBufferSize: 32768,
    serveClient: false,
  });
  io.engine.on("connection", (transport) => {
    if (io.engine.clientsCount > maxTransports) {
      transport.close();
      return;
    }
    transports.set(transport, now() + (options.joinTimeoutMs ?? 15000));
    transport.once("close", () => transports.delete(transport));
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
  io.on("connection", (socket) => {
    let windowStart = now(),
      count = 0,
      packetStart = now(),
      packets = 0;
    let rejectionStart = now(),
      rejections = 0;
    function rateLimit(ack: (result: Ack) => void, error: string) {
      if (now() - rejectionStart >= 10000) {
        rejectionStart = now();
        rejections = 0;
      }
      ack({ ok: false, error, code: "RATE_LIMIT" });
      if (++rejections >= 8) socket.disconnect(true);
    }
    socket.use((_packet, next) => {
      if (now() - packetStart >= 1000) {
        packetStart = now();
        packets = 0;
      }
      if (++packets > 100) {
        socket.disconnect(true);
        return;
      }
      next();
    });
    const cache = new Map<string, { fingerprint: string; ack: Ack }>();
    socket.on("command", (input: unknown, ack: unknown) => {
      if (typeof ack !== "function") return;
      const at = now();
      if (at - windowStart >= 1000) {
        windowStart = at;
        count = 0;
      }
      if (++count > 25) {
        rateLimit((result) => ack(result), "Please slow down and try again.");
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
        if (!allowAddress(attempts, socket.handshake.address, 30)) {
          rateLimit(
            (result) => ack(result),
            "Too many room attempts. Try again in a minute.",
          );
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
      engine.disconnect(socket.id);
    });
  });
  const sweep = () => {
    engine.tick();
    const admitted = new Set(
      [...io.sockets.sockets.values()]
        .filter((socket) => engine.connections.has(socket.id))
        .map((socket) => socket.conn),
    );
    for (const [transport, deadline] of transports)
      if (now() >= deadline && !admitted.has(transport)) transport.close();
    for (const map of [attempts, opens])
      for (const [key, entry] of map)
        if (now() >= entry.expires) map.delete(key);
  };
  const timer = setInterval(sweep, options.tickMs ?? 100);
  timer.unref();
  return {
    http,
    io,
    engine,
    sweep,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
