/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'This dependency is part of a circular relationship. You might want to revise your solution.',
      from: {
        pathNot: '^src/auth/',
      },
      to: {
        circular: true,
      },
    },
    {
      name: 'strict-common',
      severity: 'error',
      comment: 'Shared common code should not depend on business modules.',
      from: {
        path: '^src/common/',
        pathNot: ['^src/common/testing/', '^src/common/abuse/'],
      },
      to: {
        path: '^src/(auth|users|posts|comments|chat|notifications|payments)/',
      },
    },
    {
      name: 'no-frontend-import',
      severity: 'error',
      comment:
        'Backend must never import frontend source directly — only the compiled ' +
        '@circlesfera/shared package crosses this boundary (FE-004).',
      from: {},
      to: {
        path: '(^|/)circlesfera-frontend/',
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
