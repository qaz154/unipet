/**
 * Git Adapter
 *
 * Monitors git repository state and emits pet events.
 * Reacts to: merge, rebase, conflict, push, commit, stash.
 *
 * All shell-outs are async (execFile) — the previous execSync implementation
 * blocked Electron's main event loop on every poll, freezing the UI on large
 * repos where `git rev-list` can take several seconds.
 */

import { execFile, type ExecFileOptions } from 'node:child_process';
import { promisify } from 'node:util';
import { BaseAdapter, type AgentCapabilities, type HealthStatus } from '../adapter.js';

const execFileAsync = promisify(execFile) as (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
) => Promise<{ stdout: string; stderr: string }>;

/** Run `git <args>` with a hard timeout; returns trimmed stdout or null on failure. */
async function git(args: string[], cwd: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return stdout.toString().trim();
  } catch {
    return null;
  }
}
// Git adapter uses state events, PetState is used via BaseAdapter's stateEvent helper

export interface GitAdapterConfig {
  /** Repository path to monitor */
  repoPath?: string;
  /** Poll interval in seconds */
  pollIntervalSec?: number;
}

interface GitState {
  merging: boolean;
  rebasing: boolean;
  conflicted: boolean;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  branch: string;
}

export class GitAdapter extends BaseAdapter {
  readonly id = 'git';
  readonly name = 'Git Monitor';
  readonly capabilities: AgentCapabilities = {
    pushStates: true,
    mcpTools: false,
    permissionBubbles: false,
    subagentDetection: false,
    sessionEnd: false,
  };

  private intervalId: ReturnType<typeof setInterval> | undefined;
  private lastState: GitState | undefined;
  private repoPath = '.';
  private pollIntervalMs = 5000;

  async start(ctx: import('../adapter.js').AdapterContext): Promise<void> {
    await super.start(ctx);
    const overrides = ctx.getConfig().overrides as GitAdapterConfig | undefined;
    this.repoPath = overrides?.repoPath ?? '.';
    this.pollIntervalMs = (overrides?.pollIntervalSec ?? 5) * 1000;

    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
    this.ctx.log.info(`[${this.id}] Monitoring git repo at ${this.repoPath}`);
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    await super.stop();
  }

  async detect(): Promise<boolean> {
    const out = await git(['--version'], process.cwd());
    return out !== null;
  }

  async health(): Promise<HealthStatus> {
    try {
      const state = await this.getGitState();
      return {
        healthy: true,
        message: `On branch ${state.branch}`,
        details: state as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async poll(): Promise<void> {
    try {
      const state = await this.getGitState();
      this.compareAndEmit(state);
      this.lastState = state;
    } catch (err) {
      this.ctx?.log.debug(`[${this.id}] Poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private compareAndEmit(current: GitState): void {
    const prev = this.lastState;
    if (!prev) return;

    // Conflict detection
    if (current.conflicted && !prev.conflicted) {
      this.ctx.emit(this.stateEvent('error', { reason: 'merge_conflict' }));
      return;
    }

    // Merge/rebase started
    if ((current.merging && !prev.merging) || (current.rebasing && !prev.rebasing)) {
      this.ctx.emit(this.stateEvent('working', { reason: current.merging ? 'merge' : 'rebase' }));
      return;
    }

    // Merge/rebase completed
    if ((!current.merging && prev.merging) || (!current.rebasing && prev.rebasing)) {
      this.ctx.emit(this.stateEvent('attention', { reason: 'merge_complete' }));
      return;
    }

    // Push (ahead decreased significantly)
    if (prev.ahead > 0 && current.ahead === 0) {
      this.ctx.emit(this.stateEvent('celebrating', { reason: 'push' }));
      return;
    }

    // New commits staged
    if (current.staged > prev.staged) {
      this.ctx.emit(this.stateEvent('attention', { reason: 'commit' }));
    }
  }

  private async getGitState(): Promise<GitState> {
    // Run independent reads concurrently — these don't depend on each other.
    const [branch, status, revList] = await Promise.all([
      git(['rev-parse', '--abbrev-ref', 'HEAD'], this.repoPath),
      git(['status', '--porcelain'], this.repoPath),
      git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], this.repoPath),
    ]);

    if (branch === null) {
      // Outside a repo, or git missing — surface a friendly state object
      return {
        merging: false, rebasing: false, conflicted: false,
        ahead: 0, behind: 0, staged: 0, unstaged: 0, branch: '(no repo)',
      };
    }

    const lines = status ? status.split('\n') : [];
    const staged = lines.filter((l) => /^[MADRC]/.test(l)).length;
    const unstaged = lines.filter((l) => /^.[MADRC]/.test(l)).length;
    const conflicted = lines.some((l) => /^UU|^AA|^DD/.test(l));

    let ahead = 0, behind = 0;
    if (revList) {
      const [a, b] = revList.split('\t').map(Number);
      ahead = a ?? 0;
      behind = b ?? 0;
    }

    const [merging, rebasing] = await Promise.all([
      this.fileExists(`${this.repoPath}/.git/MERGE_HEAD`),
      this.fileExists(`${this.repoPath}/.git/rebase-merge`),
    ]);

    return { merging, rebasing, conflicted, ahead, behind, staged, unstaged, branch };
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      const { access } = await import('node:fs/promises');
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
