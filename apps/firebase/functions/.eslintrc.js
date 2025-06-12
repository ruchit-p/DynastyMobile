module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'google',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['tsconfig.json', 'tsconfig.dev.json', 'tsconfig.test.json'],
    sourceType: 'module',
  },
  ignorePatterns: [
    '/lib/**/*', // Ignore built files.
    '/generated/**/*', // Ignore generated files.
    '/coverage/**/*', // Ignore coverage reports.
    'jest.config.js',
    'jest.subscription.config.js',
    'jest.setup.js',
    '.eslintrc.js',
    '/scripts/**/*.js',
    '/scripts/**/*.ts',
  ],
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    quotes: ['error', 'double'],
    'import/no-unresolved': 0,
    indent: ['error', 2],
    'max-len': 'off',
    'valid-jsdoc': 'off',
    'require-jsdoc': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'object-curly-spacing': ['error', 'never'],
    'comma-dangle': ['error', 'always-multiline'],
  },
};
