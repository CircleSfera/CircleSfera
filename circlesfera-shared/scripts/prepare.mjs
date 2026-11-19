// Builds dist/ whenever this package itself is installed (`npm install` or
// `npm ci` run in circlesfera-shared), so a fresh checkout or worktree already
// resolves `@circlesfera/shared` in the backend, the frontend and the editor.
//
// npm also runs `prepare` for this package when the backend or the frontend
// installs it through its `file:` link. That install is skipped here: CI and
// both Dockerfiles build this package with their own `npm run build` step, and
// the backend's production image must not compile anything.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import process from 'node:process';

// True when `dir` is this package's folder or one of its subfolders.
const isInsidePackage = (dir) => {
  const fromPackage = relative(realpathSync(process.cwd()), realpathSync(dir));
  return !fromPackage.startsWith('..') && !isAbsolute(fromPackage);
};

const installedFrom = process.env.INIT_CWD;
if (!installedFrom || !isInsidePackage(installedFrom)) {
  process.exit(0);
}

const build = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(build.status ?? 1);
