/**
 * Pub/Sub Event Bus
 *
 * Decouples event producers (adapters) from consumers
 * (state manager, emotion engine, bubble manager, renderer).
 */

import type { PetEvent } from './events.js';

export type EventHandler = (event: PetEvent) => void;
export type EventFilter = (event: PetEvent) => boolean;

interface Subscription {
  handler: EventHandler;
  filter: EventFilter | undefined;
  once: boolean;
}

export class EventBus {
  private readonly globalSubscriptions: Subscription[] = [];
  private readonly history: PetEvent[] = [];
  private readonly maxHistory: number;

  constructor(options?: { maxHistory?: number }) {
    this.maxHistory = options?.maxHistory ?? 200;
  }

  /** Subscribe to all events */
  on(handler: EventHandler, filter?: EventFilter): () => void {
    const sub: Subscription = { handler, filter, once: false };
    this.globalSubscriptions.push(sub);
    return () => this.removeSub(this.globalSubscriptions, sub);
  }

  /** Subscribe to a specific event type */
  onType(type: PetEvent['type'], handler: EventHandler): () => void {
    return this.on(handler, (e) => e.type === type);
  }

  /** Subscribe once — auto-unsubscribes after first call */
  once(handler: EventHandler, filter?: EventFilter): () => void {
    const sub: Subscription = { handler, filter, once: true };
    this.globalSubscriptions.push(sub);
    return () => this.removeSub(this.globalSubscriptions, sub);
  }

  /** Publish an event to all matching subscribers */
  emit(event: PetEvent): void {
    this.recordHistory(event);

    for (const sub of [...this.globalSubscriptions]) {
      if (!sub.filter || sub.filter(event)) {
        sub.handler(event);
        if (sub.once) {
          this.removeSub(this.globalSubscriptions, sub);
        }
      }
    }
  }

  /** Get recent event history */
  getHistory(limit?: number): readonly PetEvent[] {
    const n = limit ?? this.maxHistory;
    return this.history.slice(-n);
  }

  /** Get history filtered by source */
  getHistoryBySource(source: string, limit?: number): PetEvent[] {
    const n = limit ?? 50;
    const filtered = this.history.filter((e) => e.source === source);
    return filtered.slice(-n);
  }

  /** Clear all subscriptions */
  clear(): void {
    this.globalSubscriptions.length = 0;
    this.history.length = 0;
  }

  /** Number of active subscriptions */
  get subscriberCount(): number {
    return this.globalSubscriptions.length;
  }

  private recordHistory(event: PetEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory * 2) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
  }

  private removeSub(list: Subscription[], sub: Subscription): void {
    const idx = list.indexOf(sub);
    if (idx !== -1) list.splice(idx, 1);
  }
}
