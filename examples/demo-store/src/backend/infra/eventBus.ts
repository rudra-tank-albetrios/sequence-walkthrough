// Event Bus: in-process publish/subscribe. Published events are kept so tests can see them.

export interface OrderPlacedEvent {
  type: 'order.placed';
  orderId: string;
  orderNumber: string;
  email: string;
  total: number;
  currency: string;
}

export type DomainEvent = OrderPlacedEvent;
export type EventHandler = (event: DomainEvent) => void;

export class EventBus {
  private readonly handlers = new Map<DomainEvent['type'], EventHandler[]>();
  readonly published: DomainEvent[] = [];

  /** Registers a handler for one event type and returns a function that removes it. */
  subscribe(type: DomainEvent['type'], handler: EventHandler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== handler));
    };
  }

  publish(event: DomainEvent): void {
    this.published.push(event);
    for (const handler of this.handlers.get(event.type) ?? []) handler(event);
  }
}
