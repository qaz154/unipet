/**
 * Git Analyzer — extracts coding behavior patterns from git history.
 *
 * Analyzes recent commits to understand:
 * - Commit frequency (active vs. idle periods)
 * - Test-writing ratio (commits that touch test files)
 * - Refactor ratio (commits with "refactor" in message)
 * - Time-of-day patterns (night owl vs. early bird)
 * - Streak length (consecutive active days)
 *
 * Pure Node.js — depends on node:child_process.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CodingPatterns {
  /** Commits per day over the analysis window (0-∞) */
  commitsPerDay: number;
  /** Fraction of commits that touch test files (0-1) */
  testRatio: number;
  /** Fraction of commits labeled refactor (0-1) */
  refactorRatio: number;
  /** Fraction of commits made between midnight and 6am (0-1) */
  nightOwlRatio: number;
  /** Consecutive days with at least one commit (0-∞) */
  activeStreak: number;
  /** Total commits in the analysis window */
  totalCommits: number;
  /** Median hour of commit activity (0-23) */
  medianCommitHour: number;
}

export interface AnalyzerConfig {
  /** Path to git repository (default: process.cwd()) */
  repoPath?: string;
  /** Number of days to analyze (default: 30) */
  days?: number;
}

const GIT_LOG_FORMAT = '%aI|%s';
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs)$/;
const REFACTOR_PATTERN = /^refactor[:(\s]/i;

export async function analyzeCodingPatterns(config: AnalyzerConfig = {}): Promise<CodingPatterns> {
  const repoPath = config.repoPath ?? process.cwd();
  const days = config.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];

  const { stdout } = await execFileAsync(
    'git',
    ['log', `--since=${since}`, `--format=${GIT_LOG_FORMAT}`, '--name-only'],
    { cwd: repoPath, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
  );

  const lines = stdout.split('\n').filter((l) => l.trim());
  return parseGitLog(lines, days);
}

export function parseGitLog(lines: string[], days: number): CodingPatterns {
  const commits: Array<{ date: Date; message: string; files: string[] }> = [];
  let currentFiles: string[] = [];
  let currentDate: Date | null = null;
  let currentMessage = '';

  for (const line of lines) {
    if (line.includes('|') && /^\d{4}-\d{2}-\d{2}T/.test(line)) {
      if (currentDate) {
        commits.push({ date: currentDate, message: currentMessage, files: currentFiles });
      }
      const [datePart, ...msgParts] = line.split('|');
      currentDate = new Date(datePart!);
      currentMessage = msgParts.join('|');
      currentFiles = [];
    } else if (line.trim()) {
      currentFiles.push(line.trim());
    }
  }
  if (currentDate) {
    commits.push({ date: currentDate, message: currentMessage, files: currentFiles });
  }

  if (commits.length === 0) {
    return {
      commitsPerDay: 0,
      testRatio: 0,
      refactorRatio: 0,
      nightOwlRatio: 0,
      activeStreak: 0,
      totalCommits: 0,
      medianCommitHour: 12,
    };
  }

  const totalCommits = commits.length;
  const commitsPerDay = totalCommits / Math.max(days, 1);

  const testCommits = commits.filter((c) => c.files.some((f) => TEST_FILE_PATTERN.test(f)));
  const testRatio = testCommits.length / totalCommits;

  const refactorCommits = commits.filter((c) => REFACTOR_PATTERN.test(c.message));
  const refactorRatio = refactorCommits.length / totalCommits;

  const hours = commits.map((c) => c.date.getHours());
  const nightCommits = hours.filter((h) => h >= 0 && h < 6);
  const nightOwlRatio = nightCommits.length / totalCommits;

  const medianCommitHour = median(hours);

  // Calculate active streak (consecutive days ending today/yesterday)
  const commitDays = new Set(commits.map((c) => c.date.toISOString().split('T')[0]));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const checkDate = new Date(today.getTime() - i * 86_400_000);
    const dayStr = checkDate.toISOString().split('T')[0];
    if (commitDays.has(dayStr)) {
      streak++;
    } else {
      break;
    }
  }

  return {
    commitsPerDay,
    testRatio,
    refactorRatio,
    nightOwlRatio,
    activeStreak: streak,
    totalCommits,
    medianCommitHour,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}
