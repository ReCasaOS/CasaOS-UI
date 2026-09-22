/**
 * Stand-in for `vue-socket.io-extended` (upstream archived, no Vue 3 successor).
 *
 * It keeps the only two pieces of that plugin this app ever used: the
 * `sockets: { … }` component option, and the `$socket.$subscribe /
 * $unsubscribe` pair. Handlers are attached in `created` and detached in
 * `beforeUnmount`, as the library did.
 *
 * `$socket` lives on `globalProperties` rather than on each instance, because
 * AppStoreSourceManagement.vue reads it from `setup()` and Vue 3 runs `setup()`
 * before every mixin hook — there is no hook left that could install it in
 * time. The per-component handler list moved to a WeakMap to match.
 *
 * Not reimplemented, because nothing here reads them: `$socket.connected`,
 * `$socket.disconnected`, `$socket.client`, and the automatic Vuex
 * mutation/action dispatch (main.js never passed a store).
 */
import { getCurrentInstance } from 'vue'
import io from 'socket.io-client'

/**
 * The dashboard's one socket.io connection to the message bus.
 *
 * The bus wants the user's JWT on a subscription, and a browser cannot put a
 * header on a WebSocket, so it goes in the `token` query parameter, which
 * socket.io-client v2 sends on the handshake and on every polling request.
 *
 * The socket is created at startup, maybe before anybody has signed in, and a
 * refresh replaces the token under it, so it follows store.state.access_token:
 * shut while there is none, opened once there is, shut again on logout. A
 * refresh leaves a live connection alone; the next reconnection carries it.
 */
export function connectBus(store) {
	const socket = io({
		transports: ['websocket', 'polling'],
		path: '/v2/message_bus/socket.io/',
		autoConnect: false,
	})

	// A reconnection reuses opts.query, which would otherwise still hold the token
	// the socket first opened with, long after a refresh replaced it.
	socket.io.on('reconnect_attempt', () => {
		socket.io.opts.query = { token: store.state.access_token }
	})

	store.watch(state => state.access_token, (token) => {
		if (!token) {
			socket.close()
			return
		}
		socket.io.opts.query = { token }
		// A no-op when it is already connected, connecting or waiting to reconnect.
		socket.open()
	}, { immediate: true })

	return socket
}

export default {
	install(app, socket) {
		// Vue 3 does not expose its built-in merge strategies on app.config, so
		// spell out the methods-like merge the library relied on: a mixin and a
		// component can both contribute handlers.
		app.config.optionMergeStrategies.sockets = (to, from) => (to ? { ...to, ...from } : from)

		const handlers = new WeakMap()
		const listOf = (vm) => {
			let list = handlers.get(vm)
			if (!list)
				handlers.set(vm, (list = []))
			return list
		}
		// Set while a lifecycle hook runs, which is when the detached
		// `const subscribe = app.$socket.$subscribe` call sites use it.
		const caller = () => getCurrentInstance()?.proxy

		const subscribe = (vm, event, handler) => {
			const listener = vm ? handler.bind(vm) : handler
			if (vm)
				listOf(vm).push([event, listener])
			socket.on(event, listener)
		}

		const unsubscribe = (vm, event) => {
			if (!vm)
				return
			const kept = []
			for (const entry of listOf(vm)) {
				if (entry[0] === event)
					socket.off(entry[0], entry[1])
				else kept.push(entry)
			}
			handlers.set(vm, kept)
		}

		const api = vm => ({
			$subscribe: (event, handler) => subscribe(vm || caller(), event, handler),
			$unsubscribe: event => unsubscribe(vm || caller(), event),
		})

		// The setup()-time fallback: no instance is bound to it, so it resolves the
		// caller from the running lifecycle hook.
		app.config.globalProperties.$socket = api(null)

		app.mixin({
			// beforeCreate is too late for setup(), but it is in time for everything
			// that reaches $socket through the instance - including a caller outside
			// any hook, where getCurrentInstance() is null.
			beforeCreate() {
				this.$socket = api(this)
			},

			created() {
				// `this`, not caller(): getCurrentInstance() is not set while the
				// options-API hooks run.
				const declared = this.$options.sockets
				if (declared) {
					Object.keys(declared).forEach(event => subscribe(this, event, declared[event]))
				}
			},

			beforeUnmount() {
				for (const [event, listener] of listOf(this)) socket.off(event, listener)
				handlers.set(this, [])
			},
		})
	},
}
