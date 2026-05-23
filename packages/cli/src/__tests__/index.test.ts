import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { main } from '../index.js';

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let originalUnipetIpcPath: string | undefined;
let originalXdgStateHome: string | undefined;
let originalUnipetRoot: string | undefined;
let tempRoot: string;

function stdoutText(): string {
  return stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
}

function writeDiscovery(httpPort: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'unipet-cli-test-'));
  const file = join(dir, 'ipc.json');
  writeFileSync(file, JSON.stringify({ httpPort, pid: 1234, startedAt: '2026-05-18T00:00:00.000Z', version: '0.1.6' }));
  process.env['UNIPET_IPC_PATH'] = file;
  return file;
}

function writeInvalidDiscovery(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'unipet-cli-test-'));
  const file = join(dir, 'ipc.json');
  writeFileSync(file, JSON.stringify(data));
  process.env['UNIPET_IPC_PATH'] = file;
  return file;
}

function writeTheme(root: string, id: string, overrides: Record<string, unknown> = {}): string {
  const dir = join(root, 'themes', id);
  mkdirSync(dir, { recursive: true });
  const theme = {
    schemaVersion: 1,
    id,
    displayName: id,
    description: `${id} theme`,
    renderer: 'css-pixel',
    rendererConfig: {},
    states: {
      idle: { files: ['idle'] },
      working: { files: ['working'] },
      thinking: { files: ['thinking'] },
      error: { files: ['error'] },
      attention: { files: ['attention'] },
      sleeping: { files: ['sleeping'] },
    },
    ...overrides,
  };
  writeFileSync(join(dir, 'theme.json'), JSON.stringify(theme, null, 2));
  return dir;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function closedPort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

beforeEach(() => {
  originalUnipetIpcPath = process.env['UNIPET_IPC_PATH'];
  originalXdgStateHome = process.env['XDG_STATE_HOME'];
  originalUnipetRoot = process.env['UNIPET_ROOT'];
  tempRoot = mkdtempSync(join(tmpdir(), 'unipet-root-test-'));
  process.env['UNIPET_ROOT'] = tempRoot;
  process.env['XDG_STATE_HOME'] = mkdtempSync(join(tmpdir(), 'unipet-xdg-test-'));
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  if (originalUnipetIpcPath === undefined) delete process.env['UNIPET_IPC_PATH'];
  else process.env['UNIPET_IPC_PATH'] = originalUnipetIpcPath;
  if (originalXdgStateHome === undefined) delete process.env['XDG_STATE_HOME'];
  else process.env['XDG_STATE_HOME'] = originalXdgStateHome;
  if (originalUnipetRoot === undefined) delete process.env['UNIPET_ROOT'];
  else process.env['UNIPET_ROOT'] = originalUnipetRoot;
  rmSync(tempRoot, { recursive: true, force: true });
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('CLI argument parsing', () => {
  test('--version prints version and exits 0', async () => {
    const code = await main(['--version']);
    expect(code).toBe(0);
  });

  test('-V prints version and exits 0', async () => {
    const code = await main(['-V']);
    expect(code).toBe(0);
  });

  test('--help prints help and exits 0', async () => {
    const code = await main(['--help']);
    expect(code).toBe(0);
    expect(stdoutText()).toContain('unipet doctor');
  });

  test('-h prints help and exits 0', async () => {
    const code = await main(['-h']);
    expect(code).toBe(0);
  });

  test('help command prints help and exits 0', async () => {
    const code = await main(['help']);
    expect(code).toBe(0);
  });

  test('unknown command exits 1', async () => {
    const code = await main(['nonexistent']);
    expect(code).toBe(1);
  });

  test('react without state exits 1', async () => {
    const code = await main(['react']);
    expect(code).toBe(1);
  });

  test('react with invalid state exits 2', async () => {
    const code = await main(['react', 'invalid_state_xyz']);
    expect(code).toBe(2);
  });

  test('say without message exits 1', async () => {
    const code = await main(['say']);
    expect(code).toBe(1);
  });

  test('status command returns error 3 when desktop not running', async () => {
    const code = await main(['status']);
    expect(code).toBe(3);
  });
});

describe('doctor command', () => {
  test('returns error 3 when discovered desktop app is unreachable', async () => {
    writeDiscovery(await closedPort());

    const code = await main(['doctor']);

    expect(code).toBe(3);
    expect(stdoutText()).toContain('[fail] Desktop HTTP');
  });

  test('prints parseable JSON diagnostics', async () => {
    writeDiscovery(await closedPort());

    const code = await main(['doctor', '--json']);
    const result = JSON.parse(stdoutText()) as { ok: boolean; checks: Array<{ id: string; status: string }> };

    expect(code).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.checks.some((check) => check.id === 'cli' && check.status === 'pass')).toBe(true);
    expect(result.checks.some((check) => check.id === 'desktop-http' && check.status === 'fail')).toBe(true);
  });

  test('returns success when discovered desktop status endpoint is healthy', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ running: true, port: 0, sseClients: 2 }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const port = await listen(server);
    writeDiscovery(port);

    try {
      const code = await main(['doctor', '--json']);
      const result = JSON.parse(stdoutText()) as { ok: boolean; checks: Array<{ id: string; status: string }> };

      expect(code).toBe(0);
      expect(result.ok).toBe(true);
      expect(result.checks.some((check) => check.id === 'desktop-http' && check.status === 'pass')).toBe(true);
    } finally {
      await close(server);
    }
  });

  test('reports invalid discovery files', async () => {
    writeInvalidDiscovery({ httpPort: 'not-a-number' });

    const code = await main(['doctor', '--json']);
    const result = JSON.parse(stdoutText()) as { ok: boolean; checks: Array<{ id: string; status: string; message: string }> };

    expect(code).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.checks.some((check) => check.id === 'discovery' && check.status === 'fail')).toBe(true);
  });
});

describe('install command', () => {
  test('passes --agent through to hooks installer', async () => {
    const hooksDir = join(tempRoot, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const outputFile = join(tempRoot, 'install-args.json');
    writeFileSync(
      join(hooksDir, 'install-hooks.js'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(outputFile)}, JSON.stringify(process.argv.slice(2)));\n`,
    );

    const code = await main(['install', '--agent', 'claude-code']);

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(outputFile, 'utf-8'))).toEqual(['--agent', 'claude-code']);
  });

  test('passes --uninstall through to hooks installer', async () => {
    const hooksDir = join(tempRoot, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const outputFile = join(tempRoot, 'install-uninstall-args.json');
    writeFileSync(
      join(hooksDir, 'install-hooks.js'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(outputFile)}, JSON.stringify(process.argv.slice(2)));\n`,
    );

    const code = await main(['install', '--uninstall']);

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(outputFile, 'utf-8'))).toEqual(['--uninstall']);
  });
});

describe('theme command', () => {
  test('lists themes from repository themes directory', async () => {
    writeTheme(tempRoot, 'sample-one');
    writeTheme(tempRoot, 'sample-two', { renderer: 'svg', description: 'second theme' });

    const code = await main(['theme', 'list', '--json']);
    const themes = JSON.parse(stdoutText()) as Array<{ id: string; renderer: string; description: string }>;

    expect(code).toBe(0);
    expect(themes.map((theme) => theme.id)).toContain('sample-one');
    expect(themes.map((theme) => theme.id)).toContain('sample-two');
  });

  test('validates theme directories via theme validate', async () => {
    const themeDir = writeTheme(tempRoot, 'valid-theme');

    const code = await main(['theme', 'validate', themeDir]);

    expect(code).toBe(0);
    expect(stdoutText()).toContain('Theme is valid');
  });

  test('returns a clear error when validating an empty theme directory', async () => {
    const themeDir = join(tempRoot, 'themes', 'empty-theme');
    mkdirSync(themeDir, { recursive: true });

    const code = await main(['theme', 'validate', themeDir]);

    expect(code).toBe(1);
    expect(stderrSpy.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('Theme path not found');
  });
});
