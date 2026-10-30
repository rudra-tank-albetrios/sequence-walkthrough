// Dependency boundaries (plan section 3). CI fails on any violation.
//   apps/web      may use packages/*
//   packages/ai   may use packages/core
//   packages/core depends on nothing in this repo and on no browser or React library
//   features do not import each other; shared code lives in apps/web/src/shared
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports make modules impossible to reason about or test alone.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-depends-on-nothing-here',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { path: '^(packages/ai|apps|tools|examples)/' },
    },
    {
      name: 'core-has-no-browser-or-react-library',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer'],
        path: 'node_modules/(react|react-dom|zustand|mermaid|dompurify|idb-keyval|@radix-ui)',
      },
    },
    {
      name: 'ai-uses-only-core',
      severity: 'error',
      from: { path: '^packages/ai/' },
      to: { path: '^(apps|tools|examples)/' },
    },
    {
      name: 'features-do-not-import-each-other',
      severity: 'error',
      comment: 'Code two features need belongs in apps/web/src/shared.',
      from: { path: '^apps/web/src/features/([^/]+)/' },
      to: { path: '^apps/web/src/features/([^/]+)/', pathNot: '^apps/web/src/features/$1/' },
    },
    {
      name: 'shared-does-not-import-features-or-app',
      severity: 'error',
      from: { path: '^apps/web/src/shared/' },
      to: { path: '^apps/web/src/(features|app)/' },
    },
    {
      name: 'features-do-not-import-app',
      severity: 'error',
      from: { path: '^apps/web/src/features/' },
      to: { path: '^apps/web/src/app/' },
    },
    {
      name: 'tools-use-only-core',
      severity: 'error',
      from: { path: '^tools/' },
      to: { path: '^(apps|packages/ai)/' },
    },
    {
      name: 'not-to-test-files',
      severity: 'error',
      from: { pathNot: ['\\.test\\.(ts|tsx)$', '/src/test/'] },
      to: { path: ['\\.test\\.(ts|tsx)$', '/src/test/'] },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)tsconfig',
          '\\.config\\.(ts|js|cjs)$',
          '\\.test\\.(ts|tsx)$',
          // Loaded by the Vitest config, not imported
          '/src/test/setup\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['node_modules', '/dist/', '/dist-single/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
