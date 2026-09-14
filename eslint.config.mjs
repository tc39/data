import ljharb from '@ljharb/eslint-config/flat/node/24';

export default [
	...ljharb,
	{
		rules: {
			'func-style': 'off',
			'no-magic-numbers': 'off',
		},
	},
];
