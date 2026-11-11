// 把打包好的 dist/ 推到 GitHub Pages。
//   用法：npm run build && node tools/deploy-pages.mjs <git 远端地址> [分支，默认 gh-pages]
//   例：  node tools/deploy-pages.mjs https://github.com/<你>/<仓库>.git gh-pages
// 做法：把 dist/ 抄到一个临时目录里单独成一个只有一次提交的仓库，强推到那个分支（分支上只留最新这一版）。
// 提交署名默认用 git 自己的；想换（比如公开的仓库里不想露邮箱）就设环境变量 PAGES_NAME / PAGES_EMAIL。
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [remote, branch = 'gh-pages'] = process.argv.slice(2);
if (!remote) { console.error('要给一个 git 远端地址'); process.exit(1); }
const dist = resolve(import.meta.dirname, '..', 'dist');
if (!existsSync(join(dist, 'index.html'))) { console.error('dist/ 里没有 index.html：先 npm run build'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'kongshan-pages-'));
const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
try {
  cpSync(dist, dir, { recursive: true });
  writeFileSync(join(dir, '.nojekyll'), '');          // 别让 Pages 拿 Jekyll 再处理一遍
  git('init', '-q', '-b', branch);
  const id = [];
  if (process.env.PAGES_NAME) id.push('-c', `user.name=${process.env.PAGES_NAME}`);
  if (process.env.PAGES_EMAIL) id.push('-c', `user.email=${process.env.PAGES_EMAIL}`);
  git('add', '-A');
  git(...id, 'commit', '-q', '-m', process.env.PAGES_MESSAGE ?? `空山：${new Date().toISOString().slice(0, 16).replace('T', ' ')} 的构建`);
  git('push', '-q', '--force', remote, `${branch}:${branch}`);
  console.log(`已推到 ${remote} 的 ${branch} 分支（${git('rev-parse', '--short', 'HEAD')}）`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
