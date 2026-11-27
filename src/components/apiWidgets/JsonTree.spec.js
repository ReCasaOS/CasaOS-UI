// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import JsonTree from './JsonTree.vue'

const tree = value => mount(JsonTree, { props: { value }, global: { mocks: { $t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key) } } })
const leaves = wrapper => wrapper.findAll('[data-json-leaf]')
const picks = wrapper => wrapper.emitted('pick')?.map(([pick]) => pick) ?? []

describe('the tree of an answer', () => {
	it('draws 50 children of a node at most, and the next 50 when asked', async () => {
		const wrapper = tree(Array.from({ length: 5000 }, (_, index) => index))
		expect(leaves(wrapper)).toHaveLength(50)
		const more = wrapper.find('[data-json-more]')
		expect(more.element.tagName).toBe('BUTTON')
		expect(more.text()).toBe('Show more (4950 left)')
		await more.trigger('click')
		expect(leaves(wrapper)).toHaveLength(100)
	})

	it('has no button for more when everything is drawn', () => {
		expect(tree({ a: 1, b: 2 }).find('[data-json-more]').exists()).toBe(false)
	})

	it('opens the first two levels and folds what is deeper, until it is opened', async () => {
		const wrapper = tree({ a: { b: { c: 1 } }, d: 2 })
		expect(leaves(wrapper).map(leaf => leaf.text())).toEqual(['d 2'])
		const toggles = wrapper.findAll('[data-json-toggle]')
		expect(toggles.map(toggle => toggle.attributes('aria-expanded'))).toEqual(['true', 'true', 'false'])
		await toggles[2].trigger('click')
		expect(leaves(wrapper).map(leaf => leaf.text())).toEqual(['c 1', 'd 2'])
		expect(wrapper.findAll('[data-json-toggle]')[2].attributes('aria-expanded')).toBe('true')
	})

	it('writes a value and a key as text, never as markup', () => {
		const wrapper = tree({ '<b>key</b>': '<script>alert(1)</script>', 'img': '<img src=x onerror=alert(1)>' })
		expect(wrapper.find('script, img, b').exists()).toBe(false)
		expect(leaves(wrapper)[0].text()).toBe('<b>key</b> "<script>alert(1)</script>"')
	})

	it('cuts a long text', () => {
		expect(leaves(tree({ a: 'x'.repeat(500) }))[0].text().length).toBeLessThan(100)
	})

	it('says the leaf that is clicked, with its path and its value', async () => {
		const wrapper = tree({ stats: { 'a/b': 12 }, items: [{ name: 'one' }] })
		await leaves(wrapper)[0].trigger('click')
		expect(picks(wrapper)).toEqual([{ kind: 'leaf', path: ['stats', 'a/b'], value: 12 }])
		// the items of the list are at the third level: folded
		await wrapper.findAll('[data-json-toggle]').at(-1).trigger('click')
		await leaves(wrapper).at(-1).trigger('click')
		expect(picks(wrapper)[1]).toEqual({ kind: 'leaf', path: ['items', 0, 'name'], value: 'one' })
	})

	it('offers one row per item, or the count, on an array and only there', async () => {
		const wrapper = tree({ items: [1, 2], other: { a: 1 } })
		expect(wrapper.findAll('[data-json-each]')).toHaveLength(1)
		await wrapper.find('[data-json-each]').trigger('click')
		await wrapper.find('[data-json-count]').trigger('click')
		expect(picks(wrapper)).toEqual([{ kind: 'each', path: ['items'], value: [1, 2] }, { kind: 'count', path: ['items'], value: [1, 2] }])
	})

	it('takes an array for the root: its path is empty', async () => {
		const wrapper = tree([{ name: 'one' }])
		await wrapper.find('[data-json-each]').trigger('click')
		expect(picks(wrapper)).toEqual([{ kind: 'each', path: [], value: [{ name: 'one' }] }])
	})

	it('takes a single value for the root', async () => {
		const wrapper = tree('up')
		await leaves(wrapper)[0].trigger('click')
		expect(picks(wrapper)).toEqual([{ kind: 'leaf', path: [], value: 'up' }])
		expect(leaves(tree(null))[0].text()).toContain('null')
	})

	it('is made of buttons, which the keyboard reaches and presses', () => {
		const wrapper = tree({ items: [1], a: 1 })
		for (const control of wrapper.findAll('[data-json-toggle], [data-json-leaf], [data-json-each], [data-json-count]')) {
			expect(control.element.tagName).toBe('BUTTON')
			expect(control.attributes('type')).toBe('button')
		}
	})
})
