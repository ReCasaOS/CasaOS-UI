// @vitest-environment happy-dom
import { getCurrentInstance, h, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { mount } from '@vue/test-utils'
import { createStore } from 'vuex'
import io from 'socket.io-client'
import { describe, expect, it, vi } from 'vitest'
import socketPlugin, { connectBus } from './socket'

// No real socket is ever opened: io() hands back a stand-in whose manager
// (`socket.io`) keeps the options it was given and lets the test fire its events.
vi.mock('socket.io-client', () => ({
	default: vi.fn(opts => ({
		io: Object.assign(fakeSocket(), { opts }),
		open: vi.fn(),
		close: vi.fn(),
	})),
}))

// Stands in for the socket.io-client v2 socket: the plugin only ever calls
// `on` and `off` on it. `receive` is this test saying "the server pushed one".
function fakeSocket() {
	const listeners = new Map()
	return {
		count: event => (listeners.get(event) || []).length,
		on(event, fn) {
			if (!listeners.has(event))
				listeners.set(event, [])
			listeners.get(event).push(fn)
		},
		off(event, fn) {
			listeners.set(event, (listeners.get(event) || []).filter(f => f !== fn))
		},
		receive(event, ...args) {
			for (const fn of [...(listeners.get(event) || [])]) fn(...args)
		},
	}
}

// test-utils 2 has no createLocalVue: every mount builds its own app, so the
// plugin is installed per mount instead.
function withSocket(socket) {
	return { global: { plugins: [[socketPlugin, socket]] } }
}

const blank = { render: () => h('div') }

function mountWith(socket, options) {
	return mount({ ...blank, ...options }, withSocket(socket))
}

describe('socket plugin', () => {
	it('binds each `sockets` handler, with the component as `this`', () => {
		const socket = fakeSocket()
		const seen = []
		const wrapper = mountWith(socket, {
			data: () => ({ widget: 'cpu' }),
			sockets: {
				'casaos:system:utilization': function (res) {
					seen.push([this.widget, res])
				},
			},
		})

		socket.receive('casaos:system:utilization', { Properties: { sys_cpu: '[]' } })

		expect(seen).toEqual([['cpu', { Properties: { sys_cpu: '[]' } }]])
		wrapper.unmount()
	})

	it('delivers before destroy and not after', () => {
		const socket = fakeSocket()
		const handler = vi.fn()
		const wrapper = mountWith(socket, { sockets: { 'app:install-end': handler } })

		socket.receive('app:install-end')
		wrapper.unmount()
		socket.receive('app:install-end')

		expect(handler).toHaveBeenCalledTimes(1)
		expect(socket.count('app:install-end')).toBe(0)
	})

	it('unbinds only the destroyed component', () => {
		const socket = fakeSocket()
		const kept = vi.fn()
		const dropped = vi.fn()
		const first = mount({ ...blank, sockets: { 'app:install-end': dropped } }, withSocket(socket))
		const second = mount({ ...blank, sockets: { 'app:install-end': kept } }, withSocket(socket))

		first.unmount()
		socket.receive('app:install-end')

		expect(dropped).not.toHaveBeenCalled()
		expect(kept).toHaveBeenCalledTimes(1)
		second.unmount()
	})

	// AppStoreSourceManagement.vue reads $subscribe from setup(), which Vue 2.7
	// runs before any created hook — hence the plugin binding $socket earlier.
	it('exposes $socket.$subscribe before `created` runs', () => {
		const socket = fakeSocket()
		let earlyType = 'missing'
		const wrapper = mountWith(socket, {
			beforeCreate() {
				earlyType = typeof this.$socket.$subscribe
			},
		})

		expect(earlyType).toBe('function')
		wrapper.unmount()
	})

	it('$unsubscribe drops that event and leaves the others', () => {
		const socket = fakeSocket()
		const subscribed = vi.fn()
		const declared = vi.fn()
		const wrapper = mountWith(socket, {
			sockets: { 'app-store:register-error': declared },
			mounted() {
				this.$socket.$subscribe('app-store:register-end', subscribed)
			},
		})

		socket.receive('app-store:register-end')
		wrapper.vm.$socket.$unsubscribe('app-store:register-end')
		socket.receive('app-store:register-end')
		socket.receive('app-store:register-error')

		expect(subscribed).toHaveBeenCalledTimes(1)
		expect(declared).toHaveBeenCalledTimes(1)
		wrapper.unmount()
	})

	it('cleans up $subscribe handlers on destroy as well', () => {
		const socket = fakeSocket()
		const handler = vi.fn()
		const wrapper = mountWith(socket, {
			mounted() {
				this.$socket.$subscribe('app-store:register-end', handler)
			},
		})

		wrapper.unmount()
		socket.receive('app-store:register-end')

		expect(handler).not.toHaveBeenCalled()
		expect(socket.count('app-store:register-end')).toBe(0)
	})

	// The shape of AppStoreSourceManagement.vue's <script setup>: it reads both
	// functions during setup(), then uses them from the mount/unmount hooks.
	it('survives the AppStoreSourceManagement setup() pattern', () => {
		const socket = fakeSocket()
		const end = vi.fn()
		const wrapper = mountWith(socket, {
			setup() {
				const app = getCurrentInstance().proxy
				const subscribe = app.$socket.$subscribe
				const unsubscribe = app.$socket.$unsubscribe
				onMounted(() => subscribe('app-store:register-end', end))
				onBeforeUnmount(() => unsubscribe('app-store:register-end'))
				return {}
			},
		})

		socket.receive('app-store:register-end', { ok: 1 })
		wrapper.unmount()
		socket.receive('app-store:register-end')

		expect(end).toHaveBeenCalledTimes(1)
		expect(end).toHaveBeenCalledWith({ ok: 1 })
		expect(socket.count('app-store:register-end')).toBe(0)
	})
})

describe('the message bus connection', () => {
	function storeWith(token) {
		return createStore({
			state: { access_token: token },
			mutations: {
				SET_ACCESS_TOKEN(state, value) {
					state.access_token = value
				},
			},
		})
	}

	// The app starts before anybody has signed in. The close() that start-up
	// makes on a socket that never opened is a no-op, so it is not counted.
	function signedOut() {
		const store = storeWith('')
		const socket = connectBus(store)
		socket.close.mockClear()
		return { store, socket }
	}

	async function signIn(store, token) {
		store.commit('SET_ACCESS_TOKEN', token)
		await nextTick()
	}

	it('keeps the path and transports the bus speaks, and does not connect on its own', () => {
		connectBus(storeWith(''))

		expect(io).toHaveBeenLastCalledWith({
			transports: ['websocket', 'polling'],
			path: '/v2/message_bus/socket.io/',
			autoConnect: false,
		})
	})

	it('does not connect while nobody is signed in', async () => {
		const { socket } = signedOut()
		await nextTick()

		expect(socket.open).not.toHaveBeenCalled()
	})

	it('connects on sign-in, presenting the token', async () => {
		const { store, socket } = signedOut()
		await signIn(store, 'jwt-1')

		expect(socket.io.opts.query).toEqual({ token: 'jwt-1' })
		expect(socket.open).toHaveBeenCalledTimes(1)
	})

	it('connects at once when the token is already there', () => {
		const socket = connectBus(storeWith('jwt-1'))

		expect(socket.io.opts.query).toEqual({ token: 'jwt-1' })
		expect(socket.open).toHaveBeenCalledTimes(1)
	})

	it('leaves a live connection alone through a refresh', async () => {
		const { store, socket } = signedOut()
		await signIn(store, 'jwt-1')
		await signIn(store, 'jwt-2')

		expect(socket.close).not.toHaveBeenCalled()
		expect(socket.io.opts.query).toEqual({ token: 'jwt-2' })
	})

	it('reads the token afresh on every reconnection attempt', async () => {
		const { store, socket } = signedOut()
		await signIn(store, 'jwt-1')

		// No nextTick: the attempt must not depend on the watcher having run.
		store.commit('SET_ACCESS_TOKEN', 'jwt-2')
		socket.io.receive('reconnect_attempt', 1)

		expect(socket.io.opts.query).toEqual({ token: 'jwt-2' })
	})

	it('disconnects on logout, and connects again on the next sign-in', async () => {
		const { store, socket } = signedOut()
		await signIn(store, 'jwt-1')
		await signIn(store, '')

		expect(socket.close).toHaveBeenCalledTimes(1)

		await signIn(store, 'jwt-3')

		expect(socket.open).toHaveBeenCalledTimes(2)
		expect(socket.io.opts.query).toEqual({ token: 'jwt-3' })
	})
})
