// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TopBar from './TopBar.vue'
import TelemetryPreviewModal from './settings/TelemetryPreviewModal.vue'
import UpdateModal from './settings/UpdateModal.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
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
			getAutoUpdate: vi.fn(),
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

// GET /v1/sys/autoupdate's view, as the core answers it.
function view(fields = {}) {
	return { enabled: true, window: { start: '03:00', end: '05:00' }, state: 'up_to_date', next: null, last: null, ...fields }
}

describe('the automatic update row', () => {
	// sys: the slice of $api.sys the test drives; autoUpdate: the view the row
	// starts from (null until the core has answered).
	function bar(sys, autoUpdate = view()) {
		const vm = {
			autoUpdate,
			autoUpdateSaving: false,
			$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
			$api: { sys },
			$EventBus: createEventBus(),
			$store: { commit: vi.fn() },
			$buefy: { toast: { open: vi.fn() }, modal: { open: vi.fn() } },
			$refs: { settingsDrop: { toggle: vi.fn() } },
			// The rest of mounted() and onOpen(), which these tests do not look at.
			checkVersion: vi.fn(),
			getUserInfo: vi.fn(),
			getUsbStatus: vi.fn(),
			getTelemetry: vi.fn(),
			getHardwareInfo: vi.fn(),
			onTelemetryChanged: vi.fn(),
		}
		for (const name of ['getAutoUpdate', 'setAutoUpdate', 'showUpgradeLog'])
			vm[name] = TopBar.methods[name].bind(vm)

		return vm
	}
	const stateText = vm => TopBar.computed.autoUpdateStateText.call(vm)
	const answer = data => vi.fn(() => Promise.resolve({ data: { success: 200, data } }))

	it('sits below the update row', () => {
		expect(source.indexOf('<!-- Automatic update Start -->')).toBeGreaterThan(source.indexOf('<!-- Update End -->'))
		expect(source.indexOf('<!-- Automatic update Start -->')).toBeLessThan(source.indexOf('<!-- System Package Update Start -->'))
	})

	it('asks the core when the bar mounts and each time the settings open', async () => {
		const getAutoUpdate = answer(view({ state: 'updating' }))
		const vm = bar({ getAutoUpdate }, null)

		TopBar.mounted.call(vm)
		await flushPromises()
		expect(vm.autoUpdate.state).toBe('updating')

		getAutoUpdate.mockImplementation(answer(view()))
		TopBar.methods.onOpen.call(vm, true)
		await flushPromises()

		expect(getAutoUpdate).toHaveBeenCalledTimes(2)
		expect(vm.autoUpdate.state).toBe('up_to_date')
	})

	// A core older than the feature answers 404: no row that could not work.
	it('shows no row against an older core', async () => {
		const vm = bar({ getAutoUpdate: vi.fn(() => Promise.reject(new Error('404'))) }, null)

		vm.getAutoUpdate()
		await flushPromises()

		expect(vm.autoUpdate).toBe(null)
		expect(source).toMatch(/<div v-if="autoUpdate" /)
	})

	it('turns on from the switch, and shows what the core answered', async () => {
		const setAutoUpdate = answer(view({ enabled: true, state: 'waiting' }))
		const vm = bar({ setAutoUpdate }, view({ enabled: false, state: 'off' }))

		const saving = vm.setAutoUpdate({ enabled: true })
		expect(vm.autoUpdate.enabled).toBe(true)
		expect(vm.autoUpdateSaving).toBe(true)
		await saving

		expect(setAutoUpdate).toHaveBeenCalledWith({ enabled: true })
		expect(vm.autoUpdate.state).toBe('waiting')
		expect(vm.autoUpdateSaving).toBe(false)
		expect(source).toMatch(/<b-switch :model-value="autoUpdate.enabled"\s+:disabled="autoUpdateSaving"[^>]*@update:model-value="setAutoUpdate\(\{ enabled: \$event \}\)"/)
	})

	it('shows the window, the note and the state only when on', () => {
		const block = source.slice(source.indexOf('<template v-if="autoUpdate.enabled">'), source.indexOf('<!-- Automatic update End -->'))

		expect(block).toMatch(/setAutoUpdate\(\{ window_start: \$event \}\)/)
		expect(block).toMatch(/setAutoUpdate\(\{ window_end: \$event \}\)/)
		expect(block).toContain('A new release is installed at night, two days after it comes out. Nothing starts while a backup or an app operation runs.')
		expect(block).toContain('{{ autoUpdateStateText }}')
	})

	it('moves one end of the window, and sends only that end', async () => {
		const setAutoUpdate = answer(view({ window: { start: '23:00', end: '05:00' } }))
		const vm = bar({ setAutoUpdate })

		await vm.setAutoUpdate({ window_start: '23:00' })

		expect(setAutoUpdate).toHaveBeenCalledWith({ window_start: '23:00' })
		expect(vm.autoUpdate.window).toEqual({ start: '23:00', end: '05:00' })
	})

	// The hour selects offer whole hours, across midnight too; the one window
	// they can still make that the core refuses is an empty one.
	it('offers every whole hour, but not the other end\'s', () => {
		expect(TopBar.data.call({ $store: { state: { user: {} } }, getInitLang: () => 'en_us' }).hours).toEqual(
			Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
		)
		expect(source).toMatch(/:disabled="hour === autoUpdate.window.end"/)
		expect(source).toMatch(/:disabled="hour === autoUpdate.window.start"/)
	})

	it('goes back where it was when the core refuses', async () => {
		const vm = bar({ setAutoUpdate: vi.fn(() => Promise.reject(new Error('400'))) })

		await vm.setAutoUpdate({ window_end: '03:00' })

		expect(vm.autoUpdate.window).toEqual({ start: '03:00', end: '05:00' })
		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'The setting could not be saved.', type: 'is-danger' }))
		expect(vm.autoUpdateSaving).toBe(false)
	})

	it.each([
		['up_to_date', {}, 'Up to date'],
		['updating', { last: { version: 'v0.5.8', started_at: '2026-09-24T03:10:00Z', result: 'running' } }, 'Updating…'],
		['paused', { last: { version: 'v0.5.8', started_at: '2026-09-24T03:10:00Z', result: 'failed' } }, 'Paused: v0.5.8 failed twice'],
		['off', {}, ''],
	])('says %s in words', (state, fields, text) => {
		expect(stateText(bar({}, view({ state, ...fields })))).toBe(text)
	})

	it('says when a waiting release will be installed', () => {
		const notBefore = '2026-09-26T03:00:00+02:00'
		const vm = bar({}, view({ state: 'waiting', next: { version: 'v0.5.8', not_before: notBefore } }))

		expect(stateText(vm)).toBe(`v0.5.8 will be installed after ${new Date(notBefore).toLocaleString()}`)
	})

	it('offers See the log and Try again when paused', () => {
		expect(source).toMatch(/v-if="autoUpdate.state === 'paused'"[\s\S]*?showUpgradeLog[\s\S]*?See the log[\s\S]*?setAutoUpdate\(\{ resume: true \}\)[\s\S]*?Try again/)
	})

	it('tries again by resuming', async () => {
		const setAutoUpdate = answer(view({ state: 'waiting', next: { version: 'v0.5.8', not_before: '2026-09-25T03:00:00Z' } }))
		const vm = bar({ setAutoUpdate }, view({ state: 'paused' }))

		await vm.setAutoUpdate({ resume: true })

		expect(setAutoUpdate).toHaveBeenCalledWith({ resume: true })
		expect(vm.autoUpdate.state).toBe('waiting')
	})

	it('opens the upgrade log from See the log, without starting an update', () => {
		const vm = bar({})

		vm.showUpgradeLog()

		expect(vm.$refs.settingsDrop.toggle).toHaveBeenCalled()
		expect(vm.$buefy.modal.open).toHaveBeenCalledWith(expect.objectContaining({ component: UpdateModal, props: { logOnly: true } }))
	})

	it.each([
		'Update automatically',
		'Between',
		'and',
		'A new release is installed at night, two days after it comes out. Nothing starts while a backup or an app operation runs.',
		'Up to date',
		'{version} will be installed after {date}',
		'Updating…',
		'Paused: {version} failed twice',
		'See the log',
		'Try again',
		// the notice after an automatic update (CoreService)
		'ReCasaOS updated itself to {version} last night',
		'Release notes',
	])('says "%s" in English and French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		for (const param of key.match(/\{\w+\}/g) || [])
			expect(fr[key]).toContain(param)
	})
})
