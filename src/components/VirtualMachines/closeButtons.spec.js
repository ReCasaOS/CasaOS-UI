import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileStyle, parse } from '@vue/compiler-sfc'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

// The close buttons of the page and of the console are buttons, for the keyboard,
// and so a rule of the component takes the button's own look off. A scoped rule
// outranks the global `.close-button:active`, so what it sets at rest it has to
// set again for the pressed state, or pressing the button shows nothing.

const FILES = ['VmPage.vue', 'VmConsoleModal.vue']

// the CSS of the component as the build gives it: scoped, and out of SCSS
function cssOf(file) {
	const { descriptor } = parse(readFileSync(join(import.meta.dirname, file), 'utf8'), { filename: file })
	return descriptor.styles.flatMap((style) => {
		const { code, errors } = compileStyle({
			source: style.content,
			filename: file,
			id: 'data-v-spec',
			scoped: style.scoped,
			preprocessLang: style.lang,
			// the dashboard's own mixins are not in the file
			preprocessOptions: { additionalData: '@mixin touch { @content }' },
		})
		expect(errors).toEqual([])
		const rules = []
		postcss.parse(code).walkRules(rule => rules.push({
			selector: rule.selector,
			decls: Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value])),
		}))
		return rules
	})
}

describe('the close buttons of the virtual machine page and console', () => {
	it.each(FILES)('%s shows a button pressed', (file) => {
		const rules = cssOf(file)
		const atRest = rules.filter(rule => /\.close-button(?:\[[^\]]+\])?$/.test(rule.selector))
		expect(atRest.length).toBeGreaterThan(0)

		for (const rule of atRest) {
			const pressed = rules.find(other => other.selector === `${rule.selector}:active`)
			expect(pressed?.decls, rule.selector).toEqual({ 'background-color': 'var(--casa-active)' })
		}
	})
})
