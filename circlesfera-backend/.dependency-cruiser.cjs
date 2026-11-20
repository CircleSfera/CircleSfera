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
      comment:
        'common/ holds code every module may use, so it depends on nothing ' +
        'but itself and Prisma. Code that needs a module of the product ' +
        '(settings, sockets, auth) is a module of its own under src/, as ' +
        'stripe/, abuse/ and observability/ are. The test helpers in ' +
        'common/testing/ may reach any module.',
      from: {
        path: '^src/common/',
        pathNot: ['^src/common/testing/'],
      },
      to: {
        path: '^src/',
        pathNot: ['^src/common/', '^src/prisma/'],
      },
    },
    {
      name: 'helpdesk-boundary',
      severity: 'error',
      comment:
        'The Help Desk knows the product around it only through its host ' +
        'contracts. It may use the platform (common, prisma, auth guards) and ' +
        'nothing else; the host side lives in src/helpdesk-host/.',
      from: {
        path: '^src/helpdesk/',
      },
      to: {
        path: '^src/',
        pathNot: [
          '^src/helpdesk/',
          '^src/common/',
          '^src/prisma/',
          '^src/auth/',
        ],
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
