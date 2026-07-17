export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-rapp-id': ({ header }) => [
          /\(RAPP-\d+\)$/.test(header ?? ''),
          'commit subject must end with the vault issue ID, e.g. "chore(repo): do thing (RAPP-5)"',
        ],
      },
    },
  ],
  rules: {
    'scope-empty': [2, 'never'],
    'subject-rapp-id': [2, 'always'],
  },
};
