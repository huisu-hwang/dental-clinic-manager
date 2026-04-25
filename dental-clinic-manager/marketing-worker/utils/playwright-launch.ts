import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// ============================================
// chromium.launch 안전 래퍼
// - executable 누락 시 1회 자동 설치 후 재시도
// - Electron 환경(ELECTRON_RUN_AS_NODE)에서도 동작
// ============================================

const MISSING_EXECUTABLE_PATTERN = /Executable doesn'?t exist|browserType\.launch.*Executable/;

let installAttempted = false;

function tryAutoInstallChromium(): { ok: boolean; output: string } {
  try {
    const playwrightPkg = require.resolve('playwright/package.json');
    const playwrightDir = path.dirname(playwrightPkg);
    const candidates = [
      path.join(playwrightDir, 'cli.js'),
      path.join(playwrightDir, 'lib', 'cli', 'cli.js'),
    ];
    const cliPath = candidates.find((p) => fs.existsSync(p));
    if (!cliPath) {
      return { ok: false, output: 'playwright cli.js not found' };
    }

    // process.execPath = Electron 본체 또는 node. ELECTRON_RUN_AS_NODE=1 설정 시 둘 다 동작.
    const result = spawnSync(process.execPath, [cliPath, 'install', 'chromium'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf-8',
      timeout: 10 * 60 * 1000,
    });

    return {
      ok: result.status === 0,
      output: `${result.stdout || ''}\n${result.stderr || ''}`.trim(),
    };
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * chromium.launch + 누락 자동 복구
 * 첫 시도가 누락 에러로 실패하면 1회만 자동 설치 후 재시도.
 * 설치 실패 시 원본 에러 그대로 throw하여 상위에서 fail_reason 기록.
 */
export async function launchChromiumWithAutoInstall(options: LaunchOptions): Promise<Browser> {
  try {
    return await chromium.launch(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!MISSING_EXECUTABLE_PATTERN.test(message)) {
      throw err;
    }
    if (installAttempted) {
      throw new Error(`Chromium 자동 설치 후에도 launch 실패: ${message}`);
    }
    installAttempted = true;

    // eslint-disable-next-line no-console
    console.warn('[playwright-launch] Chromium 누락 감지 → 자동 설치 시도');
    const installResult = tryAutoInstallChromium();
    if (!installResult.ok) {
      throw new Error(
        `Chromium 자동 설치 실패: ${installResult.output.slice(0, 500)} | 원본: ${message}`,
      );
    }
    // eslint-disable-next-line no-console
    console.info('[playwright-launch] Chromium 자동 설치 완료 → launch 재시도');
    return chromium.launch(options);
  }
}
