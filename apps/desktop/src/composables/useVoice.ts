/**
 * useVoice — Composable that wires VoiceCompanion and EmotionSoundtrack
 * into the pet's lifecycle. Handles voice commands and ambient music.
 *
 * VoiceCommand flow:
 *   VoiceCompanion.onCommand(cmd) → parse command → update session + speak response
 *
 * EmotionSoundtrack flow:
 *   engine.shared.currentEmotion → soundtrack.setEmotion()
 */

import { watch, type WatchStopHandle } from 'vue';
import { VoiceCompanion, type VoiceCommand } from '../lib/voice-companion.js';
import { EmotionSoundtrack } from '../lib/emotion-soundtrack.js';
import type { EmotionVector } from '@unipet/core';

interface UseVoiceOpts {
  voiceEnabled: { value: boolean };
  voiceLanguage: { value: string };
  emotionMusic: { value: boolean };
  updateSession: (sessionId: string, state: string, source: string) => void;
  showBubble: (text: string) => void;
  getEmotion: () => EmotionVector;
}

interface UseVoiceReturn {
  destroy: () => void;
}

export function useVoice(opts: UseVoiceOpts): UseVoiceReturn {
  const { updateSession, showBubble, getEmotion: _getEmotion } = opts;
  const companion = new VoiceCompanion();
  const soundtrack = new EmotionSoundtrack();

  // ─── Voice Command Handler ───────────────────────────
  function handleCommand(cmd: VoiceCommand): void {
    switch (cmd.type) {
      case 'status':
        companion.speak('All systems nominal. Your pet is happy and healthy.');
        showBubble('Status: All good!');
        break;

      case 'git-summary':
        companion.speak('Let me check the recent commits.');
        showBubble('Checking git log...');
        // git summary is best-effort; pet shows thinking state while agent reports back
        break;

      case 'set-state':
        updateSession('voice', cmd.state, 'voice');
        companion.speak(`Switching to ${cmd.state}.`);
        showBubble(`State: ${cmd.state}`);
        break;

      case 'sleep':
        updateSession('voice', 'sleeping', 'voice');
        companion.speak('Going to sleep. Goodnight!');
        showBubble('Zzz...');
        break;

      case 'wake':
        updateSession('voice', 'idle', 'voice');
        companion.speak("I'm awake! What can I do for you?");
        showBubble("I'm awake!");
        break;

      case 'unknown':
        companion.speak("I'm not sure what you mean, but I'm listening!");
        showBubble(cmd.transcript);
        break;
    }
  }

  companion.onCommand(handleCommand);

  // ─── Watch voice settings ────────────────────────────
  const stopVoiceWatch: WatchStopHandle = watch(
    [() => opts.voiceEnabled.value, () => opts.voiceLanguage.value],
    ([enabled, lang]) => {
      if (enabled) {
        companion.updateConfig({ enabled: true, language: lang });
        companion.start();
      } else {
        companion.updateConfig({ enabled: false });
        companion.stop();
      }
    },
    { immediate: true },
  );

  // ─── Watch emotion music setting ─────────────────────
  const stopMusicWatch: WatchStopHandle = watch(
    () => opts.emotionMusic.value,
    (enabled) => {
      soundtrack.setEnabled(enabled);
      if (enabled) {
        soundtrack.setEmotion(opts.getEmotion());
      }
    },
    { immediate: true },
  );

  // ─── Watch emotion vector → soundtrack ───────────────
  // Poll emotion every 2 seconds when soundtrack is running
  const emotionInterval = setInterval(() => {
    if (opts.emotionMusic.value) {
      soundtrack.setEmotion(opts.getEmotion());
    }
  }, 2_000);

  // ─── Cleanup ─────────────────────────────────────────
  function destroy(): void {
    stopVoiceWatch();
    stopMusicWatch();
    clearInterval(emotionInterval);
    companion.destroy();
    soundtrack.destroy();
  }

  return { destroy };
}
