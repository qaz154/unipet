/**
 * Dev launcher — starts Vite and Electron together.
 * Waits for Vite to be ready, then launches Electron.
 *
 * Fix: Kill any existing Electron dev-server processes before starting
 * to avoid port conflicts from orphaned sessions.
 */

import { spawn } from 'child_process';
import { createConnection } from 'net';
import { execSync } from 'child_process';

const VITE_PORT = 1420;

// Kill any lingering Electron dev-server processes to free the port
function killStaleElectron() {
  try {
    // Windows: find and kill node processes running electron scripts
    const out = execSync(
      'tasklist /FI "IMAGENAME eq electron.exe" /FO CSV /NH',
      { encoding: 'utf-8', windowsHide: true },
    );
    const pids = out
      .split('\n')
      .map((l) => l.split(',')[0]?.replace(/"/g, '').trim())
      .filter((n) => n && n !== 'electron.exe' && /^\d+$/.test(n));
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { windowsHide: true });
        console.log(`[UniPet] Killed stale Electron PID ${pid}`);
      } catch { /* ignore if already dead */ }
    }
    // Also kill stray vite/dev-server node processes on our port
    const connOut = execSync(
      `netstat -ano | findstr ":${VITE_PORT}" | findstr LISTENING`,
      { encoding: 'utf-8', windowsHide: true },
    );
    const portPids = [
      ...new Set(
        connOut
          .split('\n')
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p) => p && /^\d+$/.test(p)),
      ),
    ];
    for (const pid of portPids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { windowsHide: true });
        console.log(`[UniPet] Killed process on port ${VITE_PORT} (PID ${pid})`);
      } catch { /* ignore if already dead */ }
    }
  } catch { /* no stale processes found */ }
}

// Start Vite
const vite = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

// Poll for Vite to be ready
function waitForVite(retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const conn = createConnection({ port: VITE_PORT }, () => {
        conn.end();
        resolve();
      });
      conn.on('error', () => {
        if (attempts >= retries) {
          reject(new Error('Vite did not start in time'));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

async function main() {
  killStaleElectron();
  try {
    await waitForVite();
    console.log('\n[UniPet] Vite ready, launching Electron...\n');

    const electron = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${VITE_PORT}` },
    });

    electron.on('close', () => {
      vite.kill();
      process.exit(0);
    });

    vite.on('close', () => {
      electron.kill();
      process.exit(0);
    });
  } catch (err) {
    console.error('[UniPet] Failed to start:', err.message);
    vite.kill();
    process.exit(1);
  }
}

main();
