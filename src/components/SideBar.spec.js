// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, reactive } from 'vue'
import SideBar from './SideBar.vue'
import shipped from '@/components/widgets/shippedWidgets'
import { getCards } from '@/service/moduleCards'

// the widgets are listed by SideBar, and one of them draws with lottie, which needs a real canvas
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))
vi.mock('@/service/moduleCards', async importOriginal => ({ ...(await importOriginal()), getCards: vi.fn() }))

const names = shipped.map(widget => widget.name)
const hidden = names.map(name => ({ name, show: false }))
const cardsAnswer = (...list) => ({ data: { data: { modules: list.map(name => ({ name, title: `Title ${name}`, route: `/v1/${name.replace(/-/g, '_')}` })) } } })

const ModuleCardStub = {
	props: ['module'],
	emits: ['loaded'],
	render() {
		return h('div', { class: 'card-stub' }, this.module.name)
	},
}
const SettingsStub = {
	props: ['modelValue', 'moduleInfo'],
	emits: ['change'],
	render() {
		return h('div', { class: 'settings-stub' })
	},
}

let setCustomStorage
let handlers
let store
function mountBar(role = 'admin', savedList = [...hidden]) {
	store = reactive({ state: { user: { role }, roleConfirmed: true, sidebarOpen: false }, getters: { isAdmin: role === 'admin', canReadModule: () => true } })
	setCustomStorage = vi.fn((key, data) => Promise.resolve({ data: { success: 200, data } }))
	handlers = {}
	return mount(SideBar, {
		global: {
			stubs: { ModuleCard: ModuleCardStub, Settings: SettingsStub },
			mocks: {
				$store: store,
				$api: { users: { getCustomStorage: () => Promise.resolve({ status: 200, data: { data: savedList } }), setCustomStorage } },
				$EventBus: { $on: (event, fn) => { handlers[event] = fn }, $off: vi.fn() },
			},
		},
	})
}

beforeEach(() => {
	document.body.innerHTML = '<div class="slider-content"></div>'
	getCards.mockReset()
	getCards.mockResolvedValue(cardsAnswer('wake-on-lan', 'second'))
})
afterEach(() => {
	vi.useRealTimers()
})

const shown = wrapper => wrapper.findAll('.card-stub').map(el => el.text())
const listed = wrapper => wrapper.findComponent(SettingsStub).props('modelValue').map(item => item.name)

describe('the cards of the modules on the classic home', () => {
	it('shows a card per module of the list, after the widgets, and offers them in the settings with their title', async () => {
		const wrapper = mountBar()
		await flushPromises()
		expect(getCards).toHaveBeenCalledTimes(1)
		expect(shown(wrapper)).toEqual(['wake-on-lan', 'second'])
		expect(listed(wrapper).slice(-2)).toEqual(['module:wake-on-lan', 'module:second'])
		expect(wrapper.findComponent(SettingsStub).props('moduleInfo')['module:wake-on-lan'].title).toBe('Title wake-on-lan')
		// the new cards are given a place at the end, and saved
		expect(setCustomStorage).toHaveBeenCalledTimes(1)
		expect(setCustomStorage.mock.calls[0][1].slice(-2)).toEqual([{ name: 'module:wake-on-lan', show: true }, { name: 'module:second', show: true }])
	})

	it('keeps the saved order and the hidden state of a card', async () => {
		const wrapper = mountBar('admin', [{ name: 'module:second', show: true }, ...hidden, { name: 'module:wake-on-lan', show: false }])
		await flushPromises()
		expect(shown(wrapper)).toEqual(['second'])
		expect(setCustomStorage).not.toHaveBeenCalled()
	})

	it('keeps a saved card of a module that the list does not have, without showing it or offering it', async () => {
		getCards.mockResolvedValue(cardsAnswer('second'))
		const wrapper = mountBar('admin', [{ name: 'module:wake-on-lan', show: false }, ...hidden, { name: 'module:second', show: true }])
		await flushPromises()
		expect(shown(wrapper)).toEqual(['second'])
		expect(listed(wrapper)).not.toContain('module:wake-on-lan')
		expect(setCustomStorage).not.toHaveBeenCalled()

		// what the settings hand back does not forget it
		wrapper.findComponent(SettingsStub).vm.$emit('change', [{ name: 'module:second', show: true }, ...hidden])
		await flushPromises()
		const saved = setCustomStorage.mock.calls[0][1]
		expect(saved.find(item => item.name === 'module:wake-on-lan')).toEqual({ name: 'module:wake-on-lan', show: false })
	})

	it('does not lose the place of a saved card while the list is slow', async () => {
		let answer
		getCards.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		const wrapper = mountBar('admin', [{ name: 'module:wake-on-lan', show: false }, ...hidden])
		await flushPromises()
		expect(shown(wrapper)).toEqual([])
		answer(cardsAnswer('wake-on-lan'))
		await flushPromises()
		expect(shown(wrapper)).toEqual([])
		expect(wrapper.findComponent(SettingsStub).props('modelValue')[0]).toEqual({ name: 'module:wake-on-lan', show: false })
		for (const call of setCustomStorage.mock.calls)
			expect(call[1][0]).toEqual({ name: 'module:wake-on-lan', show: false })
	})

	it.each(['user', ''])('asks nothing, and shows nothing, for an account whose role is %j', async (role) => {
		const wrapper = mountBar(role, [{ name: 'module:wake-on-lan', show: true }, ...hidden])
		await flushPromises()
		expect(getCards).not.toHaveBeenCalled()
		expect(wrapper.findAll('.card-stub')).toHaveLength(0)
		expect(listed(wrapper)).not.toContain('module:wake-on-lan')
	})

	it('asks nothing while the role is not confirmed, and asks when the account is known to be the administrator', async () => {
		const wrapper = mountBar('user')
		store.state.roleConfirmed = false
		await flushPromises()
		expect(getCards).not.toHaveBeenCalled()
		store.getters.isAdmin = true
		store.state.roleConfirmed = true
		await flushPromises()
		expect(getCards).toHaveBeenCalledTimes(1)
		expect(shown(wrapper)).toEqual(['wake-on-lan', 'second'])
	})

	it('reads the list again every five minutes and when the Modules window installs or removes a module', async () => {
		vi.useFakeTimers()
		const wrapper = mountBar()
		await flushPromises()
		expect(getCards).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
		expect(getCards).toHaveBeenCalledTimes(2)

		getCards.mockResolvedValue(cardsAnswer('wake-on-lan'))
		handlers.modulesChanged()
		await flushPromises()
		expect(getCards).toHaveBeenCalledTimes(3)
		// a module that was removed is gone from the home
		expect(shown(wrapper)).toEqual(['wake-on-lan'])

		wrapper.unmount()
		await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
		expect(getCards).toHaveBeenCalledTimes(3)
	})

	it('keeps the cards it has when the list cannot be read', async () => {
		const wrapper = mountBar()
		await flushPromises()
		getCards.mockRejectedValue(new Error('down'))
		handlers.modulesChanged()
		await flushPromises()
		expect(shown(wrapper)).toEqual(['wake-on-lan', 'second'])
	})
})
