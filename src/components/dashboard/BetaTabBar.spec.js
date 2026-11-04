// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BetaTabBar from './BetaTabBar.vue'

function bar() {
	const homeShowFiles = vi.fn()
	const emit = vi.fn()
	const wrapper = mount(BetaTabBar, {
		global: {
			provide: { homeShowFiles },
			mocks: { $t: key => key, $EventBus: { $emit: emit } },
		},
	})
	return { wrapper, homeShowFiles, emit }
}

afterEach(() => {
	document.body.innerHTML = ''
})

describe('beta tab bar', () => {
	it('has the four tabs of the proposal, Home the current one', () => {
		const { wrapper } = bar()

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Home', 'My apps', 'Files', 'Settings'])
		expect(wrapper.find('[aria-current="page"]').text()).toBe('Home')
	})

	it('scrolls to the apps and back to the top, and says which one it is on', async () => {
		document.body.innerHTML = '<div class="dashboard-beta"><div class="beta-main"></div></div>'
		const scrolled = []
		Element.prototype.scrollIntoView = function scrollIntoView() {
			scrolled.push(this.className)
		}
		const { wrapper } = bar()

		await wrapper.findAll('button')[1].trigger('click')
		expect(scrolled).toEqual(['beta-main'])
		expect(wrapper.find('[aria-current="page"]').text()).toBe('My apps')

		await wrapper.findAll('button')[0].trigger('click')
		expect(scrolled).toEqual(['beta-main', 'dashboard-beta'])
		expect(wrapper.find('[aria-current="page"]').text()).toBe('Home')
	})

	it('opens Files and the settings menu over the page, without leaving its tab', async () => {
		const { wrapper, homeShowFiles, emit } = bar()

		await wrapper.findAll('button')[2].trigger('click')
		await wrapper.findAll('button')[3].trigger('click')

		expect(homeShowFiles).toHaveBeenCalledTimes(1)
		expect(emit).toHaveBeenCalledWith('casaUI:openSettings')
		expect(wrapper.find('[aria-current="page"]').text()).toBe('Home')
	})
})
