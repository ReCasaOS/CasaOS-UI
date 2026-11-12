// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Settings from './Settings.vue'

// require.context has no Vite equivalent: the shipped widgets come as a plain list.
vi.mock('./shippedWidgets', () => ({
	default: ['clock', 'cpu', 'disks'].map(name => ({ name, title: name, icon: name })),
}))

function settings(order) {
	return mount(Settings, {
		props: { modelValue: order.map(name => ({ name, show: name !== 'cpu' })) },
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
