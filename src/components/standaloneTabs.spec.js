// @vitest-environment happy-dom
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createStore } from 'vuex'
import { afterEach, describe, expect, it, vi } from 'vitest'
import mutations from '@/store/mutations'
import getters from '@/store/getters'
import StatsTab from '@/components/Stats/StatsTab.vue'
import LogsTab from '@/components/Logs/LogsTab.vue'

vi.mock('@/components/Stats/StatsPage.vue', () => ({ default: { name: 'StatsPage', render: () => null } }))
vi.mock('@/components/Logs/LogsPage.vue', () => ({ default: { name: 'LogsPage', render: () => null } }))

// a tab of its own has no top bar: it asks the server who the account is, and its page follows the answer
function tab(component, server) {
	const store = createStore({ state: { user: { id: 2, role: 'user', rights: ['system'] }, roleConfirmed: false }, mutations, getters })
	const getUserInfo = vi.fn(server)
	const wrapper = shallowMount(component, {
		global: { plugins: [store], mocks: { $t: key => key, $route: { query: {} }, $router: { push: vi.fn() }, $api: { users: { getUserInfo } } } },
	})
	return { wrapper, store, getUserInfo }
}

afterEach(() => {
	localStorage.clear()
})

describe.each([['Statistics', StatsTab, 'StatsPage'], ['Logs', LogsTab, 'LogsPage']])('%s on a tab of its own', (_, component, page) => {
	it('confirms the role with the server and draws its page again for it', async () => {
		const { wrapper, store, getUserInfo } = tab(component, () => Promise.resolve({ data: { data: { id: 2, role: 'user', rights: [] } } }))
		const first = wrapper.findComponent({ name: page }).vm
		await flushPromises()

		expect(getUserInfo).toHaveBeenCalledTimes(1)
		expect(store.state.roleConfirmed).toBe(true)
		expect(store.getters.canReadModule('system')).toBe(false)
		expect(wrapper.findComponent({ name: page }).vm).not.toBe(first)
		wrapper.unmount()
	})

	it('keeps the stored role when the server does not answer', async () => {
		const { wrapper, store } = tab(component, () => Promise.reject(new Error('502')))
		await flushPromises()

		expect(store.state.roleConfirmed).toBe(false)
		expect(store.getters.canReadModule('system')).toBe(true)
		wrapper.unmount()
	})
})
