// The VM page mounted for the specs, with the real Buefy (its programmatic
// toasts, modals and dialogs render for real, in the document) and the real
// vue-i18n. The service is faked: the spec that imports this file mocks
// './api' and sets the answers on it.
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import VmPage from '../VmPage.vue'
import vmApi from '../api'
import { HOST, aVm } from './vm'
import socketPlugin from '@/plugins/socket'
import i18n from '@/plugins/i18n'

// The message bus' socket, as the plugin only ever uses it: `on` and `off`.
// `receive` is the bus pushing an event, or the socket connecting.
function fakeSocket() {
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

export async function mountPage(options = {}) {
	serve(options)
	const api = {
		users: {
			getCustomStorage: vi.fn().mockResolvedValue({ data: { data: { data: [] } } }),
			setCustomStorage: vi.fn().mockResolvedValue({}),
		},
	}
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
