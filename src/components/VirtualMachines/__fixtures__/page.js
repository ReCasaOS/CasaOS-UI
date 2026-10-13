// The VM page mounted for the specs, with the real Buefy (its programmatic
// toasts, modals and dialogs render for real, in the document) and the real
// vue-i18n. The service is faked: the spec that imports this file mocks
// './api' and sets the answers on it.
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, vi } from 'vitest'
import { openVirtualMachines } from '../entry'
import VmPage from '../VmPage.vue'
import vmApi from '../api'
import { HOST, aVm } from './vm'
import socketPlugin from '@/plugins/socket'
import i18n from '@/plugins/i18n'

// The message bus' socket, as the plugin only ever uses it: `on` and `off`.
// `receive` is the bus pushing an event, or the socket connecting.
export function fakeSocket() {
	const listeners = new Map()
	return {
		count: event => (listeners.get(event) || []).length,
		on(event, fn) {
			listeners.set(event, [...(listeners.get(event) || []), fn])
		},
		off(event, fn) {
			listeners.set(event, (listeners.get(event) || []).filter(f => f !== fn))
		},
		receive(event, ...args) {
			for (const fn of [...(listeners.get(event) || [])]) {
				fn(...args)
			}
		},
	}
}

// What the service answers to the page's first requests
export function serve({ vms = [aVm()], host = HOST, list } = {}) {
	vmApi.host.mockResolvedValue({ data: { data: host } })
	// `list`: a promise of the test's own, to answer when it likes
	vmApi.list.mockReturnValue(list || Promise.resolve({ data: { data: vms } }))
	vmApi.images.mockResolvedValue({ data: { data: [] } })
	vmApi.get.mockImplementation(async id => ({ data: { data: vms.find(vm => vm.id === id) } }))
}

// Whether a modal or a dialog with this inside is on screen. One that has left
// stays in the document, hidden, until Buefy takes it away.
export function isOpen(selector) {
	const modal = document.querySelector(selector)?.closest('.modal')
	return Boolean(modal) && modal.style.display !== 'none'
}

// what the page asks of the dashboard's own API: the user's order, and the folders
function fakeApi() {
	return {
		users: {
			getCustomStorage: vi.fn().mockResolvedValue({ data: { data: { data: [] } } }),
			setCustomStorage: vi.fn().mockResolvedValue({}),
		},
		folder: { getList: vi.fn().mockResolvedValue({ data: { data: { content: [] } } }) },
	}
}

// The page opened the way the app grid opens it, in a modal of its own, so that
// the modals it opens pile up on it as they do on the dashboard.
export async function openPage(options = {}) {
	serve(options)
	const host = mount({ render: () => null }, {
		attachTo: document.body,
		global: { plugins: [Buefy, i18n, [socketPlugin, fakeSocket()]], mocks: { $api: fakeApi() } },
	})
	openVirtualMachines(host.vm.$buefy, {})
	await vi.waitFor(() => expect(isOpen('.vm-page')).toBe(true))
	await flushPromises()
	return { host }
}

export const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))

export async function mountPage(options = {}) {
	serve(options)
	const api = fakeApi()
	const socket = fakeSocket()
	const wrapper = mount(VmPage, {
		attachTo: document.body,
		global: { plugins: [Buefy, i18n, [socketPlugin, socket]], mocks: { $api: api } },
	})
	await flushPromises()
	// what the message bus pushes
	const fire = (event, Properties) => socket.receive(event, { Properties })
	return { wrapper, api, socket, fire }
}
