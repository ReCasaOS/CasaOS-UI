// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy from 'buefy'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TopBar from './TopBar.vue'
import TelemetryPreviewModal from './settings/TelemetryPreviewModal.vue'
import AlertsModal from './settings/AlertsModal.vue'
import OsSupportModal from './settings/OsSupportModal.vue'
import ModulesModal from './settings/ModulesModal.vue'
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

// A core whose system image owns updates and packages says so in GET /v1/sys/version
// (image_managed): no package row, and the update row says how it is updated.
describe('an image-managed core', () => {
	it('shows no system packages row', () => {
		expect(source).toMatch(/<!-- System Package Update Start -->\s*<div v-if="!updateInfo.image_managed"/)
	})

	it('says the image updates it instead of "latest version"', () => {
		expect(source).toMatch(/v-if="updateInfo.image_managed"[^>]*>\s*\{\{ \$t\("Updated with the system image"\) \}\}/)
	})

	it('keeps what the core answers', async () => {
		const vm = { $api: { sys: { getVersion: () => Promise.resolve({ data: { success: 200, data: { current_version: '0.4.81', need_update: false, image_managed: true } } }) } }, $messageBus: vi.fn() }
		TopBar.methods.checkVersion.call(vm)
		await flushPromises()
		expect(vm.updateInfo.image_managed).toBe(true)
		expect(vm.$messageBus).not.toHaveBeenCalled()
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
			getAlerts: vi.fn(),
			getModules: vi.fn(),
			getOs: vi.fn(),
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
			getAlerts: vi.fn(),
			getModules: vi.fn(),
			getOs: vi.fn(),
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
		expect(block).toContain('New releases install at night, two days after they come out, never during a backup or an app operation.')
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

	// a release without a publication date is never installed by itself
	it('says a waiting release with no date is left to the owner', () => {
		const vm = bar({}, view({ state: 'waiting', next: null }))

		expect(stateText(vm)).toBe('A newer release is out: install it by hand')
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
		'New releases install at night, two days after they come out, never during a backup or an app operation.',
		'Up to date',
		'{version} will be installed after {date}',
		'Updating…',
		'Paused: {version} failed twice',
		'See the log',
		'Try again',
		// the notice after an automatic update (CoreService)
		'ReCasaOS updated itself to {version} last night',
		'Release notes',
		// an image-managed core
		'Updated with the system image',
	])('says "%s" in English and French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		for (const param of key.match(/\{\w+\}/g) || [])
			expect(fr[key]).toContain(param)
	})
})

describe('the alerts row', () => {
	function bar(sys) {
		const vm = {
			alertsAvailable: false,
			$api: { sys },
			$buefy: { modal: { open: vi.fn() } },
			$refs: { settingsDrop: { toggle: vi.fn() } },
		}
		for (const name of ['getAlerts', 'showAlerts'])
			vm[name] = TopBar.methods[name].bind(vm)

		return vm
	}

	it('shows once the core answers', async () => {
		const vm = bar({ getAlerts: vi.fn(() => Promise.resolve({ data: { success: 200, data: { channels: [] } } })) })

		vm.getAlerts()
		await flushPromises()

		expect(vm.alertsAvailable).toBe(true)
	})

	// A core older than the feature answers 404: no row that could not work.
	it('shows no row against an older core', async () => {
		const vm = bar({ getAlerts: vi.fn(() => Promise.reject(new Error('404'))) })

		vm.getAlerts()
		await flushPromises()

		expect(vm.alertsAvailable).toBe(false)
		expect(source).toMatch(/<div v-if="alertsAvailable"/)
	})

	it('asks the core when the bar mounts', () => {
		const vm = {
			$EventBus: createEventBus(),
			getAlerts: vi.fn(),
			getModules: vi.fn(),
			getOs: vi.fn(),
			// The rest of mounted(), which this test does not look at.
			checkVersion: vi.fn(),
			getUserInfo: vi.fn(),
			getUsbStatus: vi.fn(),
			getTelemetry: vi.fn(),
			getAutoUpdate: vi.fn(),
			getHardwareInfo: vi.fn(),
			onTelemetryChanged: vi.fn(),
		}

		TopBar.mounted.call(vm)

		expect(vm.getAlerts).toHaveBeenCalledTimes(1)
	})

	it('opens the dialog from Change', () => {
		const vm = bar({})

		vm.showAlerts()

		expect(source).toMatch(/<!-- Alerts Start -->[\s\S]*?@click="showAlerts"[\s\S]*?<!-- Alerts End -->/)
		expect(vm.$refs.settingsDrop.toggle).toHaveBeenCalled()
		expect(vm.$buefy.modal.open).toHaveBeenCalledWith(expect.objectContaining({ component: AlertsModal }))
	})

	it('says "Alerts" in English and French', () => {
		expect(en.Alerts).toBe('Alerts')
		expect(fr.Alerts).toBe('Alertes')
	})
})

describe('the modules row', () => {
	function bar(sys) {
		const vm = {
			modulesAvailable: false,
			$api: { sys },
			$t: key => key,
			$buefy: { modal: { open: vi.fn() } },
			$refs: { settingsDrop: { toggle: vi.fn() } },
		}
		for (const name of ['getModules', 'showModules'])
			vm[name] = TopBar.methods[name].bind(vm)

		return vm
	}

	// What the row does with an answer of the core.
	const mod = (name, installed = null) => ({ name, installed })
	async function shows(data) {
		const vm = bar({ getModules: vi.fn(() => Promise.resolve({ data: { success: 200, data } })) })

		vm.getModules()
		await flushPromises()

		return vm.modulesAvailable
	}

	it('shows no row for an empty catalogue with nothing installed', async () => {
		expect(await shows({ catalogue: { ok: true }, modules: [] })).toBe(false)
	})

	it('shows no row for a failed catalogue with nothing installed', async () => {
		expect(await shows({ catalogue: { ok: false, error: 'none' }, modules: [] })).toBe(false)
	})

	it('shows no row for modules listed under a failed catalogue when none is installed', async () => {
		expect(await shows({ catalogue: { ok: false, error: 'bad' }, modules: [mod('a')] })).toBe(false)
	})

	it('shows a row for one offered module', async () => {
		expect(await shows({ catalogue: { ok: true }, modules: [mod('a')] })).toBe(true)
	})

	it('shows a row for an installed module even when the catalogue is missing', async () => {
		expect(await shows({ catalogue: { ok: false, error: 'none' }, modules: [mod('a', { version: '1' })] })).toBe(true)
	})

	// A core older than the feature answers 404: no row that could not work.
	it('shows no row against an older core', async () => {
		const vm = bar({ getModules: vi.fn(() => Promise.reject(new Error('404'))) })

		vm.getModules()
		await flushPromises()

		expect(vm.modulesAvailable).toBe(false)
		expect(source).toMatch(/<div v-if="modulesAvailable"/)
	})

	it('asks the core when the bar mounts', () => {
		const vm = {
			$EventBus: createEventBus(),
			getAlerts: vi.fn(),
			getModules: vi.fn(),
			getOs: vi.fn(),
			// The rest of mounted(), which this test does not look at.
			checkVersion: vi.fn(),
			getUserInfo: vi.fn(),
			getUsbStatus: vi.fn(),
			getTelemetry: vi.fn(),
			getAutoUpdate: vi.fn(),
			getHardwareInfo: vi.fn(),
			onTelemetryChanged: vi.fn(),
		}

		TopBar.mounted.call(vm)

		expect(vm.getModules).toHaveBeenCalledTimes(1)
	})

	it('sits below the system packages, and opens the window from Manage with the focus left to its heading', () => {
		const vm = bar({})

		vm.showModules()

		expect(source.indexOf('<!-- Modules Start')).toBeGreaterThan(source.indexOf('<!-- System Package Update End -->'))
		expect(source).toMatch(/<!-- Modules Start[\s\S]*?@click="showModules"[\s\S]*?<!-- Modules End -->/)
		expect(vm.$refs.settingsDrop.toggle).toHaveBeenCalled()
		expect(vm.$buefy.modal.open).toHaveBeenCalledWith(expect.objectContaining({
			component: ModulesModal,
			hasModalCard: true,
			trapFocus: true,
			autoFocus: false,
			ariaRole: 'dialog',
			ariaModal: true,
			ariaLabel: 'Modules',
			canCancel: ['escape', 'outside'],
		}))
	})

	it('says "Modules" and "Manage" in English and French', () => {
		expect(en.Modules).toBe('Modules')
		expect(en.Manage).toBe('Manage')
		expect(fr.Modules).toBe('Modules')
		expect(fr.Manage).toBe('Gérer')
	})
})

// GET /v1/sys/os, as the core answers it
function osView(support, fields = {}) {
	return {
		id: 'debian',
		version_id: '11',
		codename: 'bullseye',
		pretty_name: 'Debian GNU/Linux 11 (bullseye)',
		arch: 'amd64',
		known: true,
		support,
		next: { id: 'debian', version_id: '12', codename: 'bookworm', pretty_name: 'Debian 12 (bookworm)', state: 'report' },
		...fields,
	}
}

// The badge is in the bar's own row, so a shallow mount renders it for real.
describe('the system support badge', () => {
	const never = () => new Promise(() => {})
	const answer = data => vi.fn(() => Promise.resolve({ data: { success: 200, data } }))

	// getOs: the one call under test; every other call of the bar waits for ever.
	function mountBar(getOs, options = {}) {
		const sys = new Proxy({ getOs }, { get: (target, name) => target[name] ?? never })
		const open = vi.fn()
		const toast = vi.fn()
		const wrapper = shallowMount(TopBar, {
			...options,
			props: { initBarData: { lang: 'en_us', search_engine: 'https://duckduckgo.com/?q=', search_switch: true, recommend_switch: true, existing_apps_switch: true } },
			global: {
				plugins: [Buefy],
				mocks: {
					$t: key => key,
					$te: () => true,
					$i18n: { locale: 'en_us' },
					$api: { sys },
					$EventBus: createEventBus(),
					$messageBus: () => {},
					$buefy: { modal: { open }, toast: { open: toast } },
					$store: {
						state: { isMobile: false, sidebarOpen: false, notImportList: [], appLaunchInIframe: false, user: { username: 'tester' } },
						commit: () => {},
					},
				},
			},
		})
		return { wrapper, open, toast }
	}
	const badge = wrapper => wrapper.find('.os-support-badge')

	it('asks the core once, when the bar mounts', async () => {
		const getOs = answer(osView({ state: 'supported', ends: '2028-06-30', precision: 'day' }))
		mountBar(getOs)
		await flushPromises()

		expect(getOs).toHaveBeenCalledTimes(1)
	})

	it('says in amber that the support ends soon', async () => {
		const { wrapper } = mountBar(answer(osView({ state: 'ending_soon', ends: '2027-06-01', precision: 'month' })))
		await flushPromises()

		expect(badge(wrapper).text()).toBe('System support ends soon')
		expect(badge(wrapper).classes()).toContain('is-warning')
		expect(badge(wrapper).classes()).not.toContain('is-danger')
		expect(badge(wrapper).find('b-icon-stub').attributes('icon')).toBe('alert-outline')
	})

	it('says in red-orange that the system support ended', async () => {
		const { wrapper } = mountBar(answer(osView({ state: 'security_ended', ends: '2026-08-31', precision: 'day' })))
		await flushPromises()

		expect(badge(wrapper).text()).toBe('System support ended')
		expect(badge(wrapper).classes()).toContain('is-danger')
		expect(badge(wrapper).classes()).not.toContain('is-warning')
	})

	it('is a button in the bar\'s row, which a phone shows, and opens a dialog', async () => {
		const { wrapper } = mountBar(answer(osView({ state: 'security_ended', ends: '2026-08-31', precision: 'day' })))
		await flushPromises()

		expect(badge(wrapper).element.tagName).toBe('BUTTON')
		expect(badge(wrapper).attributes('type')).toBe('button')
		expect(badge(wrapper).attributes('aria-haspopup')).toBe('dialog')
		// .navbar-menu is hidden below 1024px
		expect(wrapper.find('.navbar-brand .os-support-badge').exists()).toBe(true)
		expect(wrapper.find('.navbar-menu .os-support-badge').exists()).toBe(false)
	})

	it.each([
		['a supported system', osView({ state: 'supported', ends: '2028-06-30', precision: 'day' })],
		['an unknown state', osView({ state: 'unknown' })],
		['a system the core does not know', osView({ state: 'unknown' }, { id: 'linuxmint', known: false, next: undefined })],
		['a known flag of false with a state that would show', osView({ state: 'security_ended' }, { known: false })],
		// Raspberry Pi OS and its kind say debian: the core says known:false and a variant, nothing more
		['a Raspberry Pi OS (variant)', osView({ state: 'unknown' }, { known: false, variant: 'raspberrypi', next: undefined })],
		['a variant, even with a state that would show', osView({ state: 'security_ended' }, { variant: 'proxmox' })],
		['an answer that is not a view', {}],
		['an empty answer', null],
	])('shows nothing for %s', async (_, view) => {
		const { wrapper, toast } = mountBar(answer(view))
		await flushPromises()

		expect(badge(wrapper).exists()).toBe(false)
		expect(toast).not.toHaveBeenCalled()
	})

	// an older core has no route (404); the others are a core that is busy or gone
	it.each([404, 401, 500, undefined])('shows nothing, and says nothing, when the call fails (%s)', async (status) => {
		const getOs = vi.fn(() => Promise.reject(Object.assign(new Error(`status ${status}`), { response: status && { status } })))
		const { wrapper, toast } = mountBar(getOs)
		await flushPromises()

		expect(getOs).toHaveBeenCalledTimes(1)
		expect(badge(wrapper).exists()).toBe(false)
		expect(toast).not.toHaveBeenCalled()
	})

	it('shows nothing while the core has not answered', async () => {
		const { wrapper } = mountBar(vi.fn(never))
		await flushPromises()

		expect(badge(wrapper).exists()).toBe(false)
	})

	it('opens the Operating system window on the view the core gave, with its focus left to the window', async () => {
		const view = osView({ state: 'security_ended', ends: '2026-08-31', precision: 'day' })
		const { wrapper, open } = mountBar(answer(view))
		await flushPromises()

		await badge(wrapper).trigger('click')

		expect(open).toHaveBeenCalledTimes(1)
		const options = open.mock.calls[0][0]
		expect(options.component).toBe(OsSupportModal)
		expect(options.props.os).toEqual(view)
		expect(options.hasModalCard).toBe(true)
		expect(options.trapFocus).toBe(true)
		expect(options.autoFocus).toBe(false)
		expect(options.canCancel).toEqual(expect.arrayContaining(['escape', 'outside']))
		// a dialog with a name, for a screen reader
		expect(options.ariaRole).toBe('dialog')
		expect(options.ariaModal).toBe(true)
		expect(options.ariaLabel).toBe('Operating system')
	})

	// Buefy leaves the focus on nothing when a window closes
	it.each([
		['Escape or a click outside', options => options.onCancel('escape')],
		['its Close button', options => options.events.close()],
	])('gives the focus back to the badge when the window closes by %s', async (_, close) => {
		const { wrapper, open } = mountBar(answer(osView({ state: 'security_ended', ends: '2026-08-31', precision: 'day' })), { attachTo: document.body })
		await flushPromises()
		await badge(wrapper).trigger('click')
		document.activeElement?.blur()
		expect(document.activeElement).not.toBe(badge(wrapper).element)

		close(open.mock.calls[0][0])

		expect(document.activeElement).toBe(badge(wrapper).element)
		wrapper.unmount()
	})
})

// The restart and the shutdown of the bar, while an upgrade of the operating system works on the machine: the core refuses, and the bar says why in a sentence
// of its own language files.
describe('the restart and the shutdown while an upgrade works on the machine', () => {
	const refusal = (error_code, data = {}) => ({ response: { status: 409, data: { success: 409, message: 'a sentence of the core <b>in English</b>', data: { error_code, error: 'x', data } } } })

	// the bar after the first click, which asks "Are you sure?"
	function bar(power) {
		const vm = {
			restart: 'Are you sure?',
			shutdown: 'Are you sure?',
			showPower: false,
			$t: key => key,
			$api: { sys: { power } },
			$buefy: { toast: { open: vi.fn() } },
			$messageBus: vi.fn(),
			$refs: { settingsDrop: { toggle: vi.fn() } },
		}
		vm.resetPower = TopBar.methods.resetPower.bind(vm)
		vm.power = TopBar.methods.power.bind(vm)
		return vm
	}

	it.each([
		['Restart', 'restart', 'os_upgrade_open', 'An upgrade of the operating system is changing the machine: it cannot be restarted or switched off until the upgrade stops or asks for it.'],
		['Shutdown', 'off', 'os_upgrade_open', 'An upgrade of the operating system is changing the machine: it cannot be restarted or switched off until the upgrade stops or asks for it.'],
		['Restart', 'restart', 'barrier_failed', 'Something that stands before the restart is not well. Mend it first.'],
	])('says the refusal of %s (%s, %s) in a sentence of the language files, never in the words of the core', async (key, path, code, sentence) => {
		const power = vi.fn(() => Promise.reject(refusal(code)))
		const vm = bar(power)

		vm.power(key)
		await flushPromises()

		expect(power).toHaveBeenCalledWith(path)
		expect(vm.$buefy.toast.open).toHaveBeenCalledWith({ message: sentence, type: 'is-danger' })
		expect(vm.showPower).toBe(false)
		expect(vm.restart).toBe('Restart')
		expect(vm.shutdown).toBe('Shutdown')
	})

	// a toast renders its message as HTML: what the core says never reaches it, whatever the failure
	it('says a sentence of its own for any other failure, and nothing the core wrote', async () => {
		const markup = '<b>in English</b><img src=x onerror=alert(1)>'
		const failures = [
			refusal('not_terminal'),
			{ response: { status: 500, data: { message: markup } } },
			{ response: { status: 502, data: { message: markup, data: markup } } },
			{ message: markup },
			new Error(markup),
			{},
		]
		for (const failure of failures) {
			const vm = bar(vi.fn(() => Promise.reject(failure)))

			vm.power('Restart')
			await flushPromises()

			expect(vm.$buefy.toast.open).toHaveBeenCalledTimes(1)
			expect(vm.$buefy.toast.open).toHaveBeenCalledWith({ message: 'Failed to perform power operation.', type: 'is-danger' })
		}
	})

	it('says it too when the core answers that it did not do it, in words of its own', async () => {
		const vm = bar(vi.fn(() => Promise.resolve({ data: { success: 500, message: '<b>no</b>', data: '' } })))

		vm.power('Shutdown')
		await flushPromises()

		expect(vm.$buefy.toast.open).toHaveBeenCalledWith({ message: 'Failed to perform power operation.', type: 'is-danger' })
		expect(vm.showPower).toBe(false)
	})

	it('has the sentence in English and in French', () => {
		expect(en['Failed to perform power operation.']).toBe('Failed to perform power operation.')
		expect(fr['Failed to perform power operation.']).toBeTruthy()
		expect(fr['Failed to perform power operation.']).not.toBe('Failed to perform power operation.')
	})
})
