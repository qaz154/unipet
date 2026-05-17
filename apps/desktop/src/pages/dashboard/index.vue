<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../../composables/useI18n';

const { t } = useI18n();
const getEp = () => window.unipet;

interface SessionEntry {
  source: string;
  state: string;
  lastUpdate: number;
  eventCount: number;
}

const sessions = ref<Map<string, SessionEntry>>(new Map());
const events = ref<Array<{ time: string; source: string; type: string; state?: string }>>([]);

function formatAge(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function handleEvent(ev: unknown) {
  const e = ev as { type?: string; state?: string; source?: string; timestamp?: number };
  const source = e.source || 'unknown';
  const state = e.state || 'idle';
  const now = Date.now();

  const existing = sessions.value.get(source);
  sessions.value.set(source, {
    source,
    state,
    lastUpdate: now,
    eventCount: (existing?.eventCount || 0) + 1,
  });
  sessions.value = new Map(sessions.value);

  events.value.unshift({
    time: new Date(now).toLocaleTimeString(),
    source,
    type: e.type || 'unknown',
    state: e.state,
  });
  if (events.value.length > 50) events.value.length = 50;
}

function clearIdle() {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of sessions.value) {
    if (entry.lastUpdate < cutoff) sessions.value.delete(key);
  }
  sessions.value = new Map(sessions.value);
}

onMounted(() => {
  getEp()?.on?.('pet:event', handleEvent);
});

onUnmounted(() => {});

function windowClose() { getEp()?.windowClose(); }
function windowMinimize() { getEp()?.windowMinimize(); }
</script>

<template>
  <div class="dashboard" @mousedown.self>
    <header class="titlebar" style="-webkit-app-region: drag;">
      <span class="title">Sessions Dashboard</span>
      <div class="win-controls" style="-webkit-app-region: no-drag;">
        <button @click="windowMinimize">─</button>
        <button @click="windowClose">✕</button>
      </div>
    </header>

    <main class="content">
      <section class="panel">
        <div class="panel-header">
          <h3>Active Sessions ({{ sessions.size }})</h3>
          <button class="btn-small" @click="clearIdle">Clear Idle</button>
        </div>
        <div v-if="sessions.size === 0" class="empty">No active sessions</div>
        <div v-for="[key, s] in sessions" :key="key" class="session-row">
          <span class="badge" :class="s.state">{{ s.state }}</span>
          <span class="source">{{ s.source }}</span>
          <span class="meta">{{ s.eventCount }} events · {{ formatAge(s.lastUpdate) }}</span>
        </div>
      </section>

      <section class="panel">
        <h3>Recent Events</h3>
        <div v-if="events.length === 0" class="empty">No events yet</div>
        <div v-for="(ev, i) in events.slice(0, 20)" :key="i" class="event-row">
          <span class="time">{{ ev.time }}</span>
          <span class="badge" :class="ev.state || 'unknown'">{{ ev.type }}</span>
          <span class="source">{{ ev.source }}</span>
          <span v-if="ev.state" class="state">→ {{ ev.state }}</span>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.dashboard {
  width: 100vw; height: 100vh;
  background: #1c1c1f; color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.titlebar {
  height: 36px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; background: #28282c; border-bottom: 1px solid #3a3a3e;
  flex-shrink: 0;
}
.title { font-weight: 600; font-size: 13px; color: #ccc; }
.win-controls { display: flex; gap: 4px; }
.win-controls button {
  background: none; border: none; color: #888; font-size: 14px; width: 28px; height: 28px;
  border-radius: 4px; cursor: pointer;
}
.win-controls button:hover { background: #3a3a3e; color: #fff; }
.content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 16px; }
.panel { background: #222226; border-radius: 8px; padding: 12px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.panel h3 { margin: 0 0 8px; font-size: 14px; color: #aaa; font-weight: 500; }
.panel-header h3 { margin-bottom: 0; }
.btn-small {
  padding: 4px 10px; font-size: 11px; border-radius: 4px;
  border: 1px solid #555; background: #333; color: #ccc; cursor: pointer;
}
.btn-small:hover { background: #444; }
.empty { color: #666; padding: 16px; text-align: center; font-style: italic; }
.session-row, .event-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: 4px;
}
.session-row:hover, .event-row:hover { background: #2a2a2e; }
.badge {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 500; background: #444; color: #ccc;
  min-width: 50px; text-align: center;
}
.badge.working, .badge.editing { background: #2d5a2d; color: #8fdf8f; }
.badge.thinking { background: #4a3d6b; color: #c4b5e0; }
.badge.error { background: #5a2d2d; color: #df8f8f; }
.badge.idle { background: #3a3a3e; color: #999; }
.badge.sleeping { background: #2d3a5a; color: #8fb5df; }
.badge.happy, .badge.love { background: #5a4a2d; color: #dfc48f; }
.source { color: #bbb; font-weight: 500; }
.meta { color: #777; font-size: 12px; margin-left: auto; }
.time { color: #666; font-size: 11px; min-width: 70px; }
.state { color: #888; font-size: 12px; }
</style>
