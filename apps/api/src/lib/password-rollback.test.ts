import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runnerPath = path.resolve(__dirname, 'password-rollback.runner.ts');

describe('Rollback verification in isolated test process (USE_LEGACY_BCRYPT=true)', () => {
  it('executes hash and verify operations via bcryptjs in a dedicated separate process', async () => {
    const result = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', runnerPath],
        {
          env: {
            ...process.env,
            USE_LEGACY_BCRYPT: 'true',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    if (result.code !== 0) {
      throw new Error(`Rollback runner failed (code ${result.code}): ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout.trim());
    expect(payload.success).toBe(true);
    expect(payload.isLegacyActive).toBe(true);
    expect(payload.saltRounds).toBe(12);
    expect(payload.rollbackSelfVerify).toBe(true);
    expect(payload.nativeVerifiesRollback).toBe(true);
    expect(payload.rollbackVerifiesNative).toBe(true);
    expect(payload.rollbackVerifies2a).toBe(true);
  });

  it('fails fast if runner is invoked without USE_LEGACY_BCRYPT=true', async () => {
    const result = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const env = { ...process.env };
      delete env.USE_LEGACY_BCRYPT;

      const child = spawn(
        process.execPath,
        ['--import', 'tsx', runnerPath],
        {
          env: { ...env, USE_LEGACY_BCRYPT: 'false' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('USE_LEGACY_BCRYPT must be set to "true"');
  });
});
