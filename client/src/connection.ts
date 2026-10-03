import { io, type Socket } from "socket.io-client";
import type { Ack, Command, Snapshot } from "../../shared/schema";
type Session = { code: string; playerId: string; token: string };
const storageKey = "heart-sync-session";
export function readSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}
export function clearSession() {
  sessionStorage.removeItem(storageKey);
}
export class Connection {
  socket: Socket | null = null;
  private restoring: Promise<void> | null = null;
  constructor(
    readonly snapshot: (s: Snapshot) => void,
    readonly status: (s: string) => void,
    readonly error: (s: string) => void,
    readonly ended: () => void,
  ) {}
  open() {
    if (this.socket) return this.socket;
    const url =
      import.meta.env.VITE_SERVER_URL ||
      (import.meta.env.DEV ? "http://127.0.0.1:3001" : "");
    if (!url)
      throw new Error(
        "The game server is not configured yet. Set VITE_SERVER_URL and rebuild.",
      );
    const socket = io(url, {
      autoConnect: false,
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;
    socket.on("snapshot", this.snapshot);
    socket.on("connect", () => {
      const session = readSession();
      if (session) {
        this.status("reconnecting");
        this.restoring = this.send({
          type: "resume",
          payload: { code: session.code, token: session.token },
        })
          .then(() => this.status("connected"))
          .catch((e) => {
            this.error(e.message);
            throw e;
          });
        void this.restoring.catch(() => {});
      } else this.status("connected");
    });
    socket.on("disconnect", () => this.status("reconnecting"));
    socket.on("connect_error", () => this.status("reconnecting"));
    socket.on("session-ended", (reason: string) => {
      clearSession();
      this.close();
      this.ended();
      this.error(reason);
    });
    socket.connect();
    return socket;
  }
  async send(input: Omit<Command, "requestId">) {
    const socket = this.open();
    const cmd: Command = { ...input, requestId: crypto.randomUUID() };
    const waitForConnection = async () => {
      if (socket.connected) return;
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          socket.off("connect", onConnect);
          reject(
            new Error(
              "Cannot reach the game server. Check your connection and retry.",
            ),
          );
        }, 8000);
        socket.once("connect", onConnect);
      });
    };
    let result: Ack | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await waitForConnection();
        if (cmd.type !== "resume" && this.restoring) await this.restoring;
        // Never buffer gameplay ahead of seat restoration during a reconnect.
        result = await socket.volatile
          .timeout(4000)
          .emitWithAck("command", cmd);
        break;
      } catch {
        if (attempt === 2)
          throw new Error(
            "No confirmation yet. Reconnect to check whether your answer was saved.",
          );
      }
    }
    if (!result?.ok) {
      if (result && ["ROOM_GONE", "SESSION_GONE"].includes(result.code)) {
        clearSession();
        this.close();
        this.ended();
      } else if (!readSession() && ["create", "join"].includes(input.type)) {
        this.close();
      }
      throw new Error(result && !result.ok ? result.error : "Request failed.");
    }
    if (result.session)
      sessionStorage.setItem(storageKey, JSON.stringify(result.session));
    return result;
  }
  close() {
    const socket = this.socket;
    this.socket = null;
    this.restoring = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    this.status("offline");
  }
}
