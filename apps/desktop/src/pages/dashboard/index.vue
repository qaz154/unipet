<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../stores/settings';

const getEp = () => window.unipet;
const settingsStore = useSettingsStore();

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

onUnmounted(() => {
  sessions.value = new Map();
  events.value = [];
});

function windowClose() { getEp()?.windowClose(); }
function windowMinimize() { getEp()?.windowMinimize(); }
</script>

<template>
  <div class="dashboard" :data-mode="settingsStore.colorMode" @mousedown.self>
    <header class="titlebar" style="-webkit-app-region: drag;">
      <span class="title">Sessions Dashboard</span>
      <div class="win-controls" style="-webkit-app-region: no-drag;">
        <button @click="windowMinimize">&#x2500;</button>
        <button @click="windowClose">&#x2715;</button>
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
          <span class="meta">{{ s.eventCount }} events &middot; {{ formatAge(s.lastUpdate) }}</span>
        </div>
      </section>

      <section class="panel">
        <h3>Recent Events</h3>
        <div v-if="events.length === 0" class="empty">No events yet</div>
        <div v-for="(ev, i) in events.slice(0, 20)" :key="i" class="event-row">
          <span class="time">{{ ev.time }}</span>
          <span class="badge" :class="ev.state || 'unknown'">{{ ev.type }}</span>
          <span class="source">{{ ev.source }}</span>
          <span v-if="ev.state" class="state">&rarr; {{ ev.state }}</span>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.dashboard {
  --bg: #1c1c1f;
  --bg-surface: #222226;
  --bg-hover: #2a2a2e;
  --bg-titlebar: #28282c;
  --border: #3a3a3e;
  --text: #e0e0e0;
  --text-muted: #aaa;
  --text-dim: #777;
  --text-faint: #666;
  --btn-bg: #333;
  --btn-border: #555;
  --ctrl-color: #888;
}

.dashboard[data-mode='light'] {
  --bg: #f5f5f7;
  --bg-surface: #fff;
  --bg-hover: #f0f0f2;
  --bg-titlebar: #e8e8ec;
  --border: #d0d0d4;
  --text: #1c1c1f;
  --text-muted: #555;
  --text-dim: #888;
  --text-faint: #999;
  --btn-bg: #e8e8ec;
  --btn-border: #ccc;
  --ctrl-color: #666;
}

.dashboard {
  width: 100vw; height: 100vh;
  background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.titlebar {
  height: 36px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; background: var(--bg-titlebar); border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.title { font-weight: 600; font-size: 13px; color: var(--text-muted); }
.win-controls { display: flex; gap: 4px; }
.win-controls button {
  background: none; border: none; color: var(--ctrl-color); font-size: 14px; width: 28px; height: 28px;
  border-radius: 4px; cursor: pointer;
}
.win-controls button:hover { background: var(--border); color: var(--text); }
.content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 16px; }
.panel { background: var(--bg-surface); border-radius: 8px; padding: 12px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.panel h3 { margin: 0 0 8px; font-size: 14px; color: var(--text-muted); font-weight: 500; }
.panel-header h3 { margin-bottom: 0; }
.btn-small {
  padding: 4px 10px; font-size: 11px; border-radius: 4px;
  border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--text-muted); cursor: pointer;
}
.btn-small:hover { opacity: 0.85; }
.empty { color: var(--text-faint); padding: 16px; text-align: center; font-style: italic; }
.session-row, .event-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: 4px;
}
.session-row:hover, .event-row:hover { background: var(--bg-hover); }
.badge {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 500; background: #444; color: #ccc;
  min-width: 50px; text-align: center;
}
.badge.working, .badge.editing { background: #2d5a2d; color: #8fdf8f; }
.badge.thinking { background: #4a3d6b; color: #c4b5e0; }
.badge.error { background: #5a2d2d; color: #df8f8f; }
.badge.idle { background: var(--border); color: var(--text-dim); }
.badge.sleeping { background: #2d3a5a; color: #8fb5df; }
.badge.happy, .badge.love { background: #5a4a2d; color: #dfc48f; }
.source { color: var(--text-muted); font-weight: 500; }
.meta { color: var(--text-dim); font-size: 12px; margin-left: auto; }
.time { color: var(--text-faint); font-size: 11px; min-width: 70px; }
.state { color: var(--text-dim); font-size: 12px; }
</style>
