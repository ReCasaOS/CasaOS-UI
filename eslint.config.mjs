// @ts-check
import antfu from '@antfu/eslint-config'

// Stylistic settings follow what the tree already does, measured by counting the
// violations of each option over src/ and keeping the option with fewer of them
// (tabs 8 108 vs 2-space 33 222, single quotes 1 330 vs double 3 311, no semi
// 2 032 vs semi 4 271, trailing commas 601 vs none 859). The aim is a lint that
// flags real problems, not a restyle.
export default antfu(
	{
		typescript: false,
		vue: { vueVersion: 3 },
		unocss: false,
		markdown: true,
		stylistic: { indent: 'tab', quotes: 'single', semi: false },
		ignores: [
			// Imported translations and exported animations: data, not code.
			'src/assets/lang/*.json',
			'src/assets/ani/*.json',
			// Specs and plans: markdown with fenced JS that is not the dashboard.
			'docs/**',
		],
	},
	{
		name: 'casaos/conventions',
		rules: {
			// 1tbs 123 vs stroustrup 215.
			'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
			'vue/brace-style': ['error', '1tbs', { allowSingleLine: true }],
			// template first in 107 files, script first in 18.
			'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
			// <img> 32 vs <img/> 18, <div></div> 59 vs <div/> 26; components split 280/227.
			'vue/html-self-closing': ['warn', {
				html: { void: 'never', normal: 'never', component: 'any' },
				svg: 'always',
				math: 'always',
			}],
			// closing bracket on the last attribute line: 229 vs 171 on its own line.
			'vue/html-closing-bracket-newline': ['warn', { singleline: 'never', multiline: 'never' }],
			// first attribute beside the tag: 218 vs 160 below it.
			'vue/first-attribute-linebreak': ['warn', { singleline: 'ignore', multiline: 'beside' }],
			// No convention in the tree (86/70 and 50/24 split) and the autofix renames
			// things that KeepAlive and recursive components key on.
			'vue/component-name-in-template-casing': 'off',
			'vue/component-definition-name-casing': 'off',
			// Their autofix wraps the content in newlines, which Vue's whitespace
			// condensing keeps as a leading/trailing space in the rendered text.
			'vue/singleline-html-element-content-newline': 'off',
			'vue/multiline-html-element-content-newline': 'off',
			// JSON stays 2-space (package.json, jsconfig.json); YAML cannot take tabs.
			'jsonc/indent': ['error', 2],
			// Carried over from the previous config.
			'vue/v-on-event-hyphenation': 'off',
			'vue/require-explicit-emits': 'off',
		},
	},
	{
		name: 'casaos/browser-code',
		files: ['src/**'],
		rules: {
			// src/ is bundled for the browser: webpack substitutes `process.env.*` and
			// resolves `path` to its polyfill, so the Node-centric rules do not apply.
			'node/prefer-global/process': 'off',
			'unicorn/prefer-node-protocol': 'off',
		},
	},
	{
		name: 'casaos/triage-backlog',
		rules: {
			// Real findings waiting for a human (listed in the chore/lint-gate PR),
			// kept visible as warnings so the gate can be green. Do not turn off.
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'eqeqeq': ['warn', 'smart'],
			'vue/eqeqeq': ['warn', 'smart'],
			'vue/no-mutating-props': 'warn',
			'vue/custom-event-name-casing': ['warn', 'camelCase'],
			'vue/prop-name-casing': ['warn', 'camelCase'],
		},
	},
	{
		name: 'casaos/root-scripts',
		files: ['message_bus.build.js', 'mock/**'],
		rules: {
			// Build and mock-server scripts talk through the console by design.
			'no-console': 'off',
		},
	},
)
