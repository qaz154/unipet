import type { ThemeDefinition, ThemeVariant, ThemeTimings, StateDefinition } from './schema.js';

export function mergeVariant(base: ThemeDefinition, variant: ThemeVariant): ThemeDefinition {
  const merged = { ...base };

  if (variant.states) {
    merged.states = { ...base.states };
    for (const [key, override] of Object.entries(variant.states)) {
      const existing: StateDefinition | undefined = merged.states[key];
      if (existing) {
        merged.states[key] = { ...existing, ...override };
      } else {
        merged.states[key] = { ...DEFAULT_STATE, ...override };
      }
    }
  }

  if (variant.timings) {
    merged.timings = { ...base.timings, ...variant.timings };
  }

  if (variant.hitBoxes) {
    merged.hitBoxes = { ...(base.hitBoxes ?? {}), ...variant.hitBoxes };
  }

  if (variant.idleAnimations) {
    merged.idleAnimations = variant.idleAnimations;
  }

  return merged;
}

export function listVariants(theme: ThemeDefinition): string[] {
  return Object.keys(theme.variants ?? {});
}

export function getVariant(theme: ThemeDefinition, name: string): ThemeVariant | undefined {
  return theme.variants?.[name];
}

const DEFAULT_STATE: StateDefinition = {
  files: [],
};
