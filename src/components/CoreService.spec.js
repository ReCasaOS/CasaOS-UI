// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CoreService from '@/components/CoreService.vue'
import TelemetryPreviewModal from '@/components/settings/TelemetryPreviewModal.vue'
import events from '@/events/events'

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

// Statistics are on by default, and this notice is how the owner of a box learns
// it: once, after login, with the two ways out right in it.
describe('the anonymous statistics notice', () => {
	function box(state) {
		let params
		const vm = {
			$t: key => key,
			$api: {
				sys: {
					getTelemetry: vi.fn(() => Promise.resolve({ data: { success: 200, data: state } })),
					// The core answers the state after the change.
					setTelemetry: vi.fn(change => Promise.resolve({ data: { success: 200, data: { enabled: true, ...change } } })),
				},
			},
			$EventBus: { $emit: vi.fn() },
			$buefy: {
				modal: { open: vi.fn() },
				// Buefy calls onClose whenever the notice closes: its cross, or close().
				notification: {
					open: vi.fn((p) => {
						params = p
						return { close: () => p.onClose() }
					}),
				},
			},
		}
		vm.showTelemetryPreview = CoreService.methods.showTelemetryPreview.bind(vm)
		const announce = CoreService.methods.announceTelemetry.bind(vm)
		// The message is [sentence, row of buttons]; a button is found by its words.
		const click = label => params.message[1].children.find(b => b.children === label).props.onClick()
		const close = () => params.onClose()

		return { vm, announce, click, close }
	}

	it('is asked for when the dashboard opens', () => {
		const vm = { announceBackupFailures: vi.fn(), announceTelemetry: vi.fn() }

		CoreService.mounted.call(vm)

		expect(vm.announceTelemetry).toHaveBeenCalledTimes(1)
	})

	it('is shown when statistics are on and it was never seen', async () => {
		const { vm, announce } = box({ enabled: true, notice_seen: false })

		await announce()

		expect(vm.$buefy.notification.open).toHaveBeenCalledTimes(1)
		const [sentence] = vm.$buefy.notification.open.mock.calls[0][0].message
		expect(sentence.children).toBe('ReCasaOS sends anonymous statistics (versions, hardware, country).')
	})

	it.each([
		['statistics are off', { enabled: false, notice_seen: false }],
		['it was seen', { enabled: true, notice_seen: true }],
	])('is not shown when %s', async (_, state) => {
		const { vm, announce } = box(state)

		await announce()

		expect(vm.$buefy.notification.open).not.toHaveBeenCalled()
	})

	it('is not shown when the core cannot be asked', async () => {
		const { vm, announce } = box()
		vm.$api.sys.getTelemetry.mockRejectedValue(new Error('offline'))

		await announce()

		expect(vm.$buefy.notification.open).not.toHaveBeenCalled()
	})

	it('closed, is marked seen and changes nothing else', async () => {
		const { vm, announce, close } = box({ enabled: true, notice_seen: false })

		await announce()
		close()

		expect(vm.$api.sys.setTelemetry).toHaveBeenCalledTimes(1)
		expect(vm.$api.sys.setTelemetry).toHaveBeenCalledWith({ notice_seen: true })
	})

	it('opens the preview from See what is sent, and is marked seen', async () => {
		const { vm, announce, click } = box({ enabled: true, notice_seen: false })

		await announce()
		click('See what is sent')

		expect(vm.$buefy.modal.open).toHaveBeenCalledWith(expect.objectContaining({ component: TelemetryPreviewModal }))
		expect(vm.$api.sys.setTelemetry).toHaveBeenCalledTimes(1)
		expect(vm.$api.sys.setTelemetry).toHaveBeenCalledWith({ notice_seen: true })
	})

	it('turns statistics off from Turn off, in the request that marks it seen, and moves the Settings switch', async () => {
		const { vm, announce, click } = box({ enabled: true, notice_seen: false })

		await announce()
		click('Turn off')
		await flushPromises()

		expect(vm.$api.sys.setTelemetry).toHaveBeenCalledTimes(1)
		expect(vm.$api.sys.setTelemetry).toHaveBeenCalledWith({ notice_seen: true, enabled: false })
		expect(vm.$EventBus.$emit).toHaveBeenCalledWith(events.TELEMETRY_CHANGED, false)
	})
})
