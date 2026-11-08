// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DashboardBeta from './DashboardBeta.vue'

// the app section pulls in lottie-web, which paints into a canvas the moment it is imported
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

const showAttention = vi.fn()
const HealthStrip = {
	template: '<div><slot /></div>',
	emits: ['attention'],
	methods: { showAttention },
}

function dashboard() {
	return mount(DashboardBeta, {
		global: {
			stubs: { 'HealthStrip': HealthStrip, 'SearchBar': true, 'CoreService': true, 'AppSection': true, 'b-tag': true, 'b-button': true, 'b-icon': true },
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, name) => params[name]) : key),
				$store: { state: { searchEngineSwitch: false } },
			},
		},
	})
}

describe('beta dashboard bell', () => {
	it('shows the number of things that need a person, and none when nothing does', async () => {
		const wrapper = dashboard()
		expect(wrapper.find('.beta-bell-count').exists()).toBe(false)
		expect(wrapper.find('.beta-bell').attributes('aria-label')).toBe('Needs attention')

		await wrapper.findComponent(HealthStrip).vm.$emit('attention', 3)

		expect(wrapper.find('.beta-bell-count').text()).toBe('3')
		expect(wrapper.find('.beta-bell').attributes('aria-label')).toBe('Needs attention (3)')
	})

	it('brings the attention list into view when it is clicked', async () => {
		const wrapper = dashboard()

		await wrapper.find('.beta-bell').trigger('click')

		expect(showAttention).toHaveBeenCalledTimes(1)
	})
})

describe('beta dashboard stacking (#107)', () => {
	it('stays below the top bar (z-index 20), so the cards\' badges never cover its open menus', () => {
		const source = readFileSync('src/components/DashboardBeta.vue', 'utf8')
		const rule = source.match(/\n\.dashboard-beta \{([^}]*)/)[1]
		expect(rule).toMatch(/position: relative;/)
		expect(Number(rule.match(/z-index: (\d+);/)[1])).toBeLessThan(20)
	})
})
