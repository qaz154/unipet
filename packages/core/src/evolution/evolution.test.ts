import { describe, expect, it } from 'vitest';
import { parseGitLog } from './git-analyzer.js';
import {
  evaluateEvolution,
  getActiveVariantNames,
  getEvolutionSummary,
  createInitialEvolutionState,
  EVOLUTION_TRAITS,
} from './evolution-engine.js';

describe('parseGitLog', () => {
  it('returns zero state for empty log', () => {
    const result = parseGitLog([], 30);
    expect(result.totalCommits).toBe(0);
    expect(result.commitsPerDay).toBe(0);
    expect(result.activeStreak).toBe(0);
  });

  it('parses commits and counts test file touches', () => {
    const lines = [
      '2026-05-20T10:00:00+08:00|feat: add feature',
      'src/foo.ts',
      'src/foo.test.ts',
      '',
      '2026-05-21T10:00:00+08:00|fix: bug fix',
      'src/bar.ts',
    ];
    const result = parseGitLog(lines, 30);
    expect(result.totalCommits).toBe(2);
    expect(result.testRatio).toBe(0.5);
  });

  it('detects refactor commits', () => {
    const lines = [
      '2026-05-20T10:00:00+08:00|refactor: extract module',
      'src/a.ts',
      '',
      '2026-05-20T11:00:00+08:00|feat: add feature',
      'src/b.ts',
    ];
    const result = parseGitLog(lines, 30);
    expect(result.refactorRatio).toBe(0.5);
  });

  it('detects night owl commits (midnight to 6am)', () => {
    // Use UTC timestamps directly to avoid timezone-dependent test failures on CI
    const lines = [
      '2026-05-20T02:00:00Z|feat: late night coding',
      'src/a.ts',
      '',
      '2026-05-20T14:00:00Z|feat: daytime coding',
      'src/b.ts',
    ];
    const result = parseGitLog(lines, 30);
    expect(result.nightOwlRatio).toBe(0.5);
  });
});

describe('evaluateEvolution', () => {
  it('returns base state with no traits for low activity', () => {
    const patterns = {
      commitsPerDay: 0.5,
      testRatio: 0.1,
      refactorRatio: 0.05,
      nightOwlRatio: 0,
      activeStreak: 2,
      totalCommits: 3,
      medianCommitHour: 14,
    };
    const state = evaluateEvolution(patterns, createInitialEvolutionState());
    expect(state.activeTraits).toHaveLength(0);
    expect(state.unlockedTraitIds).toHaveLength(0);
  });

  it('unlocks armor trait for high test ratio', () => {
    const patterns = {
      commitsPerDay: 1,
      testRatio: 0.5,
      refactorRatio: 0.05,
      nightOwlRatio: 0,
      activeStreak: 5,
      totalCommits: 10,
      medianCommitHour: 14,
    };
    const state = evaluateEvolution(patterns, createInitialEvolutionState());
    const armorTrait = state.activeTraits.find((t) => t.category === 'defense');
    expect(armorTrait).toBeDefined();
    expect(armorTrait!.id).toBe('armor');
  });

  it('upgrades to plate-armor for 80%+ test ratio', () => {
    const patterns = {
      commitsPerDay: 1,
      testRatio: 0.85,
      refactorRatio: 0.05,
      nightOwlRatio: 0,
      activeStreak: 10,
      totalCommits: 15,
      medianCommitHour: 14,
    };
    const state = evaluateEvolution(patterns, createInitialEvolutionState());
    const armorTrait = state.activeTraits.find((t) => t.category === 'defense');
    expect(armorTrait!.id).toBe('plate-armor');
  });

  it('unlocks multiple independent traits', () => {
    const patterns = {
      commitsPerDay: 4,
      testRatio: 0.5,
      refactorRatio: 0.2,
      nightOwlRatio: 0.3,
      activeStreak: 14,
      totalCommits: 30,
      medianCommitHour: 2,
    };
    const state = evaluateEvolution(patterns, createInitialEvolutionState());
    const categories = state.activeTraits.map((t) => t.category);
    expect(categories).toContain('defense');
    expect(categories).toContain('vision');
    expect(categories).toContain('stamina');
    expect(categories).toContain('speed');
    expect(categories).toContain('nightVision');
  });

  it('preserves unlocked trait history', () => {
    const patterns = {
      commitsPerDay: 1,
      testRatio: 0.5,
      refactorRatio: 0.05,
      nightOwlRatio: 0,
      activeStreak: 5,
      totalCommits: 10,
      medianCommitHour: 14,
    };
    const first = evaluateEvolution(patterns, createInitialEvolutionState());

    // Drop below threshold
    const lowPatterns = {
      commitsPerDay: 0.1,
      testRatio: 0.1,
      refactorRatio: 0.01,
      nightOwlRatio: 0,
      activeStreak: 1,
      totalCommits: 2,
      medianCommitHour: 14,
    };
    const second = evaluateEvolution(lowPatterns, first);

    // Active traits removed, but history preserved
    expect(second.activeTraits).toHaveLength(0);
    expect(second.unlockedTraitIds).toContain('armor');
  });
});

describe('getActiveVariantNames', () => {
  it('returns empty array for base state', () => {
    const state = evaluateEvolution(
      { commitsPerDay: 0.1, testRatio: 0, refactorRatio: 0, nightOwlRatio: 0, activeStreak: 0, totalCommits: 0, medianCommitHour: 12 },
      createInitialEvolutionState(),
    );
    expect(getActiveVariantNames(state)).toEqual([]);
  });

  it('returns variant names matching active traits', () => {
    const patterns = {
      commitsPerDay: 1,
      testRatio: 0.5,
      refactorRatio: 0.05,
      nightOwlRatio: 0,
      activeStreak: 5,
      totalCommits: 10,
      medianCommitHour: 14,
    };
    const state = evaluateEvolution(patterns, createInitialEvolutionState());
    expect(getActiveVariantNames(state)).toContain('armor');
  });
});

describe('getEvolutionSummary', () => {
  it('shows base form message when no traits active', () => {
    const state = createInitialEvolutionState();
    expect(getEvolutionSummary(state)).toContain('base form');
  });

  it('lists active traits in summary', () => {
    const patterns = {
      commitsPerDay: 1,
      testRatio: 0.5,
      refactorRatio: 0.05,
      nightOwlRatio: 0,
      activeStreak: 5,
      totalCommits: 10,
      medianCommitHour: 14,
    };
    const state = evaluateEvolution(patterns, createInitialEvolutionState());
    const summary = getEvolutionSummary(state);
    expect(summary).toContain('Test Armor');
  });
});

describe('EVOLUTION_TRAITS', () => {
  it('has unique IDs', () => {
    const ids = EVOLUTION_TRAITS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique theme variants', () => {
    const variants = EVOLUTION_TRAITS.map((t) => t.themeVariant);
    expect(new Set(variants).size).toBe(variants.length);
  });
});
