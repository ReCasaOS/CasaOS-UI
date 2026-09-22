// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TopBar from './TopBar.vue'
import TelemetryPreviewModal from './settings/TelemetryPreviewModal.vue'
import createEventBus from '@/events/eventBus'
import events from '@/events/events'

// The locale table is assembled with webpack's `require.context`, which Vite has
// no equivalent for; TopBar only reads the language names from it.
vi.mock('@/assets/lang', () => ({ default: { en_us: { lang_name: 'English' } } }))

// From the project root: import.meta.url is not a file URL under happy-dom.
const source = readFileSync('src/components/TopBar.vue', 'utf8')

// The settings menu is a Buefy dropdown whose slot a shallow mount never
// renders, and a full mount of TopBar needs more scaffolding than the row is
// worth (see __tests__/mount.spec.js), so the template is checked as text.
describe('top bar settings', () => {
	it('has no news feed row', () => {
		expect(source).not.toMatch(/news feed|rss/i)
	})
})

// The same reason keeps the methods and hooks off a mounted TopBar: they run
// against the few fields they touch.
describe('the anonymous statistics switch', () => {
	// sys: the slice of $api.sys the test drives; telemetryEnabled: where the
	// switch starts (null until the core has answered).
	function bar(sys, telemetryEnabled = true) {
		const vm = {
			telemetryEnabled,
			$t: key => key,
			$api: { sys },
			$EventBus: createEventBus(),
			$buefy: { toast: { open: vi.fn() }, modal: { open: vi.fn() } },
			$refs: { settingsDrop: { toggle: vi.fn() } },
			// The rest of mounted(), which these tests do not look at.
			checkVersion: vi.fn(),
			getUserInfo: vi.fn(),
			getUsbStatus: vi.fn(),
			getHardwareInfo: vi.fn(),
		}
		for (const name of ['getTelemetry', 'onTelemetryChanged', 'setTelemetry', 'showTelemetryPreview'])
			vm[name] = TopBar.methods[name].bind(vm)

		return vm
	}

	it('is wired to setTelemetry', () => {
		expect(source).toMatch(/:model-value="telemetryEnabled"[^>]*@update:model-value="setTelemetry"/)
	})

	it('asks the core when the bar mounts, and follows the notice\'s Turn off until it unmounts', async () => {
		const getTelemetry = vi.fn(() => Promise.resolve({
			data: { success: 200, data: { enabled: true, notice_seen: false, preview: { event: 'heartbeat', properties: {} } } },
		}))
		const vm = bar({ getTelemetry }, null)

		TopBar.mounted.call(vm)
		await flushPromises()

		expect(getTelemetry).toHaveBeenCalledTimes(1)
		expect(vm.telemetryEnabled).toBe(true)

		vm.$EventBus.$emit(events.TELEMETRY_CHANGED, false)
		expect(vm.telemetryEnabled).toBe(false)

		TopBar.beforeUnmount.call(vm)
		vm.$EventBus.$emit(events.TELEMETRY_CHANGED, true)
		expect(vm.telemetryEnabled).toBe(false)
	})

	it('shows no row when the core cannot be asked', async () => {
		const vm = bar({ getTelemetry: vi.fn(() => Promise.reject(new Error('offline'))) }, null)

		vm.getTelemetry()
		await flushPromises()

		expect(vm.telemetryEnabled).toBe(null)
		expect(source).toMatch(/v-if="telemetryEnabled !== null"/)
	})

	it('sends enabled, marks the notice seen, and shows what the core answered', async () => {
		const setTelemetry = vi.fn(() => Promise.resolve({
			data: { success: 200, data: { enabled: false, notice_seen: true, preview: { event: 'heartbeat', properties: {} } } },
		}))
		const vm = bar({ setTelemetry })

		await vm.setTelemetry(false)

		expect(setTelemetry).toHaveBeenCalledWith({ enabled: false, notice_seen: true })
		expect(vm.telemetryEnabled).toBe(false)
	})

	it('cannot be flipped again while the core is answering', async () => {
		let answer
		const vm = bar({ setTelemetry: vi.fn(() => new Promise((resolve) => {
			answer = resolve
		})) })

		const saving = vm.setTelemetry(false)
		expect(vm.telemetrySaving).toBe(true)
		answer({ data: { success: 200, data: { enabled: false, notice_seen: true } } })
		await saving

		expect(vm.telemetrySaving).toBe(false)
		expect(source).toMatch(/<b-switch :model-value="telemetryEnabled"\s+:disabled="telemetrySaving"/)
	})

	it('goes back where it was when the core refuses', async () => {
		const vm = bar({ setTelemetry: vi.fn(() => Promise.reject(new Error('offline'))) })

		await vm.setTelemetry(false)

		expect(vm.telemetryEnabled).toBe(true)
		expect(vm.$buefy.toast.open).toHaveBeenCalledTimes(1)
	})

	it('opens the preview from See what is sent', () => {
		const vm = bar({})

		vm.showTelemetryPreview()

		expect(vm.$buefy.modal.open).toHaveBeenCalledWith(expect.objectContaining({ component: TelemetryPreviewModal }))
	})
})
