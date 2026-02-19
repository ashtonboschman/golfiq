import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: ['.next/**', 'coverage/**', 'node_modules/**'],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
