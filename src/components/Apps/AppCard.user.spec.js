// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import AppCard from '@/components/Apps/AppCard.vue'

vi.mock('@/components/Logs/entry', async importOriginal => ({ ...await importOriginal(), hasLogs: vi.fn(() => Promise.resolve(false)) }))
vi.mock('@/service/backupStatus', async () => {
	const { reactive } = await import('vue')
	return { backupStatus: reactive({ states: [], ok: false }), refresh: vi.fn(() => Promise.resolve()) }
})
vi.mock('@/service/publicShare', async () => {
	const { reactive } = await import('vue')
	return { publicShare: reactive({ status: null, ok: false }), refresh: vi.fn(() => Promise.resolve()) }
})

const toast = vi.fn()
const dialog = vi.fn()
const setComposeAppStatus = vi.fn()
const updateState = vi.fn()

async function card(role, item = {}, props = {}) {
	const owner = role === 'admin'
	const wrapper = mount(AppCard, {
		props: { item: { name: 'syncthing', app_type: 'v2app', status: 'exited', title: { en_us: 'Syncthing' }, port: '8384', ...item }, ...props },
		global: {
			plugins: [Buefy, i18n],
			provide: { homeShowFiles: () => {}, openAppStore: () => {} },
			mocks: {
				$baseIp: 'localhost',
				$store: { getters: { canWrite: owner, canReadModule: () => owner } },
				$buefy: { toast: { open: toast }, dialog: { alert: dialog, confirm: dialog }, modal: { open: vi.fn() } },
				$openAPI: { appManagement: { compose: { setComposeAppStatus } } },
				$api: { container: { updateState } },
				$messageBus: vi.fn(),
				$EventBus: { $emit: vi.fn(), $on: vi.fn(), $off: vi.fn() },
			},
		},
		attachTo: document.body,
	})
	await nextTick()
	return wrapper
}

beforeEach(() => {
	i18n.global.locale = 'en_us'
	toast.mockReset()
	dialog.mockReset()
	setComposeAppStatus.mockReset()
	updateState.mockReset()
})

afterEach(() => {
	document.body.innerHTML = ''
})

describe('a stopped app clicked by an account that cannot write', () => {
	it.each([[false], [true]])('asks nothing of the box, says only the owner can start it, and never spins (compact %s)', async (compact) => {
		const wrapper = await card('user', {}, { compact })
		if (compact) {
			await wrapper.trigger('click')
		} else {
			await wrapper.find('img, .image').trigger('click')
		}
		await flushPromises()

		expect(setComposeAppStatus).not.toHaveBeenCalled()
		expect(updateState).not.toHaveBeenCalled()
		expect(toast).toHaveBeenCalledTimes(1)
		expect(toast.mock.calls[0][0].message).toBe('Syncthing is stopped: only the owner can start it.')
		expect(wrapper.vm.isStarting).toBe(false)
		wrapper.unmount()
	})

	it('says it in French, in the feminine', async () => {
		i18n.global.locale = 'fr_fr'
		const wrapper = await card('user', {}, { compact: true })
		await wrapper.trigger('click')

		expect(toast.mock.calls[0][0].message).toBe('Syncthing est arrêtée — seul le propriétaire peut la démarrer.')
		wrapper.unmount()
	})

	it('says on the card that the app is stopped and only the owner can start it, and offers no launch', async () => {
		const wrapper = await card('user')
		const labels = [...document.body.querySelectorAll('a, button')].map(b => b.textContent.trim())

		expect(labels).not.toContain('Launch and open')
		expect(wrapper.vm.tooltipLabel).toBe('Syncthing is stopped: only the owner can start it.')
		wrapper.unmount()
	})

	it('still opens a running app', async () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null)
		const wrapper = await card('user', { status: 'running' }, { compact: true })
		wrapper.vm.shouldOpenInNewWindow = () => true
		await wrapper.trigger('click')

		expect(toast).not.toHaveBeenCalled()
		expect(open).toHaveBeenCalled()
		open.mockRestore()
		wrapper.unmount()
	})
})

describe('a stopped app clicked by the owner', () => {
	it('starts it', async () => {
		setComposeAppStatus.mockReturnValue(new Promise(() => {}))
		const wrapper = await card('admin', {}, { compact: true })
		await wrapper.trigger('click')

		expect(setComposeAppStatus).toHaveBeenCalledWith('syncthing', 'start')
		expect(wrapper.vm.isStarting).toBe(true)
		wrapper.unmount()
	})

	it.each([
		['an answer of the box', { response: { data: { data: 'compose failed' } } }, 'compose failed'],
		['no answer at all', new Error('Network Error'), 'Network Error'],
		['a refusal told by the client', { response: { status: 403, data: { data: 'You do not have the right to do this.', message: 'You do not have the right to do this.' } } }, 'You do not have the right to do this.'],
	])('does not leave the card spinning when the start fails with %s', async (_, error, shown) => {
		setComposeAppStatus.mockReturnValue(Promise.reject(error))
		const wrapper = await card('admin', {}, { compact: true })
		await wrapper.trigger('click')
		await flushPromises()

		expect(wrapper.vm.isStarting).toBe(false)
		expect(dialog).toHaveBeenCalledTimes(1)
		expect(dialog.mock.calls[0][0].message).toBe(shown)
		wrapper.unmount()
	})
})
