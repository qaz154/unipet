import { describe, test, expect } from 'vitest';
import { main } from '../index.js';

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
