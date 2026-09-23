/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'This dependency is part of a circular relationship. You might want to revise your solution.',
      from: {
        pathNot:
          '^(src/services/realtime\\.service\\.ts|src/stores/socketStore\\.ts)$',
      },
      to: {
        circular: true,
      },
    },
    {
      name: 'strict-ui',
      severity: 'error',
      comment:
        'UI components should be pure and not depend on pages, specific feature modules, stores, or API services.',
      from: {
        path: '^src/components/ui/',
      },
      to: {
        path: ['^src/pages/', '^src/stores/', '^src/services/'],
      },
    },
    {
      name: 'no-backend-import',
      severity: 'error',
      comment:
        'Frontend must never import backend source directly — only the compiled ' +
        '@circlesfera/shared package crosses this boundary (FE-004).',
      from: {},
      to: {
        path: '(^|/)circlesfera-backend/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.app.json',
    },
    moduleSystems: ['es6'],
  },
};
