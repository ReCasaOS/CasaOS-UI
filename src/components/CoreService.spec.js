// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import CoreService from '@/components/CoreService.vue'

// An update emits app:update-begin, then app:install-progress while the images
// pull, then app:update-end. All three name the app the same way, in `app:name`.
// The two update handlers read `name` and `cid` instead, which no event carries,
// so an update drew a second nameless card under the key `undefined` and left the
// real one on screen at whatever percentage it had reached.

function service() {
	const vm = {
		noticesData: {},
		$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
		$EventBus: { $emit: vi.fn() },
		$buefy: { toast: { open: vi.fn() } },
		addIdToSessionStorage: vi.fn(),
	}
	for (const name of ['addNotice', 'removeNotice', 'appTitle', 'transformAppInstallationProgress'])
		vm[name] = CoreService.methods[name].bind(vm)

	const fire = (event, properties) => CoreService.sockets[event].call(vm, { Properties: properties })

	return { vm, fire }
}

const sonarr = {
	'app:name': 'sonarr',
	'app:title': '{"en_us":"Sonarr"}',
	'app:icon': 'sonarr.png',
}

describe('updating an app', () => {
	it('draws one card, under the app it is updating', () => {
		const { vm, fire } = service()

		fire('app:update-begin', sonarr)
		fire('app:install-progress', { ...sonarr, 'app:progress': '88' })

		expect(Object.keys(vm.noticesData)).toEqual(['sonarr'])
		expect(vm.noticesData.sonarr.prelude.title).toBe('Installing Sonarr')
		expect(vm.noticesData.sonarr.content).toEqual({ text: 'Installing 88%', value: 88 })
	})

	it('takes the card away when the update ends', () => {
		const { vm, fire } = service()

		fire('app:update-begin', sonarr)
		fire('app:install-progress', { ...sonarr, 'app:progress': '88' })
		fire('app:update-end', { ...sonarr, 'app:updated': 'true' })

		expect(vm.noticesData).toEqual({})
		expect(vm.addIdToSessionStorage).toHaveBeenCalledWith('sonarr')
	})

	// A pull that succeeded and then failed to start is not an app that was updated,
	// and badging it as new sends somebody to look at a version that is not there.
	it('badges the app only when the app itself was replaced', () => {
		const { vm, fire } = service()

		fire('app:update-begin', sonarr)
		fire('app:update-end', { ...sonarr, 'docker:image:updated': 'true' })

		expect(vm.addIdToSessionStorage).not.toHaveBeenCalled()
	})

	// Left alone, a failed update's card sits at the percentage it died on until
	// the page is reloaded, saying nothing.
	it('replaces the card with the reason when it fails', () => {
		const { vm, fire } = service()

		fire('app:update-begin', sonarr)
		fire('app:update-error', { ...sonarr, message: 'no space left on device' })

		expect(vm.noticesData.sonarr).toBeUndefined()
		expect(vm.noticesData.sonarrerror.content.text).toBe('no space left on device')
		expect(vm.$buefy.toast.open).toHaveBeenCalled()
	})
})

// The title comes from the app's store entry, and an app whose compose file has no
// x-casaos has none. Parsing it unguarded threw inside the socket handler, so the
// card never appeared at all.
describe('an app the catalogue knows nothing about', () => {
	it('is named by its own name rather than throwing', () => {
		const { vm, fire } = service()

		fire('app:update-begin', { 'app:name': 'gluetun-stack' })

		expect(vm.noticesData['gluetun-stack'].prelude.title).toBe('Installing gluetun-stack')
	})

	it('is named that way on install too', () => {
		const { vm, fire } = service()

		fire('app:install-begin', { 'app:name': 'gluetun-stack' })

		expect(vm.noticesData['gluetun-stack'].prelude.title).toBe('Installing gluetun-stack')
	})
})

// The message bus takes the user's JWT from the query of a subscription.
describe('a message bus subscription', () => {
	it('carries the token of the moment, encoded', () => {
		const opened = []
		vi.stubGlobal('WebSocket', class {
			constructor(url) {
				opened.push(url)
			}
		})
		const vm = { $wsProtocol: 'ws:', $baseURL: 'casa.local', $store: { state: { access_token: 'a.b+c/d' } } }
		const createWS = CoreService.methods.createWS.bind(vm)

		createWS('local-storage')
		vm.$store.state.access_token = 'e.f'
		createWS('local-storage')
		vi.unstubAllGlobals()

		expect(opened).toEqual([
			'ws://casa.local/v2/message_bus/event/local-storage?token=a.b%2Bc%2Fd',
			'ws://casa.local/v2/message_bus/event/local-storage?token=e.f',
		])
	})
})
