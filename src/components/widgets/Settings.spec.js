// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Settings from './Settings.vue'

// require.context has no Vite equivalent: the shipped widgets come as a plain list.
vi.mock('./shippedWidgets', () => ({
	default: ['clock', 'cpu', 'disks'].map(name => ({ name, title: name, icon: name })),
}))

function settings(order, moduleInfo = {}) {
	return mount(Settings, {
		props: { modelValue: order.map(name => ({ name, show: name !== 'cpu' })), moduleInfo },
		attachTo: document.body,
		global: {
			plugins: [Buefy],
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, name) => params[name]) : key),
				$store: { state: { searchEngineSwitch: false } },
				$messageBus: vi.fn(),
			},
		},
	})
}

const names = wrapper => wrapper.emitted('update:modelValue').at(-1)[0].map(w => w.name)

describe('widgets settings: order', () => {
	it('moves a widget down with the arrow key on its handle, and keeps focus on it', async () => {
		const wrapper = settings(['clock', 'cpu', 'disks'])
		const handles = () => wrapper.findAll('.drag-handle')

		await handles()[0].trigger('keydown', { key: 'ArrowDown' })
		await wrapper.vm.$nextTick()

		expect(names(wrapper)).toEqual(['cpu', 'clock', 'disks'])
		expect(wrapper.emitted('change').at(-1)[0].map(w => w.name)).toEqual(['cpu', 'clock', 'disks'])
		expect(document.activeElement).toBe(handles()[1].element)
		wrapper.unmount()
	})

	it('moves a widget up, keeps its visibility, and does nothing past either end', async () => {
		const wrapper = settings(['clock', 'cpu', 'disks'])
		const handles = wrapper.findAll('.drag-handle')

		await handles[0].trigger('keydown', { key: 'ArrowUp' })
		await handles[2].trigger('keydown', { key: 'ArrowDown' })
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()

		await handles[1].trigger('keydown', { key: 'ArrowUp' })
		expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual([
			{ name: 'cpu', show: false },
			{ name: 'clock', show: true },
			{ name: 'disks', show: true },
		])
		wrapper.unmount()
	})

	it('puts the shipped order back from the reset button, which is off while the order is the shipped one', async () => {
		const shipped = settings(['clock', 'cpu', 'disks'])
		expect(shipped.find('.reset-order').attributes('disabled')).toBeDefined()
		shipped.unmount()

		const chosen = settings(['disks', 'clock', 'cpu'])
		expect(chosen.find('.reset-order').attributes('disabled')).toBeUndefined()
		await chosen.find('.reset-order').trigger('click')
		expect(names(chosen)).toEqual(['clock', 'cpu', 'disks'])
		expect(chosen.find('.reset-order').attributes('disabled')).toBeDefined()
		chosen.unmount()
	})
})

describe('widgets settings: the cards of the modules', () => {
	const info = { 'module:wake': { title: 'Wake {x} | @machines', icon: 'network-outline' } }

	it('lists a card with the title and the icon of the module, as text and not as a sentence to translate', () => {
		const wrapper = settings(['clock', 'module:wake'], info)
		const items = wrapper.findAll('.item.is-flex')
		expect(items.at(1).find('b').text()).toBe('Wake {x} | @machines')
		expect(items.at(1).find('.casa-network-outline, [class*="network-outline"]').exists()).toBe(true)
		expect(wrapper.find('.drag-handle[aria-label*="Wake {x}"]').exists()).toBe(true)
		wrapper.unmount()
	})

	it('moves a card, and shows one that comes after the others', async () => {
		const wrapper = settings(['clock', 'module:wake'], info)
		await wrapper.findAll('.drag-handle')[1].trigger('keydown', { key: 'ArrowUp' })
		expect(names(wrapper)).toEqual(['module:wake', 'clock'])

		await wrapper.setProps({ modelValue: [{ name: 'clock', show: true }, { name: 'module:wake', show: true }, { name: 'module:two', show: false }], moduleInfo: { ...info, 'module:two': { title: 'Two', icon: 'time-outline' } } })
		expect(wrapper.findAll('.drag-handle')).toHaveLength(3)
		expect(wrapper.text()).toContain('Two')
		wrapper.unmount()
	})
})

describe('widgets settings: the API widgets', () => {
	it('lists an API widget with its title, as text, and its icon, and moves it', async () => {
		const wrapper = settings(['clock', 'custom:ab12cd34'], { 'custom:ab12cd34': { title: 'My {router} | <b>x</b>', icon: 'network-outline' } })
		const item = wrapper.findAll('.item.is-flex').at(1)
		expect(item.find('b').text()).toBe('My {router} | <b>x</b>')
		expect(item.find('b b').exists()).toBe(false)
		expect(item.find('.casa-network-outline, [class*="network-outline"]').exists()).toBe(true)
		await wrapper.findAll('.drag-handle')[1].trigger('keydown', { key: 'ArrowUp' })
		expect(names(wrapper)).toEqual(['custom:ab12cd34', 'clock'])
		wrapper.unmount()
	})
})
