/**
 * marketing-worker의 scheduler.ts를 Electron용 CJS 번들로 빌드
 *
 * 핵심 문제: marketing-worker는 ESM (import.meta.url 사용)이고
 * Electron은 CJS (require)라서 직접 로드 불가.
 *
 * 해결: esbuild로 단일 CJS 번들 생성
 *  - import.meta.url → pathToFileURL(__filename).href
 *  - import.meta.dirname → __dirname
 */
const esbuild = require('esbuild');
const path = require('path');

const workerDir = path.resolve(__dirname, '..', '..');

/**
 * import.meta 참조를 CJS 호환 코드로 변환하는 플러그인
 */
const importMetaPlugin = {
  name: 'import-meta-to-cjs',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const fs = require('fs');
      let contents = fs.readFileSync(args.path, 'utf8');

      // import.meta.dirname → __dirname
      contents = contents.replace(/import\.meta\.dirname/g, '__dirname');
      // import.meta.url → pathToFileURL(__filename).href (fileURLToPath 호환)
      contents = contents.replace(/import\.meta\.url/g, 'require("url").pathToFileURL(__filename).href');

      return { contents, loader: 'ts' };
    });
  },
};

esbuild.build({
  entryPoints: [path.join(workerDir, 'scheduler.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(__dirname, '..', 'dist', 'scheduler-bundle.js'),
  external: ['playwright', 'sharp'],
  nodePaths: [path.join(workerDir, 'node_modules')],
  plugins: [importMetaPlugin],
  logLevel: 'info',
}).then(() => {
  console.log('[bundle-scheduler] 번들 생성 완료: dist/scheduler-bundle.js');
}).catch((err) => {
  console.error('[bundle-scheduler] 번들 실패:', err.message);
  process.exit(1);
});
