// Compiles the backend into dist/.
//
// 1. TypeScript 7 checks every file and compiles it.
// 2. The DTOs and controllers are compiled again with TypeScript 6 and the
//    @nestjs/swagger plugin, which writes what the API documentation knows
//    about them (property types, enums, limits, optional parameters) into
//    their output. The plugin needs TypeScript's compiler API, which
//    TypeScript 7 no longer ships; TypeScript 6 is installed as
//    `typescript-6`, and a resolve hook hands it to the plugin when it asks
//    for `typescript`. Remove this step, the hook and `typescript-6` once
//    @nestjs/swagger supports TypeScript 7.
// 3. The files the code reads at run time are copied next to it.
// 4. scripts/inject-require.js gives the plugin's `require()` calls a
//    `require` in the ES modules it wrote them into.
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    const target =
      specifier === 'typescript' || specifier.startsWith('typescript/')
        ? specifier.replace(/^typescript/, 'typescript-6')
        : specifier;
    return next(target, context);
  },
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const tsconfig = path.join(root, 'tsconfig.build.json');

// Files read from disk next to the compiled code, relative to src/.
const ASSETS = ['auth/leaked-passwords/leaked-passwords.txt'];

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: root });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

rmSync(dist, { recursive: true, force: true });
run(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfig]);

const { default: ts } = await import('typescript');
const { before } = await import('@nestjs/swagger/plugin');
const config = ts.getParsedCommandLineOfConfigFile(tsconfig, undefined, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic(diagnostic) {
    throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText));
  },
});
const program = ts.createProgram({
  options: config.options,
  rootNames: config.fileNames,
});
// The plugin's defaults, as `nest build` ran it: these are the files it
// changes. Every file is emitted, in the order `nest build` emitted them, so
// that the documentation lists enum values in the same order; only the
// output of these files is written over TypeScript 7's.
const SWAGGER_SOURCES = /\.(dto|entity|controller)\.ts$/;
const swaggerOutputs = new Set(
  program
    .getSourceFiles()
    .filter(
      (file) => !file.isDeclarationFile && SWAGGER_SOURCES.test(file.fileName),
    )
    .flatMap((file) => ts.getOutputFileNames(config, file.fileName, false))
    .map((file) => path.resolve(file)),
);
const { emitSkipped, diagnostics } = program.emit(
  undefined,
  (fileName, text, writeByteOrderMark) => {
    if (swaggerOutputs.has(path.resolve(fileName))) {
      ts.sys.writeFile(fileName, text, writeByteOrderMark);
    }
  },
  undefined,
  false,
  { before: [before({}, program)] },
);
if (emitSkipped) {
  console.error(
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }),
  );
  process.exit(1);
}

for (const asset of ASSETS) {
  cpSync(path.join(root, 'src', asset), path.join(dist, asset));
}
run(process.execPath, [path.join(root, 'scripts/inject-require.js')]);
