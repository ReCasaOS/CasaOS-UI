import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Templates and option blocks reach for assets with webpack's require().
// @vitejs/plugin-vue2 rewrote those into imports; @vitejs/plugin-vue leaves
// them as runtime require() calls, which vitest hands to plain Node - and
// '@/assets/...' is a webpack alias Node knows nothing about. Webpack hands
// back a URL string for an image and no test asserts on one, so hand back the
// path. Non-image requires (JSON animation data) are deliberately left alone.
const webpackAssetRequire = {
	name: 'webpack-asset-require',
	enforce: 'post',
	transform(code, id) {
		if (!id.includes('/src/') || !code.includes('require('))
			return null
		return code.replace(
			/require\(\s*["'`](@\/assets\/[^"'`]+\.(?:svg|png|jpe?g|gif|webp))["'`]\s*\)/g,
			(_match, assetPath) => JSON.stringify(assetPath),
		)
	},
}

// The language files are gathered with webpack's require.context; under vitest the same list comes from import.meta.glob, so a spec
// can use the real @/plugins/i18n with the real files.
const langFiles = {
	name: 'lang-files',
	enforce: 'pre',
	transform(code, id) {
		if (!/[\\/]src[\\/]assets[\\/]lang[\\/]index\.js$/.test(id))
			return null
		return `const modules = import.meta.glob('./*.json', { eager: true })
const langs = {}
for (const [key, mod] of Object.entries(modules))
	langs[key.replace('./', '').replace('.json', '').toLowerCase()] = mod.default
export default langs`
	},
}

// SideBar and the widgets' settings list the widgets with require.context too: the same list, as imports of the files there are.
const widgetFiles = readdirSync(fileURLToPath(new URL('./src/widgets', import.meta.url))).filter(file => file.endsWith('.vue'))
const widgetsContext = {
	name: 'widgets-context',
	enforce: 'post',
	transform(code) {
		if (!/require\.context\(\s*['"]@\/widgets['"]/.test(code))
			return null
		const imports = widgetFiles.map((file, i) => `import * as __widget${i} from '@/widgets/${file}'`).join(String.fromCharCode(10))
		const table = widgetFiles.map((file, i) => `'./${file}': __widget${i}`).join(', ')
		const context = `Object.assign(key => ({ ${table} })[key], { keys: () => ${JSON.stringify(widgetFiles.map(file => `./${file}`))} })`
		return `${imports}${String.fromCharCode(10)}${code.replace(/require\.context\(\s*['"]@\/widgets['"][^)]*\)/, context)}`
	},
}

export default defineConfig({
	plugins: [vue(), webpackAssetRequire, langFiles, widgetsContext],
	resolve: {
		alias: [
			// Both of these resolve to a CJS build under the "node" condition, which
			// vitest externalises, so their require('vue') lands on a second copy of
			// Vue - which carries its own reactivity and injection. Absolute paths
			// because neither package exports the dist file by subpath.
			{
				find: /^@vue\/test-utils$/,
				replacement: fileURLToPath(new URL('./node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs', import.meta.url)),
			},
			{
				find: /^vee-validate$/,
				replacement: fileURLToPath(new URL('./node_modules/vee-validate/dist/vee-validate.mjs', import.meta.url)),
			},
			// Same story: buefy has no `exports` map at all, so `main` wins. A
			// shallow mount never renders a Buefy slot and survives it; a real one
			// dies in renderSlot with `Cannot read properties of null (reading 'ce')`.
			{
				find: /^buefy$/,
				replacement: fileURLToPath(new URL('./node_modules/buefy/dist/buefy.esm.js', import.meta.url)),
			},
			{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
		],
		// vue-cli resolves extensionless imports of .vue files; vite does not.
		extensions: ['.mjs', '.js', '.ts', '.json', '.vue'],
	},
	test: {
		// resolve.alias only reaches what vite processes. Left externalised, these
		// packages require('vue') through Node and get their own copy - a second Vue
		// carries its own reactivity and injection, so no <Field> finds its <Form>.
		server: { deps: { inline: [/@vue\/test-utils/, /vee-validate/, /buefy/, /vue-dompurify-html/, /vue-i18n/] } },
	},
})
