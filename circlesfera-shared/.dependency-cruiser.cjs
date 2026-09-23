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
      name: 'no-dependency-on-app-packages',
      severity: 'error',
      comment:
        'Shared types/enums must not depend on backend or frontend application code — the ' +
        'dependency direction is one-way (backend/frontend -> shared), never the reverse (FE-004).',
      from: {
        path: '^src/',
      },
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
    moduleSystems: ['es6'],
  },
};
