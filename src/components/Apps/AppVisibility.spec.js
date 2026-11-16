// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppVisibility from './AppVisibility.vue'
import getters from '@/store/getters'
import i18n from '@/plugins/i18n'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

const api = vi.hoisted(() => ({ listAccounts: vi.fn(), getVisibility: vi.fn(), setVisibility: vi.fn(), getDashboardHidden: vi.fn(), setDashboardHidden: vi.fn() }))
const bus = { $emit: vi.fn() }
vi.mock('@/service/accounts', () => ({ listAccounts: api.listAccounts }))
vi.mock('@/service/visibility', () => ({ getVisibility: api.getVisibility, setVisibility: api.setVisibility, getDashboardHidden: api.getDashboardHidden, setDashboardHidden: api.setDashboardHidden }))

const ok = data => Promise.resolve({ data: { data } })
const accounts = [
	{ id: 1, username: 'root', role: 'admin' },
	{ id: 2, username: 'ann', role: 'user' },
	{ id: 3, username: 'bob', role: 'user' },
]

let wrapper
function open(role, props = {}) {
	const state = { user: { role }, roleConfirmed: true }
	wrapper = mount(AppVisibility, {
		props: { appId: 'jellyfin', ...props },
		global: {
			plugins: [Buefy, i18n],
			mocks: { $EventBus: bus, $store: { state, getters: { isAdmin: getters.isAdmin(state) } } },
		},
	})
	return flushPromises()
}

describe('the Visibility section of an app', () => {
	beforeEach(() => {
		api.listAccounts.mockReset().mockImplementation(() => ok(accounts))
		api.getVisibility.mockReset().mockImplementation(() => ok({ hidden_for: [3] }))
		api.setVisibility.mockReset().mockImplementation(() => ok({ hidden_for: [] }))
		api.getDashboardHidden.mockReset().mockImplementation(() => ok({ hidden: false }))
		api.setDashboardHidden.mockReset().mockImplementation((app, hidden) => ok({ hidden }))
		bus.$emit.mockReset()
	})
	afterEach(() => wrapper?.unmount())

	it('lists the user accounts as checkboxes, for the admin only', async () => {
		await open('admin')
		const boxes = wrapper.findAll('.b-checkbox input')
		expect(boxes).toHaveLength(2)
		expect(wrapper.text()).toContain('ann')
		expect(wrapper.text()).not.toContain('root')
		expect(boxes[0].element.checked).toBe(false)
		expect(boxes[1].element.checked).toBe(true)
		wrapper.unmount()

		for (const role of ['user', '', undefined]) {
			await open(role)
			expect(wrapper.find('.b-checkbox input').exists()).toBe(false)
			expect(api.getVisibility).toHaveBeenCalledTimes(1)
			wrapper.unmount()
		}
	})

	it('says so when there is no user account, with no checkbox', async () => {
		api.listAccounts.mockImplementation(() => ok([accounts[0]]))
		await open('admin')
		expect(wrapper.find('.b-checkbox input').exists()).toBe(false)
		expect(wrapper.find('.no-user-account').exists()).toBe(true)
	})

	it('saving calls PUT with the checked ids', async () => {
		await open('admin')
		await wrapper.findAll('.b-checkbox input')[0].setValue(true)
		await wrapper.find('button.save-visibility').trigger('click')
		await flushPromises()
		expect(api.setVisibility).toHaveBeenCalledWith('jellyfin', [2, 3])
	})

	it('the wording says hidden, never forbidden', () => {
		const added = ['Visibility', 'Hidden for {name}', 'The app is visible to every account.', 'The visibility could not be saved', 'The visibility could not be read', 'Create an account to hide this app from it.']
		for (const lang of [en, fr]) {
			for (const key of added) {
				expect(lang[key], key).toBeTruthy()
				expect(`${key} ${lang[key]}`).not.toMatch(/interdit|forbidden/i)
			}
		}
	})
})

describe('the Visibility section, saving', () => {
	beforeEach(() => {
		api.setVisibility.mockReset().mockImplementation(() => ok({ hidden_for: [] }))
	})
	afterEach(() => wrapper?.unmount())

	it('sends only ids of accounts that are still user accounts', async () => {
		api.listAccounts.mockReset().mockImplementation(() => ok(accounts))
		api.getVisibility.mockReset().mockImplementation(() => ok({ hidden_for: [3, 9] }))
		await open('admin')
		await wrapper.find('button.save-visibility').trigger('click')
		await flushPromises()
		expect(api.setVisibility).toHaveBeenCalledWith('jellyfin', [3])
	})

	it('lets stale ids be cleared when no user account is left', async () => {
		api.listAccounts.mockReset().mockImplementation(() => ok([accounts[0]]))
		api.getVisibility.mockReset().mockImplementation(() => ok({ hidden_for: [9] }))
		await open('admin')
		expect(wrapper.find('.no-user-account').exists()).toBe(true)
		await wrapper.find('button.save-visibility').trigger('click')
		await flushPromises()
		expect(api.setVisibility).toHaveBeenCalledWith('jellyfin', [])
	})
})

describe('the Visibility section, what it says and when', () => {
	beforeEach(() => {
		i18n.global.locale = 'en_us'
		api.listAccounts.mockReset().mockImplementation(() => ok(accounts))
		api.getVisibility.mockReset().mockImplementation(() => ok({ hidden_for: [3] }))
		api.setVisibility.mockReset().mockImplementation(() => ok({ hidden_for: [3] }))
	})
	afterEach(() => wrapper?.unmount())

	it('says the app is visible to every account only once it is read, and while nobody is ticked', async () => {
		api.getVisibility.mockImplementation(() => new Promise(() => {}))
		await open('admin')
		expect(wrapper.text()).not.toContain('visible to every account')
		wrapper.unmount()

		api.getVisibility.mockImplementation(() => ok({ hidden_for: [3] }))
		await open('admin')
		expect(wrapper.text()).not.toContain('visible to every account')

		await wrapper.findAll('.b-checkbox input')[1].setValue(false)
		expect(wrapper.text()).toContain('The app is visible to every account.')
	})

	it('says Cachée pour in French and Hidden for in English', async () => {
		await open('admin')
		expect(wrapper.text()).toContain('Hidden for ann')
		wrapper.unmount()

		i18n.global.locale = 'fr_fr'
		await open('admin')
		expect(wrapper.text()).toContain('Cachée pour ann')
		expect(en['Hidden for {name}']).toBe('Hidden for {name}')
	})

	it('says it has unsaved ticks until they are saved', async () => {
		await open('admin')
		const dirty = () => wrapper.emitted('state').at(-1)[0].isDirty
		expect(dirty()).toBe(false)

		await wrapper.findAll('.b-checkbox input')[0].setValue(true)
		expect(dirty()).toBe(true)

		api.setVisibility.mockImplementation(() => ok({ hidden_for: [2, 3] }))
		await wrapper.find('button.save-visibility').trigger('click')
		await flushPromises()
		expect(dirty()).toBe(false)
	})

	it('keeps the ticks changed while a save is on its way', async () => {
		let done
		api.setVisibility.mockImplementation(() => new Promise((resolve) => {
			done = resolve
		}))
		await open('admin')
		await wrapper.findAll('.b-checkbox input')[0].setValue(true)
		await wrapper.find('button.save-visibility').trigger('click')

		await wrapper.findAll('.b-checkbox input')[1].setValue(false)
		done({ data: { data: { hidden_for: [2, 3] } } })
		await flushPromises()

		const boxes = wrapper.findAll('.b-checkbox input')
		expect(boxes[0].element.checked).toBe(true)
		expect(boxes[1].element.checked).toBe(false)
		// and what was changed since is still unsaved
		expect(wrapper.emitted('state').at(-1)[0].isDirty).toBe(true)
	})

	it('offers to try again when the read fails, and loads on the second try', async () => {
		api.listAccounts.mockImplementationOnce(() => Promise.reject(new Error('down')))
		await open('admin')
		expect(wrapper.text()).toContain('The visibility could not be read')
		expect(wrapper.text()).not.toContain('visible to every account')
		expect(wrapper.find('button.save-visibility').exists()).toBe(false)

		await wrapper.find('button.retry-visibility').trigger('click')
		await flushPromises()

		expect(wrapper.text()).not.toContain('could not be read')
		expect(wrapper.findAll('.b-checkbox input')).toHaveLength(2)
	})

	it('hides the app from the dashboard at once, apart from the ticks, and reloads the list', async () => {
		await open('admin')
		const toggle = wrapper.find('.hide-from-dashboard input')
		expect(toggle.element.checked).toBe(false)

		await toggle.setValue(true)
		await flushPromises()
		expect(api.setDashboardHidden).toHaveBeenCalledWith('jellyfin', true)
		expect(api.setVisibility).not.toHaveBeenCalled()
		expect(bus.$emit).toHaveBeenCalledWith('reloadAppList')
		expect(toggle.element.checked).toBe(true)

		// a save the server refuses puts the switch back and says so
		api.setDashboardHidden.mockImplementation(() => Promise.reject(new Error('500')))
		await toggle.setValue(false)
		await flushPromises()
		expect(toggle.element.checked).toBe(true)
		expect(wrapper.text()).toContain('could not be saved')
	})

	it('still lists the accounts, without the switch, when the app service does not know the dashboard route', async () => {
		api.getDashboardHidden.mockImplementation(() => Promise.reject(new Error('404')))
		await open('admin')
		expect(wrapper.find('.hide-from-dashboard').exists()).toBe(false)
		expect(wrapper.findAll('.b-checkbox input')).toHaveLength(2)
	})
})
