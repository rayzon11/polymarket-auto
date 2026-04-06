import { BotEvent } from '@/lib/agents/types';

// SSE Event System — Pub/Sub for real-time bot events

type Listener = (event: BotEvent) => void;

export class BotEventEmitter {
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: BotEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[Events] Listener error:', err);
      }
    }
  }

  emitTick(data: any): void {
    this.emit({ type: 'tick', timestamp: new Date().toISOString(), data });
  }

  emitSignal(data: any): void {
    this.emit({ type: 'signal', timestamp: new Date().toISOString(), data });
  }

  emitConsensus(data: any): void {
    this.emit({ type: 'consensus', timestamp: new Date().toISOString(), data });
  }

  emitTrade(data: any): void {
    this.emit({ type: 'trade', timestamp: new Date().toISOString(), data });
  }

  emitPositionUpdate(data: any): void {
    this.emit({ type: 'position_update', timestamp: new Date().toISOString(), data });
  }

  emitError(data: any): void {
    this.emit({ type: 'error', timestamp: new Date().toISOString(), data });
  }

  emitStatus(data: any): void {
    this.emit({ type: 'bot_status', timestamp: new Date().toISOString(), data });
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

// Singleton
const GLOBAL_KEY = '__bot_events__';

export function getBotEventEmitter(): BotEventEmitter {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new BotEventEmitter();
  }
  return (globalThis as any)[GLOBAL_KEY];
}
