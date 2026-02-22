import type { RealtimeEvent, RealtimeEventType } from "./types";

type EventHandler<TPayload> = (payload: TPayload) => void | Promise<void>;

export class EventBroker {
  private readonly clients = new Set<WebSocket>();
  private readonly handlers = new Map<RealtimeEventType, Set<EventHandler<unknown>>>();

  subscribe(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    server.addEventListener("close", () => {
      this.clients.delete(server);
    });
    server.addEventListener("error", () => {
      this.clients.delete(server);
    });

    this.clients.add(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  on<TPayload>(eventType: RealtimeEventType, handler: EventHandler<TPayload>): void {
    const existing = this.handlers.get(eventType) ?? new Set<EventHandler<unknown>>();
    existing.add(handler as EventHandler<unknown>);
    this.handlers.set(eventType, existing);
  }

  async publish<TPayload>(eventType: RealtimeEventType, payload: TPayload): Promise<void> {
    const event: RealtimeEvent<TPayload> = {
      type: eventType,
      payload,
      timestamp: new Date().toISOString()
    };
    const serialized = JSON.stringify(event);

    for (const socket of this.clients) {
      try {
        socket.send(serialized);
      } catch {
        this.clients.delete(socket);
      }
    }

    const handlers = this.handlers.get(eventType);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      await handler(payload);
    }
  }
}
