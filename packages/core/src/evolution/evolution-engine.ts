/**
 * Evolution Engine — maps coding patterns to pet evolution traits.
 *
 * Traits are visual modifiers that can be applied to any theme as variants.
 * Each trait has a trigger condition (based on CodingPatterns thresholds)
 * and a visual description.
 *
 * Design philosophy:
 * - Positive behavior → positive visual reward (armor, glow, wings)
 * - Negative pattern → visual consequence (dark circles, slowdown)
 * - Traits accumulate; higher tiers replace lower ones in the same category
 * - Every trait has a `themeVariant` name that maps to a variant in theme.json
 */

import type { CodingPatterns } from './git-analyzer.js';

export type TraitCategory = 'defense' | 'vision' | 'stamina' | 'speed' | 'wisdom' | 'nightVision';

export interface EvolutionTrait {
  id: string;
  category: TraitCategory;
  tier: number;           // 1-3, higher = more advanced
  name: string;
  description: string;
  themeVariant: string;   // Maps to a variant name in theme.json
  icon: string;           // Emoji for UI display
  condition: (patterns: CodingPatterns) => boolean;
}

export const EVOLUTION_TRAITS: EvolutionTrait[] = [
  // ─── Defense (from writing tests) ───────────────────────
  {
    id: 'armor',
    category: 'defense',
    tier: 1,
    name: 'Test Armor',
    description: 'Your pet grows protective scales from all those tests you wrote.',
    themeVariant: 'armor',
    icon: '🛡️',
    condition: (p) => p.testRatio >= 0.4 && p.totalCommits >= 5,
  },
  {
    id: 'plate-armor',
    category: 'defense',
    tier: 2,
    name: 'Plate Armor',
    description: 'Heavy plating from an 80%+ test ratio. Almost invincible.',
    themeVariant: 'plate-armor',
    icon: '🏰',
    condition: (p) => p.testRatio >= 0.8 && p.totalCommits >= 10,
  },

  // ─── Vision (from refactoring) ─────────────────────────
  {
    id: 'keen-eyes',
    category: 'vision',
    tier: 1,
    name: 'Keen Eyes',
    description: 'Your pet sees code smells before you do.',
    themeVariant: 'keen-eyes',
    icon: '👁️',
    condition: (p) => p.refactorRatio >= 0.15 && p.totalCommits >= 5,
  },
  {
    id: 'eagle-vision',
    category: 'vision',
    tier: 2,
    name: 'Eagle Vision',
    description: 'Refactoring master. The pet can spot a misplaced semicolon from 100 lines away.',
    themeVariant: 'eagle-vision',
    icon: '🦅',
    condition: (p) => p.refactorRatio >= 0.3 && p.totalCommits >= 15,
  },

  // ─── Stamina (from consistent activity) ────────────────
  {
    id: 'sturdy',
    category: 'stamina',
    tier: 1,
    name: 'Sturdy Build',
    description: 'Consistent coding makes your pet more resilient.',
    themeVariant: 'sturdy',
    icon: '💪',
    condition: (p) => p.activeStreak >= 7,
  },
  {
    id: 'titan',
    category: 'stamina',
    tier: 2,
    name: 'Titan Form',
    description: 'A 30-day streak. Your pet is built different.',
    themeVariant: 'titan',
    icon: '🗿',
    condition: (p) => p.activeStreak >= 30,
  },

  // ─── Speed (from high commit frequency) ─────────────────
  {
    id: 'swift',
    category: 'speed',
    tier: 1,
    name: 'Swift Paws',
    description: 'Fast commits, fast pet.',
    themeVariant: 'swift',
    icon: '⚡',
    condition: (p) => p.commitsPerDay >= 3 && p.totalCommits >= 10,
  },
  {
    id: 'lightning',
    category: 'speed',
    tier: 2,
    name: 'Lightning Form',
    description: 'Over 5 commits per day. Your pet is a blur.',
    themeVariant: 'lightning',
    icon: '🌩️',
    condition: (p) => p.commitsPerDay >= 5 && p.totalCommits >= 20,
  },

  // ─── Night Vision (from late-night coding) ──────────────
  {
    id: 'dark-circles',
    category: 'nightVision',
    tier: 1,
    name: 'Dark Circles',
    description: 'Your pet stayed up coding with you. It has dark circles now.',
    themeVariant: 'dark-circles',
    icon: '🦉',
    condition: (p) => p.nightOwlRatio >= 0.2 && p.totalCommits >= 5,
  },
  {
    id: 'shadow-mode',
    category: 'nightVision',
    tier: 2,
    name: 'Shadow Mode',
    description: 'Over 40% of commits at night. Your pet sees in the dark.',
    themeVariant: 'shadow-mode',
    icon: '🌑',
    condition: (p) => p.nightOwlRatio >= 0.4 && p.totalCommits >= 10,
  },

  // ─── Wisdom (from balanced behavior) ────────────────────
  {
    id: 'wise',
    category: 'wisdom',
    tier: 1,
    name: 'Wise Gaze',
    description: 'Tests, refactors, and consistent work. A balanced developer.',
    themeVariant: 'wise',
    icon: '🧠',
    condition: (p) => p.testRatio >= 0.3 && p.refactorRatio >= 0.1 && p.activeStreak >= 14,
  },
];

export interface EvolutionState {
  /** Currently active traits (highest tier per category) */
  activeTraits: EvolutionTrait[];
  /** Trait IDs that have been unlocked at any point */
  unlockedTraitIds: string[];
  /** Timestamp of last analysis */
  lastAnalyzedAt: number;
  /** Raw patterns from last analysis */
  lastPatterns: CodingPatterns | null;
}

export function createInitialEvolutionState(): EvolutionState {
  return {
    activeTraits: [],
    unlockedTraitIds: [],
    lastAnalyzedAt: 0,
    lastPatterns: null,
  };
}

export function evaluateEvolution(
  patterns: CodingPatterns,
  previousState: EvolutionState,
): EvolutionState {
  const activeTraits: EvolutionTrait[] = [];
  const unlockedSet = new Set(previousState.unlockedTraitIds);

  // For each category, keep only the highest-tier trait that qualifies
  const byCategory = new Map<TraitCategory, EvolutionTrait[]>();
  for (const trait of EVOLUTION_TRAITS) {
    const existing = byCategory.get(trait.category) ?? [];
    existing.push(trait);
    byCategory.set(trait.category, existing);
  }

  for (const [, traits] of byCategory) {
    const qualifying = traits
      .filter((t) => t.condition(patterns))
      .sort((a, b) => b.tier - a.tier);

    if (qualifying.length > 0) {
      const best = qualifying[0]!;
      activeTraits.push(best);
      unlockedSet.add(best.id);
    }
  }

  return {
    activeTraits,
    unlockedTraitIds: [...unlockedSet],
    lastAnalyzedAt: Date.now(),
    lastPatterns: patterns,
  };
}

/** Get the list of theme variant names to apply */
export function getActiveVariantNames(state: EvolutionState): string[] {
  return state.activeTraits.map((t) => t.themeVariant);
}

/** Get a human-readable summary of the pet's evolution */
export function getEvolutionSummary(state: EvolutionState): string {
  if (state.activeTraits.length === 0) {
    return 'Your pet is in its base form. Keep coding to unlock evolutions!';
  }

  const traitDescs = state.activeTraits.map((t) => `${t.icon} ${t.name}`);
  return `Evolved: ${traitDescs.join(', ')}`;
}
