/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'This dependency is part of a circular relationship. You might want to revise your solution.',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-circlesfera-app-import',
      severity: 'error',
      comment:
        'The Help Desk is a product of its own (ADR-0034). It never imports ' +
        'from circlesfera-backend or circlesfera-frontend; what both need goes ' +
        'in a package both depend on. CircleSfera is reached only over HTTP, ' +
        'as any other customer is.',
      from: {},
      to: {
        path: '(^|/)circlesfera-(backend|frontend)/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    moduleSystems: ['cjs', 'es6'],
  },
};
