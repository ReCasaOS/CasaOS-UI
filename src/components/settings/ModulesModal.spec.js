// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy, { BModal } from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import ModulesModal from './ModulesModal.vue'
import { JOB_NEXT, MODULE_POLL_MS, REASONS, STEP_TEXTS, TEXT, TIERS, reasonMessage } from './osModules'
import { POLL_MS, RESTART_LOOK_AFTER_MS } from './osUpgrade'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent: the real English and French tables, in the plugin's own setup (fallback to English,
// the language's name in lower case).
vi.mock('@/assets/lang', async () => ({
	default: {
		en_us: (await import('@/assets/lang/en_US.json')).default,
		fr_fr: (await import('@/assets/lang/fr_FR.json')).default,
	},
}))

const copy = vi.hoisted(() => vi.fn())
vi.mock('clipboard-copy', () => ({ default: copy }))

// From the project root: import.meta.url is not a file URL under happy-dom.
const source = readFileSync('src/components/settings/ModulesModal.vue', 'utf8')

// ---- what the core answers ----------------------------------------------------------------------------------------------

const NOW = new Date('2026-10-18T12:00:00Z')
const PLAN_ID = `m1-${'ab'.repeat(16)}`
const PLAN_ID_2 = `m1-${'cd'.repeat(16)}`
const URL_OK = 'https://github.com/ReCasaOS/CasaOS-VirtManagement/releases/download/v0.1.0/linux-amd64-casaos-virt-management-v0.1.0.tar.gz'
// the characters that a text must not keep, by their numbers (a mark of that kind is not to be written in a source file)
const BIDI = String.fromCodePoint(0x202E)
const ZERO_WIDTH = String.fromCodePoint(0x200B)
const NUL = String.fromCodePoint(0)
const CHECK_CODES = ['catalogue', 'os', 'arch', 'recasaos', 'already_installed', 'foreign_unit', 'busy', 'disk', 'apt']
// pkg/osmodule/plan.go: the code a plan is refused with
const PLAN_REFUSALS = ['catalogue', 'os', 'arch', 'recasaos', 'already_installed', 'foreign_unit', 'busy', 'disk_short', 'disk_unknown', 'apt_missing', 'apt_failed', 'apt_removes', 'apt_downgrades', 'held_package', 'package_not_exact']

function moduleRaw(changes = {}) {
	return {
		name: 'virt',
		title: 'Virtual machines',
		description: 'Create and run virtual machines with libvirt and QEMU. A virtual machine can be given a USB device: read the notes of the module first.',
		tier: 'community',
		tag: 'v0.1.0',
		catalogue: true,
		installed: null,
		system: { supported: true, reasons: [] },
		...changes,
	}
}
const listRaw = (modules = [moduleRaw()], catalogue = { ok: true }) => ({ catalogue, modules })

const okChecks = () => CHECK_CODES.map(code => ({ code, ok: true, detail: '' }))
function planRaw(changes = {}) {
	return {
		name: 'virt',
		tag: 'v0.1.0',
		tier: 'community',
		checks: okChecks(),
		refused: null,
		packages: { to_install: ['qemu-utils', 'libvirt-daemon-system'], to_upgrade: ['libc6'], download_bytes: 52428800, extra_bytes: 209715200, known: true },
		archive: { url: URL_OK, bytes: 3145728 },
		plan_id: PLAN_ID,
		...changes,
	}
}

const jobRaw = (changes = {}) => ({ name: 'virt', state: 'running', step: 'download', code: '', undo: '', kept_packages: null, started_at: '2026-10-18T11:59:00Z', ended_at: '', log_tail: [], ...changes })
const jobAnswer = (changes = {}, status = { installed: false }) => ({ job: jobRaw(changes), status })
const IDLE = jobAnswer({ state: 'idle', step: '', started_at: '' })

// a refusal of the core: a 409 with its code in data.error_code
const refused = (error_code, data, code = 409) => ({ response: { status: code, data: { success: code, message: 'x', data: { error_code, error: 'a sentence of the core, in English', data } } } })

// ---- the mocked client --------------------------------------------------------------------------------------------------

const calls = Object.fromEntries(['getModules', 'planModule', 'installModule', 'removeModule', 'getModuleStatus'].map(name => [name, vi.fn()]))
let wrapper

const answer = data => Promise.resolve({ data: { success: 200, message: 'ok', data } })
// a call that fails when it is made (a promise that was rejected before anyone waited for it would be an unhandled rejection)
const failure = (error = {}) => () => Promise.reject(Object.assign(new Error('failed'), error))

// a call that is still out, and that the test answers when it chooses
function deferred() {
	const control = {}
	control.promise = new Promise((resolve, reject) => {
		control.resolve = resolve
		control.reject = reject
	})
	return control
}

// the time moves, and every answer that is waiting for it is let in, and the page drawn
async function tick(ms = 0) {
	await vi.advanceTimersByTimeAsync(ms)
	await nextTick()
}
// everything that is waiting on answers that are already there
async function settle() {
	for (let index = 0; index < 6; index++)
		await tick()
}

// what the window tells the rest of the dashboard
const eventBus = { $emit: vi.fn() }

// the core says each of these in turn, and the last one for ever
function serveJob(...answers) {
	let index = 0
	calls.getModuleStatus.mockReset()
	calls.getModuleStatus.mockImplementation(() => answer(answers[Math.min(index++, answers.length - 1)]))
}

async function open(list = listRaw(), options = {}) {
	if (list)
		calls.getModules.mockImplementation(() => answer(list))
	wrapper = mount(ModulesModal, {
		attachTo: document.body,
		global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls }, $EventBus: eventBus } },
		...options,
	})
	await settle()
	return wrapper
}

function close() {
	wrapper?.unmount()
	wrapper = null
}

const text = selector => wrapper.find(selector).text()
const texts = selector => wrapper.findAll(selector).map(item => item.text())
const dialog = () => wrapper.find('.modules-dialog')
const card = (name = 'virt') => wrapper.find(`.modules-card[data-module="${name}"]`)

// a button pressed, and the page drawn
async function press(selector) {
	await wrapper.find(selector).trigger('click')
	await settle()
}

// the plan on the screen, after Install was pressed
async function installDialog(planChanges = {}) {
	calls.planModule.mockImplementation(() => answer(planRaw(planChanges)))
	wrapper.find('.modules-install').element.focus()
	await press('.modules-install')
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	i18n.global.locale = 'en_us'
	for (const fn of [...Object.values(calls), copy])
		fn.mockReset()
	calls.planModule.mockImplementation(() => answer(planRaw()))
	calls.installModule.mockImplementation(() => answer(jobAnswer({ state: 'running', step: '' })))
	calls.removeModule.mockImplementation(() => answer(jobAnswer({ state: 'running', step: '' })))
	serveJob(IDLE)
	delete document.hidden
})

afterEach(() => {
	close()
	document.body.innerHTML = ''
	vi.useRealTimers()
})

// ---- the list ---------------------------------------------------------------------------------------------------------------

describe('the list of modules', () => {
	it('asks the core for the list once, when it opens, and for the job of each module in turn', async () => {
		await open(listRaw([moduleRaw(), moduleRaw({ name: 'other', title: 'Other' })]))

		expect(calls.getModules).toHaveBeenCalledTimes(1)
		expect(calls.getModuleStatus.mock.calls.map(call => call[0])).toEqual(['virt', 'other'])
	})

	it('puts the focus on its heading, to be read', async () => {
		await open()

		expect(text('.modules-title')).toBe('Modules')
		expect(document.activeElement).toBe(wrapper.find('.modules-title').element)
	})

	it('shows a module: its title, its description, its kind with the sentence, the version offered and an Install button', async () => {
		await open()

		expect(text('.modules-card-title')).toBe('Virtual machines')
		expect(text('.modules-card-name')).toBe('virt')
		expect(text('.modules-description')).toContain('Create and run virtual machines')
		expect(text('.modules-description')).toContain('A virtual machine can be given a USB device')
		expect(text('.modules-tier')).toBe('Community')
		expect(text('.modules-tier-sentence')).toBe('Tested only against a simulated machine, not a real one.')
		expect(text('.modules-offered')).toBe('Version offered: v0.1.0')
		expect(wrapper.find('.modules-install').exists()).toBe(true)
		expect(wrapper.find('.modules-install').text()).toBe('Install')
		expect(wrapper.find('.modules-remove').exists()).toBe(false)
		expect(wrapper.find('.modules-job').exists()).toBe(false)
	})

	it('says a module of the core in its words', async () => {
		await open(listRaw([moduleRaw({ tier: 'core' })]))

		expect(text('.modules-tier')).toBe('Maintained by ReCasaOS')
		expect(text('.modules-tier-sentence')).toBe(TIERS.core.sentence)
	})

	it('shows a module that is installed: its version and a Remove button, and no Install', async () => {
		await open(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })]))

		expect(text('.modules-installed')).toBe('Installed version: v0.1.0')
		expect(wrapper.find('.modules-offered').exists()).toBe(false)
		expect(wrapper.find('.modules-install').exists()).toBe(false)
		expect(wrapper.find('.modules-remove').text()).toBe('Remove')
	})

	it('says an installed module whose version is not known', async () => {
		await open(listRaw([moduleRaw({ installed: { version: null } })]))

		expect(text('.modules-installed')).toBe('Installed, version not known')
	})

	it('says why a system cannot have a module, by code in words, and offers no button', async () => {
		await open(listRaw([moduleRaw({ system: { supported: false, reasons: ['os', 'recasaos', 'brand_new'] } })]))

		expect(text('.modules-unsupported')).toContain('This machine cannot have this module.')
		expect(texts('.modules-reason')).toEqual([
			'This operating system is not one that the module supports. os',
			'This release of ReCasaOS is too old for the module. Update ReCasaOS first. recasaos',
			'ReCasaOS gave a reason that this page does not know: brand_new. brand_new',
		])
		expect(wrapper.find('.modules-install').exists()).toBe(false)
		expect(wrapper.find('.modules-remove').exists()).toBe(false)
	})

	it('says a module whose record cannot be read, and offers to remove it', async () => {
		await open(listRaw([moduleRaw({ broken: 'manifest_invalid' })]))

		expect(text('.modules-broken')).toContain('The record of this module cannot be read.')
		expect(wrapper.find('.modules-install').exists()).toBe(false)
		expect(wrapper.find('.modules-remove').exists()).toBe(true)
	})

	it('says a module that the catalogue no longer has, and offers to remove it', async () => {
		await open(listRaw([moduleRaw({ catalogue: false, tier: '', tag: '', installed: { version: 'v0.1.0' }, system: { supported: false, reasons: ['catalogue'] } })]))

		expect(text('.modules-gone')).toBe('This release of ReCasaOS no longer offers this module.')
		expect(wrapper.find('.modules-unsupported').exists()).toBe(false)
		expect(wrapper.find('.modules-remove').exists()).toBe(true)
		expect(wrapper.find('.modules-install').exists()).toBe(false)
	})

	describe('with no catalogue', () => {
		it('says that nothing is offered, and nothing else', async () => {
			await open(listRaw([], { ok: false, error: 'none' }))

			expect(text('.modules-none')).toBe('No module is offered by this release.')
			expect(wrapper.find('.modules-card').exists()).toBe(false)
			expect(wrapper.find('.modules-catalogue-bad').exists()).toBe(false)
			expect(wrapper.find('.modules-install').exists()).toBe(false)
			expect(calls.getModuleStatus).not.toHaveBeenCalled()
		})

		it.each(['unreadable', 'invalid'])('says it, with the code small beside it, when the catalogue is %s', async (error) => {
			await open(listRaw([], { ok: false, error }))

			expect(text('.modules-none')).toBe('No module is offered by this release.')
			expect(text('.modules-catalogue-bad')).toBe(`The list of modules of this release could not be read. ${error}`)
		})

		it('offers nothing to install even when the core lists modules, and keeps the ones that are installed', async () => {
			await open(listRaw([moduleRaw(), moduleRaw({ name: 'old', title: 'Old', catalogue: false, installed: { version: 'v0.1.0' }, system: { supported: false, reasons: ['catalogue'] } })], { ok: false, error: 'invalid' }))

			expect(wrapper.findAll('.modules-card')).toHaveLength(1)
			expect(card('old').exists()).toBe(true)
			expect(wrapper.find('.modules-install').exists()).toBe(false)
			expect(wrapper.find('.modules-remove').exists()).toBe(true)
		})
	})

	describe('when the core does not answer', () => {
		it('says it in a sentence, with a button to try again, and asks again when it is pressed', async () => {
			calls.getModules.mockImplementation(failure({ response: { status: 502 } }))
			await open(null)

			expect(text('.modules-list-error-sentence')).toBe(TEXT.call.readFailed)
			expect(wrapper.find('.modules-list-error').attributes('role')).toBe('alert')
			expect(wrapper.find('.modules-card').exists()).toBe(false)

			calls.getModules.mockImplementation(() => answer(listRaw()))
			await press('.modules-reload')

			expect(calls.getModules).toHaveBeenCalledTimes(2)
			expect(wrapper.find('.modules-list-error').exists()).toBe(false)
			expect(wrapper.find('.modules-card').exists()).toBe(true)
			// and it looks for a job that is already running, which it could not before
			expect(calls.getModuleStatus).toHaveBeenCalledWith('virt', expect.anything())
		})

		it('says a core that has no such route, and a session that ended, in their own words', async () => {
			calls.getModules.mockImplementation(failure({ response: { status: 404 } }))
			await open(null)
			expect(text('.modules-list-error-sentence')).toBe(TEXT.unavailable)
			close()

			calls.getModules.mockImplementation(failure({ response: { status: 401 } }))
			await open(null)
			expect(text('.modules-list-error-sentence')).toBe('Your session has ended. Sign in again, then try again.')
		})

		it('says an answer that is not a list as a failure, and shows no module', async () => {
			await open(['not', 'a', 'list'])

			expect(wrapper.find('.modules-list-error').exists()).toBe(true)
			expect(wrapper.find('.modules-card').exists()).toBe(false)
		})

		it('keeps the list it had when it cannot be read again', async () => {
			await open()
			calls.getModules.mockImplementation(failure({ response: { status: 502 } }))
			wrapper.vm.loadList()
			await settle()

			expect(wrapper.find('.modules-list-error').exists()).toBe(true)
			expect(wrapper.find('.modules-card').exists()).toBe(true)
		})
	})

	describe('everything the core sends is text', () => {
		it('shows HTML in the title, the description, the kind and the reasons as text, and builds no element from it', async () => {
			const html = '<img src=x onerror="alert(1)"><script>alert(2)</script><b>bold</b>'
			await open(listRaw([moduleRaw({ title: html, description: html, tier: html, system: { supported: false, reasons: [html] }, tag: html, broken: html })]))

			expect(wrapper.find('img').exists()).toBe(false)
			expect(wrapper.find('script').exists()).toBe(false)
			expect(wrapper.find('b').exists()).toBe(false)
			expect(text('.modules-card-title')).toBe(html)
			expect(text('.modules-description')).toBe(html)
			expect(wrapper.find('.modules-card').html()).toContain('&lt;img src=x')
		})

		it('cleans the control characters and the marks that turn a text round, and cuts a huge text', async () => {
			await open(listRaw([moduleRaw({ title: `Virtual${BIDI}${ZERO_WIDTH}${NUL} machines`, description: `a${BIDI}b${'x'.repeat(100000)}` })]))

			// each of the three is a space, and the page folds spaces
			expect(text('.modules-card-title')).toBe(`Virtual${' '.repeat(4)}machines`)
			expect(text('.modules-description').length).toBeLessThanOrEqual(400)
			expect(wrapper.find('.modules-card').text()).not.toContain(BIDI)
		})

		it('shows a module named like a method of Object', async () => {
			await open(listRaw([moduleRaw({ name: 'constructor', title: 'Constructor' })]))

			expect(wrapper.find('.modules-card[data-module="constructor"]').exists()).toBe(true)
			expect(calls.getModuleStatus).toHaveBeenCalledWith('constructor', expect.anything())
		})

		it('shows the title in the window that asks, in its heading and in its name, as text', async () => {
			const html = '<img src=x onerror="alert(1)">'
			await open(listRaw([moduleRaw({ title: html })]))
			await press('.modules-install')

			expect(text('.modules-dialog-title')).toBe(`Install ${html}`)
			expect(wrapper.find('.modal').attributes('aria-label')).toBe(`Install ${html}`)
			expect(wrapper.find('.modules-dialog img').exists()).toBe(false)
		})

		it('has no v-html anywhere', () => {
			expect(source).not.toMatch(/v-html|innerHTML|\$buefy\.(?:toast|dialog|snackbar|notification)/)
		})
	})
})

// ---- the plan ---------------------------------------------------------------------------------------------------------------

describe('the plan of an install', () => {
	it('asks for the plan when Install is pressed, in a window with a spinner, and nothing else', async () => {
		const out = deferred()
		calls.planModule.mockReturnValue(out.promise)
		await open()
		wrapper.find('.modules-install').element.focus()
		await press('.modules-install')

		expect(calls.planModule).toHaveBeenCalledTimes(1)
		expect(calls.planModule.mock.calls[0][0]).toBe('virt')
		expect(calls.planModule.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
		expect(calls.installModule).not.toHaveBeenCalled()
		expect(text('.modules-dialog-title')).toBe('Install Virtual machines')
		expect(text('.modules-dialog .modules-dialog-line')).toContain('This can take up to a minute')
		const spinner = wrapper.find('.modules-planning')
		expect(spinner.element.tagName).toBe('PROGRESS')
		expect(spinner.attributes('aria-label')).toBe('Making the plan')
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
		expect(wrapper.find('.modules-dialog-cancel').text()).toBe('Cancel')
		// the window is a dialog, with the focus in it, on its heading and not on a button
		expect(wrapper.find('.modal').attributes('role')).toBe('dialog')
		expect(wrapper.find('.modal').attributes('aria-label')).toBe('Install Virtual machines')
		expect(document.activeElement).toBe(wrapper.find('.modules-dialog-title').element)
		out.resolve({ data: { data: planRaw() } })
	})

	it('shuts the buttons of the page while the plan is made, and a second press does nothing', async () => {
		const out = deferred()
		calls.planModule.mockReturnValue(out.promise)
		await open()
		await press('.modules-install')

		expect(wrapper.find('.modules-install').attributes('disabled')).toBeDefined()
		await wrapper.find('.modules-install').trigger('click')
		wrapper.vm.pressInstall(wrapper.vm.view.modules[0], undefined)
		await settle()

		expect(calls.planModule).toHaveBeenCalledTimes(1)
		out.resolve({ data: { data: planRaw() } })
	})

	it('shows the plan: the packages, the downloads in readable units, the room, the checks, the kind, and what stays', async () => {
		await open()
		await installDialog()

		expect(wrapper.find('.modules-planning').exists()).toBe(false)
		expect(texts('.modules-dialog .modules-names:not(.modules-upgrades) li')).toEqual(['qemu-utils', 'libvirt-daemon-system'])
		expect(texts('.modules-upgrades li')).toEqual(['libc6'])
		expect(text('.modules-size-download')).toBe('Download of the packages: 50 MiB')
		expect(text('.modules-size-archive')).toBe('Download of the module: 3 MiB')
		expect(text('.modules-size-extra')).toBe('Room used on the disk by the packages: 200 MiB')
		expect(text('.modules-archive-url')).toBe(`The module comes from: ${URL_OK}`)
		expect(text('.modules-dialog-tier')).toContain('Community')
		expect(text('.modules-dialog-tier')).toContain('Tested only against a simulated machine, not a real one.')
		expect(text('.modules-stay')).toBe('The packages stay on the machine if you remove the module later.')
		expect(wrapper.findAll('.modules-check')).toHaveLength(9)
		expect(wrapper.findAll('.modules-check').every(check => check.classes().includes('is-passed'))).toBe(true)
		expect(wrapper.find('.modules-dialog-ok').text()).toBe('Install the module')
		expect(wrapper.find('.modules-dialog-cancel').text()).toBe('Cancel')
		expect(calls.installModule).not.toHaveBeenCalled()
	})

	it('keeps the focus on the heading, and not on the button that installs', async () => {
		await open()
		await installDialog()

		expect(document.activeElement).toBe(wrapper.find('.modules-dialog-title').element)
		expect(document.activeElement).not.toBe(wrapper.find('.modules-dialog-ok').element)
	})

	it('says the sizes in French', async () => {
		i18n.global.locale = 'fr_fr'
		await open()
		await installDialog()

		expect(text('.modules-size-download')).toBe('Téléchargement des paquets : 50 Mio')
		expect(text('.modules-dialog-ok')).toBe('Installer le module')
	})

	it('says that apt gave no size, and shows none', async () => {
		await open()
		await installDialog({ packages: { to_install: ['a'], to_upgrade: [], download_bytes: 1, extra_bytes: 1, known: false } })

		expect(wrapper.find('.modules-size-download').exists()).toBe(false)
		expect(text('.modules-size-unknown')).toBe('ReCasaOS could not tell how much apt downloads.')
	})

	it('says that no package is installed, and lists at most 100', async () => {
		await open()
		await installDialog({ packages: { to_install: [], to_upgrade: [], download_bytes: 0, extra_bytes: 0, known: true } })
		expect(text('.modules-no-packages')).toBe('apt installs no package for this module.')
		await press('.modules-dialog-cancel')

		const names = Array.from({ length: 130 }, (_, index) => `pkg-${index}`)
		await installDialog({ packages: { to_install: names, to_upgrade: [], download_bytes: 1, extra_bytes: 1, known: true } })
		expect(wrapper.findAll('.modules-names li')).toHaveLength(101)
		expect(wrapper.findAll('.modules-names li').at(-1).text()).toBe('…and 30 more')
	})

	it('shows the checks that failed first, then the ones that were not made, each with a word, a sentence and its code', async () => {
		await open()
		const checks = okChecks().map((check) => {
			if (check.code === 'disk')
				return { ...check, ok: false, detail: 'room for 200 MiB, 100 MiB free' }
			if (check.code === 'busy')
				return { ...check, ok: false, detail: 'not_checked' }
			return check
		})
		await installDialog({ refused: 'disk_short', plan_id: '', checks })

		const rows = wrapper.findAll('.modules-check')
		expect(rows[0].classes()).toContain('is-failed')
		expect(rows[0].text().replace(/\s+/g, ' ')).toBe('Failed Room on the disk There is not enough room on the disk for the module. room for 200 MiB, 100 MiB free disk')
		expect(rows[1].classes()).toContain('is-notChecked')
		expect(rows[1].text().replace(/\s+/g, ' ')).toBe('Not checked Nothing else at work busy')
		expect(rows[2].classes()).toContain('is-passed')
		expect(rows[2].text()).toContain('Passed')
	})

	describe.each(PLAN_REFUSALS)('a plan that is refused with %s', (code) => {
		it('shows its code and why, and has no button that installs', async () => {
			await open()
			await installDialog({ refused: code, plan_id: '', checks: okChecks().map(check => check.code === code || (code.startsWith('disk') && check.code === 'disk') || (/^(?:apt|held|package)/.test(code) && check.code === 'apt') ? { ...check, ok: false, detail: 'x' } : check) })

			expect(text('.modules-refused-heading')).toBe('This module cannot be installed now.')
			expect(text('.modules-refused')).toContain(code)
			expect(text('.modules-refused')).toContain(REASONS[code])
			expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
			expect(wrapper.find('.modules-names').exists()).toBe(false)
			expect(wrapper.find('.modules-dialog-cancel').text()).toBe('Close')
			expect(calls.installModule).not.toHaveBeenCalled()
		})
	})

	it('has no button that installs for a plan with a check that failed and no refusal, or an id that is not the core\'s', async () => {
		await open()
		await installDialog({ checks: okChecks().map(check => check.code === 'os' ? { ...check, ok: false } : check) })
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
		expect(text('.modules-incomplete')).toBe('The plan could not check everything, so it cannot be confirmed.')
		await press('.modules-dialog-cancel')

		await installDialog({ plan_id: 'm1-not-an-id' })
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
	})

	it('shows a plan of another module, or an answer that is not a plan, as a failure with a button to try again', async () => {
		await open()
		await installDialog({ name: 'other' })

		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
		expect(text('.modules-dialog .modules-call-sentence')).toBe(TEXT.call.readFailed)
		expect(wrapper.find('.modules-dialog-retry').exists()).toBe(true)
	})

	it('shows a plan that cannot be made in a sentence, and makes it again when asked', async () => {
		await open()
		calls.planModule.mockImplementation(failure(refused('plan_timeout', {})))
		await press('.modules-install')

		expect(text('.modules-dialog .modules-call-sentence')).toBe(REASONS.plan_timeout)
		expect(text('.modules-dialog .modules-call-code')).toBe('plan_timeout')
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)

		calls.planModule.mockImplementation(() => answer(planRaw()))
		await press('.modules-dialog-retry')

		expect(calls.planModule).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.modules-call').exists()).toBe(false)
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(true)
	})

	it('shows HTML in the packages, the checks and the address as text', async () => {
		const html = '<img src=x onerror="alert(1)">'
		await open()
		await installDialog({ refused: 'os', plan_id: '', checks: [{ code: 'os', ok: false, detail: html }], packages: { to_install: [html], to_upgrade: [html], download_bytes: 1, extra_bytes: 1, known: true }, archive: { url: html } })

		expect(dialog().find('img').exists()).toBe(false)
		expect(text('.modules-check-detail')).toBe(html)
	})

	it('shows what the os check says of a derivative that passed, as it came', async () => {
		const detail = 'ubuntu:24.04 (linuxmint:22.2, UBUNTU_CODENAME=noble)'
		await open()
		await installDialog({ checks: okChecks().map(check => check.code === 'os' ? { ...check, detail } : check) })

		const row = wrapper.findAll('.modules-check').find(check => check.find('code').text() === 'os')
		expect(row.classes()).toContain('is-passed')
		expect(row.find('.modules-check-detail').text()).toBe(detail)
		expect(texts('.modules-check-detail')).toEqual([detail])
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(true)
	})

	it('gives up the plan when Cancel is pressed: the wait is cancelled, the answer that comes later is for nobody, and the focus is back on Install', async () => {
		const out = deferred()
		calls.planModule.mockReturnValue(out.promise)
		await open()
		wrapper.find('.modules-install').element.focus()
		await press('.modules-install')
		const signal = calls.planModule.mock.calls[0][1]
		expect(signal.aborted).toBe(false)

		await press('.modules-dialog-cancel')

		expect(signal.aborted).toBe(true)
		expect(dialog().exists()).toBe(false)
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeUndefined()
		expect(document.activeElement).toBe(wrapper.find('.modules-install').element)

		out.resolve({ data: { data: planRaw() } })
		await settle()
		expect(dialog().exists()).toBe(false)
		expect(calls.installModule).not.toHaveBeenCalled()
	})

	it('ignores the answer of a plan that was asked for before another', async () => {
		const first = deferred()
		await open()
		calls.planModule.mockReturnValueOnce(first.promise)
		await press('.modules-install')
		calls.planModule.mockImplementation(() => answer(planRaw({ plan_id: PLAN_ID_2 })))
		wrapper.vm.requestPlan(false)
		await settle()
		first.resolve({ data: { data: planRaw({ plan_id: PLAN_ID }) } })
		await settle()
		calls.installModule.mockClear()
		await press('.modules-dialog-ok')

		expect(calls.installModule).toHaveBeenCalledWith('virt', { plan_id: PLAN_ID_2 })
	})

	it('does not leave the wait for an unmounted window', async () => {
		const out = deferred()
		calls.planModule.mockReturnValue(out.promise)
		await open()
		await press('.modules-install')
		const signal = calls.planModule.mock.calls[0][1]
		close()

		expect(signal.aborted).toBe(true)
		out.resolve({ data: { data: planRaw() } })
		await settle()
	})
})

// ---- the install -----------------------------------------------------------------------------------------------------------

describe('the install', () => {
	it('calls the install once, with the id of the plan that is shown and nothing else, and a second press does nothing', async () => {
		await open()
		await installDialog()
		const out = deferred()
		calls.installModule.mockReturnValue(out.promise)

		await wrapper.find('.modules-dialog-ok').trigger('click')
		await wrapper.find('.modules-dialog-ok').trigger('click')
		wrapper.vm.confirmDialog()
		await settle()

		expect(calls.installModule).toHaveBeenCalledTimes(1)
		expect(calls.installModule).toHaveBeenCalledWith('virt', { plan_id: PLAN_ID })
		expect(wrapper.find('.modules-dialog-ok').attributes('disabled')).toBeDefined()
		out.resolve({ data: { data: jobAnswer({ state: 'running', step: '' }) } })
		await settle()
		expect(calls.installModule).toHaveBeenCalledTimes(1)
	})

	it('cannot be cancelled while the call is out: not by the button, by Escape or by a click outside', async () => {
		await open()
		await installDialog()
		calls.installModule.mockReturnValue(deferred().promise)
		await press('.modules-dialog-ok')

		expect(wrapper.find('.modules-dialog-cancel').attributes('disabled')).toBeDefined()
		wrapper.find('.modules-dialog-cancel').element.click()
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await wrapper.find('.modal-background').trigger('click')
		await settle()

		expect(dialog().exists()).toBe(true)
	})

	it('closes the window and follows the job, with the buttons shut, once the core has answered', async () => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'download' }, { installed: false }))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(false)
		expect(calls.getModuleStatus).toHaveBeenLastCalledWith('virt')
		expect(wrapper.find('.modules-job').exists()).toBe(true)
		expect(text('.modules-job-note')).toBe('A job is running. The buttons come back when it ends. Closing this window does not stop it: open the window again to see how it goes.')
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeDefined()
	})

	it('asks for the plan again when the core says that the plan changed, shows the new one with a sentence, and installs the new one', async () => {
		await open()
		await installDialog()
		calls.planModule.mockImplementation(() => answer(planRaw({ plan_id: PLAN_ID_2, packages: { to_install: ['qemu-utils', 'libvirt-daemon-system', 'new-package'], to_upgrade: [], download_bytes: 62914560, extra_bytes: 1, known: true } })))
		calls.installModule.mockImplementationOnce(failure(refused('plan_changed', {})))
		await press('.modules-dialog-ok')

		expect(calls.installModule).toHaveBeenCalledTimes(1)
		expect(calls.installModule).toHaveBeenLastCalledWith('virt', { plan_id: PLAN_ID })
		expect(calls.planModule).toHaveBeenCalledTimes(2)
		expect(dialog().exists()).toBe(true)
		expect(text('.modules-dialog-notice')).toBe(REASONS.plan_changed)
		expect(texts('.modules-dialog .modules-names:not(.modules-upgrades) li')).toContain('new-package')
		expect(text('.modules-size-download')).toBe('Download of the packages: 60 MiB')

		await press('.modules-dialog-ok')

		expect(calls.installModule).toHaveBeenCalledTimes(2)
		// the id that is sent is the one of the plan that is shown now, and never the one that was read first
		expect(calls.installModule).toHaveBeenLastCalledWith('virt', { plan_id: PLAN_ID_2 })
		expect(dialog().exists()).toBe(false)
	})

	it('takes the notice away when the plan is asked for once more', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementationOnce(failure(refused('plan_changed', {})))
		await press('.modules-dialog-ok')
		expect(wrapper.find('.modules-dialog-notice').exists()).toBe(true)

		await wrapper.vm.requestPlan(false)
		await settle()

		expect(wrapper.find('.modules-dialog-notice').exists()).toBe(false)
	})

	it('says a refusal in the window, with the checks that failed, and keeps the window open', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure(refused('os', { checks: [{ code: 'os', ok: false, detail: 'unsupported debian:11' }, { code: 'arch', ok: true, detail: '' }] })))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(true)
		expect(text('.modules-dialog .modules-call-sentence')).toBe(REASONS.os)
		expect(texts('.modules-dialog .modules-call-items li')).toEqual(['This operating system is not one that the module supports. os'])
		expect(wrapper.find('.modules-call').attributes('role')).toBe('alert')
		expect(wrapper.find('.modules-job').exists()).toBe(false)
		// the person can try again
		expect(wrapper.find('.modules-dialog-ok').attributes('disabled')).toBeUndefined()
	})

	it.each([
		['not_root', 409, undefined],
		['unsupported', 409, undefined],
		['start_failed', 500, undefined],
		['bad_request', 400, { field: 'plan_id' }],
		['internal', 500, undefined],
		['brand_new', 409, undefined],
	])('says the refusal %s as its sentence, never the words of the core', async (code, status, data) => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure(refused(code, data, status)))
		await press('.modules-dialog-ok')

		expect(text('.modules-dialog .modules-call-sentence')).not.toContain('a sentence of the core')
		expect(text('.modules-dialog .modules-call-code')).toBe(code)
		expect(wrapper.find('.modules-job').exists()).toBe(false)
	})

	it('says that the machine is busy, with what the core saw as text, and keeps the buttons shut until it is asked again', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure(refused('busy', { reason: 'an upgrade of the operating system is open' })))
		await press('.modules-dialog-ok')

		expect(text('.modules-dialog .modules-call-sentence')).toBe(REASONS.busy)
		expect(text('.modules-dialog .modules-call-detail')).toBe('Reported by ReCasaOS: an upgrade of the operating system is open')
		await press('.modules-dialog-cancel')

		expect(text('.modules-busy-sentence')).toBe(REASONS.busy)
		expect(text('.modules-busy-detail')).toBe('Reported by ReCasaOS: an upgrade of the operating system is open')
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeDefined()
		expect(calls.getModules).toHaveBeenCalledTimes(1)

		await press('.modules-busy-retry')

		expect(wrapper.find('.modules-busy').exists()).toBe(false)
		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeUndefined()
	})

	it('shuts the buttons when the plan itself says that the machine is busy', async () => {
		await open()
		await installDialog({ refused: 'busy', plan_id: '', checks: okChecks().map(check => check.code === 'busy' ? { ...check, ok: false, detail: 'dpkg is locked' } : check) })
		await press('.modules-dialog-cancel')

		expect(wrapper.find('.modules-busy').exists()).toBe(true)
		expect(text('.modules-busy-detail')).toBe('Reported by ReCasaOS: dpkg is locked')
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeDefined()
	})

	describe('a call that got no answer', () => {
		it('looks for the job before it says anything, and follows it if it is there', async () => {
			await open()
			await installDialog()
			calls.installModule.mockImplementation(failure({ code: 'ECONNABORTED' }))
			serveJob(jobAnswer({ state: 'running', step: 'packages' }))
			await press('.modules-dialog-ok')

			expect(dialog().exists()).toBe(false)
			expect(wrapper.find('.modules-job').exists()).toBe(true)
			expect(wrapper.find('.modules-step.is-current').exists()).toBe(true)
			expect(text('.modules-step.is-current .modules-step-text')).toBe('Install the packages that the module needs')
		})

		it('says that it may have gone through, when no job is there', async () => {
			await open()
			await installDialog()
			calls.installModule.mockImplementation(failure({ code: 'ECONNABORTED' }))
			serveJob(IDLE)
			await press('.modules-dialog-ok')

			expect(dialog().exists()).toBe(true)
			expect(text('.modules-dialog .modules-call-sentence')).toBe(TEXT.call.maybe)
			expect(wrapper.find('.modules-job').exists()).toBe(false)
		})
	})
})

// ---- the job ---------------------------------------------------------------------------------------------------------------

describe('the job', () => {
	// an install that is running, the window open on its card
	async function running(step = 'download', extra = {}) {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step, ...extra }))
		await press('.modules-dialog-ok')
	}

	it('lists the steps with the current one marked in words, in an icon and for the reader of a screen', async () => {
		await running('unpack')

		const steps = wrapper.findAll('.modules-step')
		expect(steps.map(step => step.find('.modules-step-text').text())).toEqual([
			STEP_TEXTS.install.packages,
			STEP_TEXTS.install.download,
			STEP_TEXTS.install.verify,
			STEP_TEXTS.install.unpack,
			STEP_TEXTS.install.units,
			STEP_TEXTS.install.manifest,
			STEP_TEXTS.install.start,
			STEP_TEXTS.install.route,
		])
		expect(steps.map(step => step.find('.modules-step-mark').text())).toEqual(['Done', 'Done', 'Done', 'Now', 'Not yet', 'Not yet', 'Not yet', 'Not yet'])
		expect(steps[3].classes()).toContain('is-current')
		expect(steps[3].attributes('aria-current')).toBe('step')
		expect(steps.filter(step => step.attributes('aria-current')).length).toBe(1)
		// an icon beside every word
		expect(steps.every(step => step.find('.icon').exists())).toBe(true)
		expect(steps[0].find('i').classes()).toContain('mdi-check-circle-outline')
		expect(steps[3].find('i').classes()).toContain('mdi-arrow-right-circle-outline')
		expect(steps[4].find('i').classes()).toContain('mdi-circle-outline')
		expect(text('.modules-job-title')).toBe('Installing Virtual machines')
		expect(text('.modules-job-group')).toBe('In progress')
	})

	it('shows a progress bar with a name', async () => {
		await running('unpack')

		const bar = wrapper.find('.modules-progress')
		expect(bar.element.tagName).toBe('PROGRESS')
		expect(bar.attributes('aria-label')).toBe('Progress of the install: step 4 of 8')
		expect(bar.attributes('max')).toBe('8')
		expect(bar.attributes('value')).toBe('3')
	})

	it('shows the log in a box that is read and not typed in, as text, with a button to copy it', async () => {
		await running('download', { log_tail: ['CASAOS_MODULE_STEP - virt download begin 2026-10-18T11:59:30Z', `| <b>not bold</b> ${NUL}x`] })

		const log = wrapper.find('.modules-log-text')
		expect(log.find('pre').exists()).toBe(true)
		expect(log.find('textarea, input').exists()).toBe(false)
		expect(log.find('pre').text()).toBe('CASAOS_MODULE_STEP - virt download begin 2026-10-18T11:59:30Z\n| <b>not bold</b>  x')
		expect(log.find('b').exists()).toBe(false)
		expect(text('.modules-log h6')).toBe('End of the log of the job')

		await log.find('button').trigger('click')
		await settle()
		expect(copy).toHaveBeenCalledWith('CASAOS_MODULE_STEP - virt download begin 2026-10-18T11:59:30Z\n| <b>not bold</b>  x')
	})

	it('says that the job has printed nothing yet', async () => {
		await running('')

		expect(text('.modules-log-empty')).toBe('The job has printed nothing yet.')
	})

	describe('polling', () => {
		it('asks every 2 seconds, one request at a time', async () => {
			await running('download')
			const out = deferred()
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockReturnValue(out.promise)

			await tick(MODULE_POLL_MS.running)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			// a long answer: nothing else is asked, however long the page waits
			await tick(60000)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)

			out.resolve({ data: { data: jobAnswer({ state: 'running', step: 'verify' }) } })
			await settle()
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			calls.getModuleStatus.mockImplementation(() => answer(jobAnswer({ state: 'running', step: 'verify' })))
			await tick(MODULE_POLL_MS.running)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(2)
		})

		it('asks at once after the call, and never twice at the same time', async () => {
			await open()
			await installDialog()
			const out = deferred()
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockReturnValue(out.promise)
			await press('.modules-dialog-ok')

			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			wrapper.vm.poll()
			wrapper.vm.poll()
			await tick(10000)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			out.resolve({ data: { data: jobAnswer({ state: 'running', step: 'packages' }) } })
			await settle()
		})

		it('follows the job from step to step and announces each change once, and none for an answer that says the same', async () => {
			await running('packages')
			const live = () => text('.modules-live')
			expect(live()).toBe('Virtual machines : step 1 of 8, Install the packages that the module needs.'.replace(' :', ':'))

			// the same step again and again: the log grows, the announcement does not move
			serveJob(jobAnswer({ state: 'running', step: 'packages', log_tail: ['a'] }), jobAnswer({ state: 'running', step: 'packages', log_tail: ['a', 'b'] }))
			const lives = []
			for (let index = 0; index < 2; index++) {
				await tick(MODULE_POLL_MS.running)
				lives.push(live())
			}
			expect(new Set(lives).size).toBe(1)
			expect(lives[0]).toContain('step 1 of 8')

			serveJob(jobAnswer({ state: 'running', step: 'download' }))
			await tick(MODULE_POLL_MS.running)
			expect(live()).toContain('step 2 of 8')
			expect(live()).toContain('Download the module')
			expect(wrapper.find('.modules-live').attributes('aria-live')).toBe('polite')
			expect(wrapper.find('.modules-live').attributes('role')).toBe('status')
		})

		it('writes one announcement per change in the live region (a table over the changes of the page)', async () => {
			await running('packages')
			const seen = []
			const watch = () => {
				const now = text('.modules-live')
				if (seen.at(-1) !== now)
					seen.push(now)
			}
			for (const step of ['packages', 'packages', 'download', 'download', 'verify', 'unpack', 'unpack']) {
				serveJob(jobAnswer({ state: 'running', step }))
				await tick(MODULE_POLL_MS.running)
				watch()
			}
			expect(seen).toHaveLength(4)
		})

		it('stops when the job is over, and reads the list again', async () => {
			await running('route')
			expect(calls.getModules).toHaveBeenCalledTimes(1)
			serveJob(jobAnswer({ state: 'succeeded', step: 'done', ended_at: '2026-10-18T12:01:00Z' }, { installed: true }))
			calls.getModules.mockImplementation(() => answer(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])))
			await tick(MODULE_POLL_MS.running)

			expect(calls.getModules).toHaveBeenCalledTimes(2)
			const asked = calls.getModuleStatus.mock.calls.length
			await tick(60000)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(asked)
			expect(vi.getTimerCount()).toBe(0)
		})

		it('tells the dashboard when a job is over, once, so that its card comes or goes without a reload', async () => {
			const emit = eventBus.$emit
			emit.mockClear()
			await running('route')
			expect(emit).not.toHaveBeenCalled()
			serveJob(jobAnswer({ state: 'succeeded', step: 'done' }, { installed: true }))
			calls.getModules.mockImplementation(() => answer(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])))
			await tick(MODULE_POLL_MS.running)
			await tick(60000)

			expect(emit.mock.calls).toEqual([['modulesChanged']])
		})

		it('says when the job is done: the steps are done, the card appears where the service answers, and the buttons come back', async () => {
			await running('route')
			serveJob(jobAnswer({ state: 'succeeded', step: 'done' }, { installed: true }))
			calls.getModules.mockImplementation(() => answer(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])))
			await tick(MODULE_POLL_MS.running)

			expect(text('.modules-job-title')).toBe('The install of Virtual machines is done.')
			expect(text('.modules-job-group')).toBe('Finished')
			expect(text('.modules-next')).toBe('The card of the module appears on the dashboard once its service answers.')
			expect(wrapper.findAll('.modules-step.is-done')).toHaveLength(8)
			expect(wrapper.find('.modules-progress').exists()).toBe(false)
			expect(text('.modules-live')).toBe('The install of Virtual machines is done.')
			expect(text('.modules-installed')).toBe('Installed version: v0.1.0')
			expect(wrapper.find('.modules-remove').attributes('disabled')).toBeUndefined()
			expect(wrapper.find('.modules-job-note').exists()).toBe(false)
		})

		it('survives an answer that fails, tries again 10 seconds later, and says nothing about it for as long as that is short', async () => {
			await running('download')
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(failure({ response: { status: 502 } }))
			await tick(MODULE_POLL_MS.running)

			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			await tick(POLL_MS.error - 1)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			await tick(1)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(2)
			// what was last read is still there
			expect(wrapper.find('.modules-step.is-current').exists()).toBe(true)

			calls.getModuleStatus.mockImplementation(() => answer(jobAnswer({ state: 'running', step: 'verify' })))
			await tick(POLL_MS.error)
			expect(wrapper.find('.modules-outage').exists()).toBe(false)
			expect(text('.modules-step.is-current .modules-step-text')).toBe('Check the download')
		})

		it('says that the machine is restarting, with the time, goes on by itself, and sends the person to the machine after 15 minutes', async () => {
			await running('start')
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(failure({ code: 'ERR_NETWORK', request: {} }))
			await tick(MODULE_POLL_MS.running)
			await tick(POLL_MS.error * 3)

			expect(text('.modules-outage-message')).toBe('ReCasaOS does not answer. It may be restarting. This page tries again by itself.')
			expect(text('.modules-outage-elapsed')).toMatch(/^No answer for \d+ s\.$/)
			expect(text('.modules-live')).toBe('ReCasaOS does not answer. It may be restarting. This page tries again by itself.')

			await tick(RESTART_LOOK_AFTER_MS)
			expect(text('.modules-outage-message')).toContain('ReCasaOS has not answered for')
			expect(text('.modules-outage-message')).toContain('Look at the machine')
			expect(text('.modules-outage-message')).not.toContain('waiting for you')
			expect(wrapper.find('.modules-outage').html()).toContain('is-danger')

			// and it goes on by itself when the core is back
			calls.getModuleStatus.mockImplementation(() => answer(jobAnswer({ state: 'running', step: 'route' })))
			await tick(POLL_MS.error)
			expect(wrapper.find('.modules-outage').exists()).toBe(false)
			expect(text('.modules-step.is-current .modules-step-text')).toBe(STEP_TEXTS.install.route)
		})

		it('says a session that ended in the words of a job', async () => {
			await running('start')
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(failure({ response: { status: 401 } }))
			await tick(MODULE_POLL_MS.running)

			expect(text('.modules-outage-message')).toBe('Your session has ended. Sign in again to see the job.')
		})

		it('says an answer that is not a job as a failure, and an answer for another module as one too', async () => {
			await running('start')
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(() => answer({ job: { name: 'other', state: 'succeeded', step: 'done' }, status: {} }))
			await tick(MODULE_POLL_MS.running)

			expect(wrapper.find('.modules-outage').exists()).toBe(true)
			expect(wrapper.find('.modules-step.is-current').exists()).toBe(true)
			expect(text('.modules-job-group')).toBe('In progress')
		})

		it('does not ask while the document is hidden, and asks at once when it is shown again', async () => {
			await running('download')
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(() => answer(jobAnswer({ state: 'running', step: 'verify' })))
			Object.defineProperty(document, 'hidden', { value: true, configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
			await tick(60000)
			expect(calls.getModuleStatus).not.toHaveBeenCalled()
			expect(vi.getTimerCount()).toBe(0)

			delete document.hidden
			document.dispatchEvent(new Event('visibilitychange'))
			await tick(0)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
		})

		it('does not schedule the next ask when the document was hidden while one was out', async () => {
			await running('download')
			const out = deferred()
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockReturnValue(out.promise)
			await tick(MODULE_POLL_MS.running)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)

			Object.defineProperty(document, 'hidden', { value: true, configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
			out.resolve({ data: { data: jobAnswer({ state: 'running', step: 'verify' }) } })
			await tick(60000)

			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			expect(vi.getTimerCount()).toBe(0)
		})

		it('does not take the answer about a job for the job that is followed now', async () => {
			await open(listRaw([moduleRaw(), moduleRaw({ name: 'other', title: 'Other' })]))
			const out = deferred()
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockReturnValue(out.promise)
			wrapper.vm.startFollowing('virt', 'install', null)
			await tick(0)
			expect(calls.getModuleStatus).toHaveBeenCalledWith('virt')

			// another job is followed while the answer is out, and the answer that comes is not about it
			wrapper.vm.startFollowing('other', 'install', null)
			out.resolve({ data: { data: jobAnswer({ state: 'succeeded', step: 'done' }) } })
			await settle()

			expect(wrapper.vm.follow).toBe('other')
		})

		it('clears its timer and asks no more when the window closes, and ignores an answer that comes after', async () => {
			await running('download')
			const out = deferred()
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockReturnValue(out.promise)
			await tick(MODULE_POLL_MS.running)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)

			close()
			expect(vi.getTimerCount()).toBe(0)
			out.resolve({ data: { data: jobAnswer({ state: 'succeeded', step: 'done' }) } })
			await tick(120000)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			expect(calls.getModules).toHaveBeenCalledTimes(1)
			expect(vi.getTimerCount()).toBe(0)
		})

		it('leaves no timer when the window closes between two asks', async () => {
			await running('download')
			expect(vi.getTimerCount()).toBeGreaterThan(0)
			close()
			expect(vi.getTimerCount()).toBe(0)
		})
	})

	describe('when it did not go well', () => {
		async function stopped(changes, list = listRaw()) {
			await running('verify')
			serveJob(jobAnswer({ state: 'failed', step: 'verify', ended_at: '2026-10-18T12:01:00Z', ...changes }))
			calls.getModules.mockImplementation(() => answer(list))
			await tick(MODULE_POLL_MS.running)
		}

		it('says the step that failed and why, by the code, and that the install was undone', async () => {
			await stopped({ code: 'checksum_mismatch', undo: 'rolled_back', kept_packages: [] })

			expect(text('.modules-job-title')).toBe('The install of Virtual machines stopped.')
			expect(text('.modules-job-group')).toBe('Stopped')
			expect(text('.modules-stopped-at')).toBe('It stopped at: Check the download')
			expect(text('.modules-reason-sentence')).toBe(`${REASONS.checksum_mismatch} checksum_mismatch`)
			expect(text('.modules-undo')).toBe(JOB_NEXT.undone)
			expect(texts('.modules-step .modules-step-mark')).toEqual(['Done', 'Done', 'Failed here', 'Not reached', 'Not reached', 'Not reached', 'Not reached', 'Not reached'])
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
			expect(text('.modules-kept-none')).toBe('The install left no package on the machine.')
			// the buttons are back
			expect(wrapper.find('.modules-install').attributes('disabled')).toBeUndefined()
		})

		it.each([
			['start_failed', 'start', 'The service of the module would not start.'],
			['start_failed', '', 'ReCasaOS could not start the job. Nothing was changed.'],
			['route_timeout', 'route', REASONS.route_timeout],
			['brand_new', 'unpack', 'ReCasaOS gave a reason that this page does not know: brand_new.'],
		])('says the code %s of the step %j in its sentence', async (code, step, sentence) => {
			await stopped({ code, step, undo: 'rolled_back' })

			expect(text('.modules-reason-sentence')).toContain(sentence)
		})

		it('lists the packages that were kept and gives the command to purge them by hand, as text to copy and never to run', async () => {
			await stopped({ code: 'start_failed', step: 'start', undo: 'rolled_back', kept_packages: ['qemu-utils', 'libvirt-daemon-system'] })

			expect(text('.modules-kept-some')).toBe('These are the packages the module needs: qemu-utils, libvirt-daemon-system. Some may have been on the machine before the install.')
			expect(text('.modules-kept-purge')).toContain('ReCasaOS never runs it.')
			expect(text('.modules-kept-command code')).toBe('apt-get purge qemu-utils libvirt-daemon-system')
			await wrapper.find('.modules-kept-command button').trigger('click')
			await settle()
			expect(copy).toHaveBeenCalledWith('apt-get purge qemu-utils libvirt-daemon-system')
			// nothing was called to run it
			expect(calls.removeModule).not.toHaveBeenCalled()
			expect(calls.installModule).toHaveBeenCalledTimes(1)
		})

		it('gives no command for names that are not package names, and says so', async () => {
			await stopped({ code: 'packages_failed', step: 'packages', undo: 'rolled_back', kept_packages: ['ok', 'x; reboot'] })

			expect(wrapper.find('.modules-kept-command').exists()).toBe(false)
			expect(text('.modules-kept-unsafe')).toContain('no command is given')
		})

		it('says that the packages that were kept are not known', async () => {
			await stopped({ code: 'packages_failed', step: 'packages', undo: 'rolled_back', kept_packages: null })

			expect(text('.modules-kept-unknown')).toContain('could not be told')
			expect(wrapper.find('.modules-kept-command').exists()).toBe(false)
		})

		it('gives the console when the undo did not finish, as text to copy', async () => {
			await stopped({ code: 'internal_error', step: 'unpack', undo: 'rollback_incomplete', kept_packages: [] })

			expect(text('.modules-undo')).toContain('Undoing the install did not finish')
			expect(text('.modules-advice-sentence')).toBe('Run this command as root at a console of the machine. It finishes the cleaning. Then try again.')
			expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
			await wrapper.find('.modules-advice-command button').trigger('click')
			await settle()
			expect(copy).toHaveBeenCalledWith('casaos module remove virt')
		})

		it('says a job that was cut short, that nothing was undone, and gives the console', async () => {
			await running('unpack')
			serveJob(jobAnswer({ state: 'interrupted', step: 'unpack' }))
			await tick(MODULE_POLL_MS.running)

			expect(text('.modules-job-title')).toBe('The job on Virtual machines was cut short.')
			expect(text('.modules-job-group')).toBe('Cut short')
			expect(text('.modules-undo')).toBe(JOB_NEXT.cutInstall)
			expect(texts('.modules-step .modules-step-mark')[3]).toBe('Cut short here')
			expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
			expect(wrapper.find('.modules-install').attributes('disabled')).toBeUndefined()
		})

		it('says a job that was refused: nothing changed, and why', async () => {
			await running('')
			serveJob(jobAnswer({ state: 'refused', step: '', code: 'already_installed' }))
			await tick(MODULE_POLL_MS.running)

			expect(text('.modules-job-title')).toBe('The job on Virtual machines was refused. Nothing was changed.')
			expect(text('.modules-reason-sentence')).toBe(`${REASONS.already_installed} already_installed`)
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
		})

		it('says a state that it does not know as one, with the state as text, and stops asking', async () => {
			await running('download')
			serveJob(jobAnswer({ state: 'brand_new', step: 'download' }))
			await tick(MODULE_POLL_MS.running)

			expect(text('.modules-job-title')).toBe('This page does not know the state of this job.')
			expect(text('.modules-job-unknown')).toBe('brand_new')
			expect(text('.modules-job-group')).toBe('Unknown state')
			const asked = calls.getModuleStatus.mock.calls.length
			await tick(60000)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(asked)
		})

		it('shows HTML in the log and in the reason as text', async () => {
			const html = '<img src=x onerror="alert(1)">'
			await stopped({ code: html, undo: 'rolled_back', kept_packages: [html], log_tail: [html] })

			expect(wrapper.find('.modules-job img').exists()).toBe(false)
			expect(text('.modules-log-text pre')).toBe(html)
			expect(text('.modules-reason-sentence')).toContain(html)
		})
	})

	describe('a job that was started before the window was opened', () => {
		it('follows a job that runs, and shuts the buttons', async () => {
			serveJob(jobAnswer({ state: 'running', step: 'files' }, { installed: true }))
			await open(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })]))

			expect(text('.modules-job-title')).toBe('Removing Virtual machines')
			expect(wrapper.findAll('.modules-step').map(step => step.find('.modules-step-text').text())).toEqual([STEP_TEXTS.remove.stop, STEP_TEXTS.remove.files, STEP_TEXTS.remove.manifest, STEP_TEXTS.remove.reload])
			expect(wrapper.find('.modules-remove').attributes('disabled')).toBeDefined()
			// the job is asked for again, and the step that both an install and a remove have is a step of the remove that this page knows it is
			serveJob(jobAnswer({ state: 'running', step: 'manifest' }, { installed: true }))
			await tick(MODULE_POLL_MS.running)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
			expect(text('.modules-step.is-current .modules-step-text')).toBe(STEP_TEXTS.remove.manifest)
		})

		it('looks for the job of the modules four at a time, and follows the one that runs', async () => {
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(name => answer(name === 'b' ? jobAnswer({ name: 'b', state: 'running', step: 'packages' }) : { job: jobRaw({ name, state: 'idle', step: '' }), status: {} }))
			await open(listRaw([moduleRaw({ name: 'a', title: 'A' }), moduleRaw({ name: 'b', title: 'B' }), moduleRaw({ name: 'c', title: 'C' })]))

			expect(calls.getModuleStatus.mock.calls.slice(0, 3).map(call => call[0])).toEqual(['a', 'b', 'c'])
			expect(card('b').find('.modules-job').exists()).toBe(true)
			expect(card('a').find('.modules-job').exists()).toBe(false)
			expect(card('c').find('.modules-job').exists()).toBe(false)
			expect(wrapper.vm.follow).toBe('b')
		})

		it('tells a job that failed, and one that was cut short, but not one that ended well or that was refused', async () => {
			calls.getModuleStatus.mockReset()
			const states = { a: jobAnswer({ name: 'a', state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back' }), b: jobAnswer({ name: 'b', state: 'interrupted', step: 'unpack' }), c: jobAnswer({ name: 'c', state: 'succeeded', step: 'done' }), d: jobAnswer({ name: 'd', state: 'refused', code: 'busy' }) }
			calls.getModuleStatus.mockImplementation(name => answer(states[name]))
			await open(listRaw(['a', 'b', 'c', 'd'].map(name => moduleRaw({ name, title: name.toUpperCase() }))))

			expect(card('a').find('.modules-job').exists()).toBe(true)
			expect(card('b').find('.modules-job').exists()).toBe(true)
			expect(card('c').find('.modules-job').exists()).toBe(false)
			expect(card('d').find('.modules-job').exists()).toBe(false)
			// none runs: nothing is asked again
			expect(wrapper.find('.modules-job-note').exists()).toBe(false)
			expect(wrapper.find('.modules-install').attributes('disabled')).toBeUndefined()
			const asked = calls.getModuleStatus.mock.calls.length
			await tick(60000)
			expect(calls.getModuleStatus).toHaveBeenCalledTimes(asked)
		})

		it('tells the console to finish a job that was cut short before the window was opened, after the files began to be written', async () => {
			serveJob(jobAnswer({ state: 'interrupted', step: 'unpack' }))
			await open()

			expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
		})

		it('says that nothing of the module is on the machine for a job cut short before the files, and gives no command', async () => {
			serveJob(jobAnswer({ state: 'interrupted', step: 'download' }))
			await open()

			expect(text('.modules-undo')).toBe(JOB_NEXT.cutEarly)
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
		})

		it('does not ask about a job that cannot be read, and goes on to the next module', async () => {
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(name => name === 'a' ? Promise.reject(new Error('x')) : answer(jobAnswer({ name, state: 'running', step: 'packages' })))
			await open(listRaw([moduleRaw({ name: 'a', title: 'A' }), moduleRaw({ name: 'b', title: 'B' })]))

			expect(card('b').find('.modules-job').exists()).toBe(true)
			expect(wrapper.find('.modules-outage').exists()).toBe(false)
		})

		it('asks about at most 16 modules', async () => {
			await open(listRaw(Array.from({ length: 40 }, (_, index) => moduleRaw({ name: `m${index}`, title: `M${index}` }))))

			expect(calls.getModuleStatus).toHaveBeenCalledTimes(16)
		})
	})
})

// ---- the remove ------------------------------------------------------------------------------------------------------------

describe('the remove', () => {
	const installed = () => listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])

	it('asks first, and says what stays: the packages, the data, and what the module says about itself', async () => {
		await open(installed())
		wrapper.find('.modules-remove').element.focus()
		await press('.modules-remove')

		expect(text('.modules-dialog-title')).toBe('Remove Virtual machines?')
		expect(texts('.modules-dialog .modules-dialog-line')).toEqual([
			'The module stops, and the files it put on the machine are deleted.',
			'The packages it installed and the data of the module are not removed.',
		])
		expect(text('.modules-dialog-about')).toContain('A virtual machine can be given a USB device')
		expect(wrapper.find('.modules-dialog-ok').classes()).toContain('is-danger')
		expect(document.activeElement).toBe(wrapper.find('.modules-dialog-title').element)
		expect(document.activeElement).not.toBe(wrapper.find('.modules-dialog-ok').element)
		expect(calls.removeModule).not.toHaveBeenCalled()

		await press('.modules-dialog-cancel')
		expect(dialog().exists()).toBe(false)
		expect(calls.removeModule).not.toHaveBeenCalled()
		expect(document.activeElement).toBe(wrapper.find('.modules-remove').element)
	})

	it('removes once when confirmed, with the name and nothing else, and follows the job', async () => {
		await open(installed())
		await press('.modules-remove')
		serveJob(jobAnswer({ state: 'running', step: 'stop' }, { installed: true }))
		const out = deferred()
		calls.removeModule.mockReturnValue(out.promise)
		await wrapper.find('.modules-dialog-ok').trigger('click')
		await wrapper.find('.modules-dialog-ok').trigger('click')
		await settle()

		expect(calls.removeModule).toHaveBeenCalledTimes(1)
		expect(calls.removeModule).toHaveBeenCalledWith('virt')
		out.resolve({ data: { data: jobAnswer({ state: 'running', step: '' }, { installed: true }) } })
		await settle()

		expect(dialog().exists()).toBe(false)
		expect(text('.modules-job-title')).toBe('Removing Virtual machines')
		expect(wrapper.findAll('.modules-step')).toHaveLength(4)
		expect(text('.modules-step.is-current .modules-step-text')).toBe(STEP_TEXTS.remove.stop)
		expect(wrapper.find('.modules-remove').attributes('disabled')).toBeDefined()
	})

	it('remembers what it asked for when the answer of the call cannot be read, to tell a step that both an install and a remove have', async () => {
		await open(installed())
		await press('.modules-remove')
		calls.removeModule.mockImplementation(() => answer({}))
		serveJob(jobAnswer({ state: 'running', step: 'manifest' }, { installed: true }))
		await press('.modules-dialog-ok')

		expect(wrapper.findAll('.modules-step')).toHaveLength(4)
		expect(text('.modules-step.is-current .modules-step-text')).toBe(STEP_TEXTS.remove.manifest)
	})

	it('says that the module is removed when the job is done, and that the packages and the data stay', async () => {
		await open(installed())
		await press('.modules-remove')
		serveJob(jobAnswer({ state: 'succeeded', step: 'done' }, { installed: false }))
		calls.getModules.mockImplementation(() => answer(listRaw()))
		await press('.modules-dialog-ok')
		await tick(MODULE_POLL_MS.running)

		expect(text('.modules-job-title')).toBe('The removal of Virtual machines is done.')
		expect(text('.modules-next')).toBe('The packages that the module installed and its data are still on the machine.')
		expect(wrapper.find('.modules-install').exists()).toBe(true)
	})

	it('says a remove that stopped, and gives the console', async () => {
		await open(installed())
		await press('.modules-remove')
		serveJob(jobAnswer({ state: 'failed', step: 'files', code: 'remove_incomplete' }, { installed: true }))
		await press('.modules-dialog-ok')
		await tick(MODULE_POLL_MS.running)

		expect(text('.modules-job-title')).toBe('The removal of Virtual machines stopped.')
		expect(text('.modules-reason-sentence')).toContain(REASONS.remove_incomplete.text)
		expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
		expect(wrapper.find('.modules-kept').exists()).toBe(false)
	})

	it('says the refusal in the window and keeps it open', async () => {
		await open(installed())
		await press('.modules-remove')
		calls.removeModule.mockImplementation(failure(refused('not_installed', {})))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(true)
		expect(text('.modules-dialog .modules-call-sentence')).toBe(REASONS.not_installed)
	})

	it('says that the machine is busy', async () => {
		await open(installed())
		await press('.modules-remove')
		calls.removeModule.mockImplementation(failure(refused('busy', { reason: 'a package manager holds the lock' })))
		await press('.modules-dialog-ok')
		await press('.modules-dialog-cancel')

		expect(text('.modules-busy-detail')).toBe('Reported by ReCasaOS: a package manager holds the lock')
		expect(wrapper.find('.modules-remove').attributes('disabled')).toBeDefined()
	})

	it('shows the description as text', async () => {
		const html = '<img src=x onerror="alert(1)">'
		await open(listRaw([moduleRaw({ installed: { version: 'v0.1.0' }, description: html })]))
		await press('.modules-remove')

		expect(dialog().find('img').exists()).toBe(false)
		expect(text('.modules-dialog-about')).toBe(html)
	})
})

// ---- the windows -----------------------------------------------------------------------------------------------------------

describe('the confirmation windows', () => {
	const Outer = {
		data: () => ({ open: true }),
		render() {
			const props = { 'modelValue': this.open, 'hasModalCard': true, 'canCancel': ['escape'], 'onUpdate:modelValue': (value) => {
				this.open = value
			} }
			return h(BModal, props, {
				default: () => h('div', { class: 'modal-card outer-card' }, [h(ModulesModal)]),
			})
		},
	}

	it('close at Escape, the window that is on top and not the one it stands on, and then the one below at the next', async () => {
		calls.getModules.mockImplementation(() => answer(listRaw()))
		wrapper = mount(Outer, { attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await settle()
		calls.planModule.mockImplementation(() => answer(planRaw()))
		await press('.modules-install')
		expect(dialog().exists()).toBe(true)

		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await settle()
		expect(dialog().exists()).toBe(false)
		expect(wrapper.vm.open).toBe(true)
		expect(wrapper.find('.outer-card').exists()).toBe(true)

		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await settle()
		expect(wrapper.vm.open).toBe(false)
	})

	it('close at Escape while the plan is made, and give the plan up', async () => {
		await open()
		const out = deferred()
		calls.planModule.mockReturnValue(out.promise)
		await press('.modules-install')
		const signal = calls.planModule.mock.calls[0][1]

		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await settle()

		expect(dialog().exists()).toBe(false)
		expect(signal.aborted).toBe(true)
	})

	it('close at a click outside, and hand the focus back to the button that opened them', async () => {
		await open()
		wrapper.find('.modules-install').element.focus()
		await press('.modules-install')
		await wrapper.find('.modal-background').trigger('click')
		await settle()

		expect(dialog().exists()).toBe(false)
		expect(document.activeElement).toBe(wrapper.find('.modules-install').element)
	})

	it('hand the focus to the heading when the button that opened them is shut', async () => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'packages' }))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(false)
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeDefined()
		expect(document.activeElement).toBe(wrapper.find('.modules-title').element)
	})

	it('take the listener of Escape away when they close, and when the window closes', async () => {
		const add = vi.spyOn(window, 'addEventListener')
		const remove = vi.spyOn(window, 'removeEventListener')
		await open()
		await press('.modules-install')
		expect(add).toHaveBeenCalledWith('keyup', expect.any(Function), true)
		await press('.modules-dialog-cancel')
		expect(remove).toHaveBeenCalledWith('keyup', expect.any(Function), true)
		add.mockRestore()
		remove.mockRestore()
	})

	it('leave a key that is not Escape alone', async () => {
		await open()
		await press('.modules-install')
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
		await settle()

		expect(dialog().exists()).toBe(true)
	})
})

// ---- what the core says of a job, and what the page makes of it -------------------------------------------------------------

describe('the state of a job that is not the core\'s', () => {
	it('is never a class of the card, and is shown as cleaned and cut text', async () => {
		const hostile = `x" onmouseover="alert(1) ${BIDI}${NUL}<b>y</b>${'z'.repeat(100)}`
		serveJob(jobAnswer({ state: hostile, step: 'download' }))
		await open()

		const job = wrapper.find('.modules-job')
		expect(job.classes()).toContain('is-unknown')
		expect(job.classes().join(' ')).not.toMatch(/onmouseover|alert|zzz|x"/)
		expect(job.attributes('onmouseover')).toBeUndefined()
		expect(job.find('b').exists()).toBe(false)
		expect(text('.modules-job-unknown').length).toBeLessThanOrEqual(40)
		expect(text('.modules-job-unknown')).not.toContain(BIDI)
		expect(text('.modules-job-unknown')).not.toContain(NUL)
		expect(text('.modules-job-title')).toBe(TEXT.job.unknownState)
	})

	it('keeps the class of a state that is the core\'s', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back' }))
		await open()

		expect(wrapper.find('.modules-job').classes()).toContain('is-failed')
	})
})

describe('what a job that stopped says, by what the core says it was', () => {
	const installed = () => listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])

	it('says a remove that failed at the step manifest, seen from a window opened later, as neither an install nor as nothing to undo, and gives the console', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'manifest', code: 'manifest_write_failed', undo: '' }, { installed: true }))
		await open(installed())

		expect(text('.modules-job-title')).toBe('The job on Virtual machines stopped.')
		expect(wrapper.find('.modules-undo').exists()).toBe(false)
		expect(wrapper.find('.modules-kept').exists()).toBe(false)
		expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
		expect(text('.modules-job')).not.toMatch(/nothing to undo|Nothing had been changed|install|packages/i)
	})

	it('says it a removal when the core says so, with the steps of a removal', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'manifest', code: 'manifest_write_failed', undo: '', kind: 'remove' }, { installed: true }))
		await open(installed())

		expect(text('.modules-job-title')).toBe('The removal of Virtual machines stopped.')
		expect(wrapper.findAll('.modules-step')).toHaveLength(4)
		expect(wrapper.find('.modules-undo').exists()).toBe(false)
		expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
	})

	it('says an install that failed when the core says so, whatever the step', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'manifest', code: 'manifest_write_failed', undo: 'rolled_back', kind: 'install', kept_packages: [] }))
		await open()

		expect(text('.modules-job-title')).toBe('The install of Virtual machines stopped.')
		expect(text('.modules-undo')).toBe(JOB_NEXT.undone)
		expect(wrapper.findAll('.modules-step')).toHaveLength(8)
	})

	it('does not say that what the install had done was undone: the files and the service were removed, the packages were not', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'packages', code: 'packages_failed', undo: 'rolled_back', kept_packages: ['qemu-utils'] }))
		await open()

		expect(text('.modules-undo')).toBe('The files and the service of the module were removed; the packages were not.')
		expect(text('.modules-job')).not.toContain('had done was undone')
	})

	it('says that a job that was stopped before it began changed nothing, and gives no console', async () => {
		serveJob(jobAnswer({ state: 'interrupted', step: '' }))
		await open()

		expect(text('.modules-undo')).toBe('The job was stopped before it began. Nothing was changed.')
		expect(wrapper.find('.modules-advice').exists()).toBe(false)
		expect(wrapper.find('.modules-stopped-at').exists()).toBe(false)
	})

	it('says an install whose undo was cut short as that, and not as nothing undone, and gives the console', async () => {
		serveJob(jobAnswer({ state: 'interrupted', step: 'rollback_files' }))
		await open()

		expect(text('.modules-undo')).toBe('The install failed and the undo was cut short: some files of the module may still be on the machine.')
		expect(text('.modules-job')).not.toContain('Nothing was undone')
		expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
		// the list of the steps of the undo stays
		expect(texts('.modules-step .modules-step-text')).toEqual([STEP_TEXTS.remove.stop, STEP_TEXTS.remove.files, STEP_TEXTS.remove.manifest, STEP_TEXTS.remove.reload])
		expect(texts('.modules-step .modules-step-mark')[1]).toBe('Cut short here')
	})

	it('says the heading of an install that is being undone as that, and keeps the list of the steps and a progress bar with a name', async () => {
		serveJob(jobAnswer({ state: 'running', step: 'rollback_files', kind: 'install' }))
		await open()

		expect(text('.modules-job-title')).toBe('Undoing the install of Virtual machines')
		expect(text('.modules-job-title')).not.toMatch(/^Installing/)
		expect(text('.modules-rollback')).toBe(`Undoing the install: ${STEP_TEXTS.remove.files}`)
		expect(texts('.modules-step .modules-step-text')).toEqual([STEP_TEXTS.remove.stop, STEP_TEXTS.remove.files, STEP_TEXTS.remove.manifest, STEP_TEXTS.remove.reload])
		expect(texts('.modules-step .modules-step-mark')).toEqual(['Done', 'Now', 'Not yet', 'Not yet'])
		expect(wrapper.find('.modules-progress').attributes('aria-label')).toBe('Progress of the undo: step 2 of 4')
		expect(text('.modules-live')).toBe('Virtual machines: undoing the install, Delete the files of the module.')
	})

	it('says the end of an install and of a removal by what was done', async () => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'route', kind: 'install' }))
		await press('.modules-dialog-ok')
		serveJob(jobAnswer({ state: 'succeeded', step: 'done', kind: 'install' }, { installed: true }))
		calls.getModules.mockImplementation(() => answer(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])))
		await tick(MODULE_POLL_MS.running)

		expect(text('.modules-job-title')).toBe('The install of Virtual machines is done.')
		expect(text('.modules-live')).toBe('The install of Virtual machines is done.')
	})
})

describe('the packages that the module needs, and the command to purge them', () => {
	it('says one package in the singular', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'start', code: 'start_failed', undo: 'rolled_back', kept_packages: ['ovmf'] }))
		await open()

		expect(text('.modules-kept-some')).toBe('This is the package the module needs: ovmf. It may have been on the machine before the install.')
		expect(text('.modules-kept-purge')).toMatch(/^To purge it/)
		expect(text('.modules-kept-command code')).toBe('apt-get purge ovmf')
	})

	it('says that some of them may have been on the machine before, and that a purge deletes their configuration files', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'start', code: 'start_failed', undo: 'rolled_back', kept_packages: ['ovmf', 'qemu-utils'] }))
		await open()

		expect(text('.modules-kept-some')).toContain('Some may have been on the machine before the install.')
		expect(text('.modules-kept-purge')).toContain('configuration files')
		expect(text('.modules-kept-purge')).toContain('read what apt says before you agree')
	})

	it('gives the command after a remove that succeeded too, when the core gives the list, as text to copy', async () => {
		await open(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })]))
		await press('.modules-remove')
		serveJob(jobAnswer({ state: 'succeeded', step: 'done', kind: 'remove', kept_packages: ['qemu-utils', 'libvirt-daemon-system'] }, { installed: false }))
		calls.getModules.mockImplementation(() => answer(listRaw()))
		await press('.modules-dialog-ok')
		await tick(MODULE_POLL_MS.running)

		expect(text('.modules-job-title')).toBe('The removal of Virtual machines is done.')
		expect(text('.modules-kept-command code')).toBe('apt-get purge qemu-utils libvirt-daemon-system')
		await wrapper.find('.modules-kept-command button').trigger('click')
		await settle()
		expect(copy).toHaveBeenCalledWith('apt-get purge qemu-utils libvirt-daemon-system')
		expect(calls.removeModule).toHaveBeenCalledTimes(1)
	})

	it('gives no command after a remove when the core gives no list', async () => {
		await open(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })]))
		await press('.modules-remove')
		serveJob(jobAnswer({ state: 'succeeded', step: 'done', kind: 'remove' }, { installed: false }))
		await press('.modules-dialog-ok')
		await tick(MODULE_POLL_MS.running)

		expect(wrapper.find('.modules-kept').exists()).toBe(false)
		expect(text('.modules-next')).toBe(JOB_NEXT.succeededRemove)
	})
})

describe('a plan that cannot be confirmed says why', () => {
	it('says a plan with no valid identifier, with no word of reading it and confirming, and no button that installs', async () => {
		await open()
		await installDialog({ plan_id: '' })

		expect(text('.modules-no-id')).toBe(TEXT.plan.noId)
		expect(wrapper.find('.modules-dialog-line').exists()).toBe(false)
		expect(dialog().text()).not.toContain('Read it, then confirm')
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
		expect(wrapper.find('.modules-dialog-cancel').text()).toBe('Close')
	})

	it('says a plan that does not list the packages, and does not say that apt installs none', async () => {
		await open()
		await installDialog({ packages: undefined })

		expect(text('.modules-no-list')).toBe(TEXT.plan.noList)
		expect(wrapper.find('.modules-no-packages').exists()).toBe(false)
		expect(dialog().text()).not.toContain('apt installs no package')
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
	})

	it('says a plan that installs no package as that, with the button', async () => {
		await open()
		await installDialog({ packages: { to_install: [], to_upgrade: [], download_bytes: 0, extra_bytes: 0, known: true } })

		expect(text('.modules-no-packages')).toBe('apt installs no package for this module.')
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(true)
	})

	it('says what is on hold, and gives the command that takes the hold off as text to copy', async () => {
		await open()
		const checks = okChecks().map(check => check.code === 'apt' ? { ...check, ok: false, detail: 'held libvirt-daemon-system ovmf' } : check)
		await installDialog({ refused: 'held_package', plan_id: '', checks })

		expect(text('.modules-refused')).toContain(REASONS.held_package)
		expect(text('.modules-unhold')).toBe(TEXT.plan.unhold)
		expect(text('.modules-unhold-command code')).toBe('apt-mark unhold libvirt-daemon-system ovmf')
		await wrapper.find('.modules-unhold-command button').trigger('click')
		await settle()
		expect(copy).toHaveBeenCalledWith('apt-mark unhold libvirt-daemon-system ovmf')
	})

	it('says the same for the refusal of the install call', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure(refused('held_package', { checks: [{ code: 'apt', ok: false, detail: 'held ovmf' }] })))
		await press('.modules-dialog-ok')

		expect(text('.modules-dialog .modules-unhold-command code')).toBe('apt-mark unhold ovmf')
	})

	it('says a release of ReCasaOS that cannot be told as that, and not as one that is too old', async () => {
		await open()
		await installDialog({ refused: 'recasaos', plan_id: '', checks: okChecks().map(check => check.code === 'recasaos' ? { ...check, ok: false, detail: 'unknown' } : check) })

		expect(text('.modules-refused')).toContain(TEXT.checks.recasaosUnknown)
		expect(text('.modules-refused')).not.toContain('too old')
		expect(text('.modules-check-sentence')).toBe(TEXT.checks.recasaosUnknown)
	})

	it('says the room that is needed and free in the units of the page, and what keeps the machine busy in words', async () => {
		await open()
		const checks = okChecks().map((check) => {
			if (check.code === 'disk')
				return { ...check, ok: false, detail: 'need 314572800 bytes on /usr, 52428800 free' }
			if (check.code === 'busy')
				return { ...check, ok: false, detail: 'package_manager' }
			return check
		})
		await installDialog({ refused: 'busy', plan_id: '', checks })

		const details = texts('.modules-check-detail')
		expect(details).toContain('Room needed on /usr: 300 MiB. Room free: 50 MiB.')
		expect(details).toContain(TEXT.busy.package_manager)
		expect(dialog().text()).not.toContain('314572800')
	})

	it('shows up to 400 characters of what apt says', async () => {
		await open()
		const detail = `The following packages have unmet dependencies: ${'libfoo (>= 1.2) '.repeat(40)}`.slice(0, 400).trim()
		await installDialog({ refused: 'apt_failed', plan_id: '', checks: okChecks().map(check => check.code === 'apt' ? { ...check, ok: false, detail } : check) })

		expect(text('.modules-check-detail')).toBe(detail)
	})
})

describe('what a window says while the core cannot be read', () => {
	async function followed() {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'download' }))
		await press('.modules-dialog-ok')
	}

	it('does not say that the machine restarts when the core answers with an error of its own, and gives its code', async () => {
		await followed()
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation(failure(refused('internal', {}, 500)))
		await tick(MODULE_POLL_MS.running)

		expect(text('.modules-outage-message')).toContain('ReCasaOS answered with an error. This page tries again by itself.')
		expect(text('.modules-outage-message')).toContain('internal')
		expect(wrapper.find('.modules-outage').text()).not.toMatch(/restarting/)
	})

	it('says a gateway with nothing behind it (502) as a core that does not answer, in the words of a module', async () => {
		await followed()
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation(failure({ response: { status: 502, data: '<html>' } }))
		await tick(MODULE_POLL_MS.running)

		expect(text('.modules-outage-message')).toBe('ReCasaOS does not answer. It may be restarting. This page tries again by itself.')
	})

	// the clock of the silence goes on across a tab that was hidden: the page was not asking, and the core was no more answering
	it('keeps the time of the silence across a tab that is hidden for twenty minutes, and sends the person to the machine at once when it is shown', async () => {
		await followed()
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation(failure({ code: 'ERR_NETWORK', request: {} }))
		await tick(MODULE_POLL_MS.running)
		expect(text('.modules-outage-message')).toContain('ReCasaOS does not answer')

		Object.defineProperty(document, 'hidden', { value: true, configurable: true })
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(20 * 60 * 1000)
		expect(calls.getModuleStatus).toHaveBeenCalledTimes(1)
		delete document.hidden
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(0)

		expect(calls.getModuleStatus).toHaveBeenCalledTimes(2)
		expect(text('.modules-outage-message')).toContain('ReCasaOS has not answered for 20 min')
		expect(wrapper.find('.modules-outage').html()).toContain('is-danger')
	})

	it('does not count the time a tab was hidden as silence when the core answered before', async () => {
		await followed()
		Object.defineProperty(document, 'hidden', { value: true, configurable: true })
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(20 * 60 * 1000)
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation(failure({ code: 'ERR_NETWORK', request: {} }))
		delete document.hidden
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(0)

		expect(text('.modules-outage-message')).toBe('ReCasaOS does not answer. It may be restarting. This page tries again by itself.')
		expect(wrapper.find('.modules-outage-elapsed').exists()).toBe(false)
	})
})

describe('the busy flag', () => {
	it('is taken away when a call goes through at the next try, and not kept in front of the job', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementationOnce(failure(refused('busy', { reason: 'a package update is running' })))
		await press('.modules-dialog-ok')
		expect(wrapper.find('.modules-busy').exists()).toBe(true)

		serveJob(jobAnswer({ state: 'running', step: 'packages' }))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(false)
		expect(wrapper.find('.modules-job').exists()).toBe(true)
		expect(wrapper.find('.modules-busy').exists()).toBe(false)
	})

	it('says what the plan says of what keeps the machine busy in the words of the language, with no prose of the core', async () => {
		await open()
		for (const [detail, sentence] of [['package_manager', TEXT.busy.package_manager], ['os_upgrade', TEXT.busy.os_upgrade], ['unreadable', TEXT.busy.unreadable]]) {
			await installDialog({ refused: 'busy', plan_id: '', checks: okChecks().map(check => check.code === 'busy' ? { ...check, ok: false, detail } : check) })
			await press('.modules-dialog-cancel')

			expect(text('.modules-busy-message')).toBe(sentence)
			expect(wrapper.find('.modules-busy-detail').exists()).toBe(false)
			await press('.modules-busy-retry')
		}
	})

	it('says a refusal of the install as busy with its prose as text beside one sentence, and what the plan says in words', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure(refused('busy', { reason: 'the upgrade flag is open', checks: [{ code: 'busy', ok: false, detail: 'os_upgrade' }] })))
		await press('.modules-dialog-ok')
		await press('.modules-dialog-cancel')

		expect(text('.modules-busy-sentence')).toBe(REASONS.busy)
		expect(text('.modules-busy-message')).toBe(TEXT.busy.os_upgrade)
		expect(text('.modules-busy-detail')).toBe('Reported by ReCasaOS: the upgrade flag is open')
	})

	it('asks again for the list and for the jobs when Check again is pressed, and follows a job it finds', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure(refused('busy', { reason: 'another job' })))
		await press('.modules-dialog-ok')
		await press('.modules-dialog-cancel')
		expect(calls.getModules).toHaveBeenCalledTimes(1)

		serveJob(jobAnswer({ state: 'running', step: 'download' }))
		await press('.modules-busy-retry')

		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(calls.getModuleStatus).toHaveBeenCalledWith('virt', expect.anything())
		expect(wrapper.find('.modules-busy').exists()).toBe(false)
		expect(wrapper.vm.follow).toBe('virt')
		expect(wrapper.find('.modules-job').exists()).toBe(true)
	})
})

describe('a call that lost its answer', () => {
	it('follows the job it finds when that job has already ended, closes the window, and reads the list again', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure({ code: 'ECONNABORTED' }))
		serveJob(jobAnswer({ state: 'succeeded', step: 'done', kind: 'install', started_at: '2026-10-18T12:00:30Z', ended_at: '2026-10-18T12:01:00Z' }, { installed: true }))
		calls.getModules.mockImplementation(() => answer(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(false)
		expect(text('.modules-job-title')).toBe('The install of Virtual machines is done.')
		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(text('.modules-installed')).toBe('Installed version: v0.1.0')
		expect(wrapper.find('.modules-job-note').exists()).toBe(false)
	})

	it('does the same for a job that failed', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure({ code: 'ECONNABORTED' }))
		serveJob(jobAnswer({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back', started_at: '2026-10-18T12:00:30Z' }))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(false)
		expect(text('.modules-job-title')).toBe('The install of Virtual machines stopped.')
	})

	it.each([502, 503, 504, 500])('looks for the job first when a %d with no code of the core comes back from the install', async (status) => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure({ response: { status, data: '<html>' } }))
		serveJob(jobAnswer({ state: 'running', step: 'packages', started_at: '2026-10-18T12:00:30Z' }))
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(false)
		expect(wrapper.vm.follow).toBe('virt')
		expect(wrapper.find('.modules-job').exists()).toBe(true)
	})

	it('says that the call may have gone through when it finds no job, for a gateway with nothing behind it', async () => {
		await open()
		await installDialog()
		calls.installModule.mockImplementation(failure({ response: { status: 502, data: '<html>' } }))
		serveJob(IDLE)
		await press('.modules-dialog-ok')

		expect(dialog().exists()).toBe(true)
		expect(text('.modules-dialog .modules-call-sentence')).toBe(TEXT.call.maybe)
	})

	it('does not take the report of an earlier job for the job of the call', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back', started_at: '2026-10-18T10:00:00Z' }))
		await open()
		await wrapper.find('.modules-job-close').trigger('click')
		await installDialog()
		calls.installModule.mockImplementation(failure({ code: 'ECONNABORTED' }))
		await press('.modules-dialog-ok')

		// (the same job is still there: it is not the job of this call)
		expect(dialog().exists()).toBe(true)
		expect(text('.modules-dialog .modules-call-sentence')).toBe(TEXT.call.maybe)
		expect(wrapper.find('.modules-job').exists()).toBe(false)
	})

	it('says a plan that got no answer as a read: nothing was changed, try again', async () => {
		await open()
		calls.planModule.mockImplementation(failure({ code: 'ECONNABORTED' }))
		await press('.modules-install')

		expect(text('.modules-dialog .modules-call-sentence')).toBe(TEXT.call.readFailed)
		expect(dialog().text()).not.toContain('gone through')
		expect(wrapper.find('.modules-dialog-retry').exists()).toBe(true)
	})
})

describe('the list when the page learns that it is out of date', () => {
	const installed = () => listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])

	it('is read again after a remove that the core refuses as not installed, and the window has no button left to remove', async () => {
		await open(installed())
		await press('.modules-remove')
		calls.getModules.mockImplementation(() => answer(listRaw()))
		calls.removeModule.mockImplementation(failure(refused('not_installed', {})))
		await press('.modules-dialog-ok')

		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(text('.modules-dialog .modules-call-sentence')).toBe(REASONS.not_installed)
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
		expect(wrapper.find('.modules-dialog-cancel').text()).toBe('Close')
		await press('.modules-dialog-cancel')
		expect(wrapper.find('.modules-remove').exists()).toBe(false)
		expect(wrapper.find('.modules-install').exists()).toBe(true)
	})

	it('is read again after an install that the core refuses as already installed', async () => {
		await open()
		await installDialog()
		calls.getModules.mockImplementation(() => answer(installed()))
		calls.installModule.mockImplementation(failure(refused('already_installed', {})))
		await press('.modules-dialog-ok')

		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
		await press('.modules-dialog-cancel')
		expect(wrapper.find('.modules-install').exists()).toBe(false)
		expect(wrapper.find('.modules-remove').exists()).toBe(true)
	})

	it('is read again after a plan that is refused as already installed', async () => {
		await open()
		calls.getModules.mockImplementation(() => answer(installed()))
		await installDialog({ refused: 'already_installed', plan_id: '', checks: okChecks().map(check => check.code === 'already_installed' ? { ...check, ok: false, detail: 'installed' } : check) })

		expect(calls.getModules).toHaveBeenCalledTimes(2)
		await press('.modules-dialog-cancel')
		expect(wrapper.find('.modules-remove').exists()).toBe(true)
	})

	it('is read once more, a little later and by itself, when it could not be read at the end of a job', async () => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'route' }))
		await press('.modules-dialog-ok')
		calls.getModules.mockReset()
		calls.getModules.mockImplementationOnce(failure({ response: { status: 502 } }))
		calls.getModules.mockImplementation(() => answer(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])))
		serveJob(jobAnswer({ state: 'succeeded', step: 'done', kind: 'install' }, { installed: true }))
		await tick(MODULE_POLL_MS.running)

		expect(calls.getModules).toHaveBeenCalledTimes(1)
		expect(wrapper.find('.modules-list-error').exists()).toBe(true)
		await tick(5000)
		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.modules-list-error').exists()).toBe(false)
		expect(text('.modules-installed')).toBe('Installed version: v0.1.0')
		// once, and no more
		await tick(120000)
		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('does not retry again when the second reading fails too', async () => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'route' }))
		await press('.modules-dialog-ok')
		calls.getModules.mockReset()
		calls.getModules.mockImplementation(failure({ response: { status: 502 } }))
		serveJob(jobAnswer({ state: 'succeeded', step: 'done', kind: 'install' }, { installed: true }))
		await tick(MODULE_POLL_MS.running)
		await tick(60000)

		expect(calls.getModules).toHaveBeenCalledTimes(2)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('leaves no timer when the window closes before the second reading', async () => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'route' }))
		await press('.modules-dialog-ok')
		calls.getModules.mockReset()
		calls.getModules.mockImplementation(failure({ response: { status: 502 } }))
		serveJob(jobAnswer({ state: 'succeeded', step: 'done', kind: 'install' }, { installed: true }))
		await tick(MODULE_POLL_MS.running)
		expect(vi.getTimerCount()).toBeGreaterThan(0)
		close()

		expect(vi.getTimerCount()).toBe(0)
	})
})

describe('the look for the jobs when the window opens', () => {
	const modules = count => Array.from({ length: count }, (_, index) => moduleRaw({ name: `m${index}`, title: `M${index}` }))

	it('asks four modules at a time, and the next as soon as one has answered', async () => {
		const out = {}
		let now = 0
		let most = 0
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation((name) => {
			out[name] = deferred()
			now++
			most = Math.max(most, now)
			return out[name].promise.finally(() => {
				now--
			})
		})
		await open(listRaw(modules(10)))

		expect(calls.getModuleStatus.mock.calls.map(call => call[0])).toEqual(['m0', 'm1', 'm2', 'm3'])
		expect(wrapper.vm.probing).toBe(true)
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeDefined()
		out.m1.resolve({ data: { data: { job: jobRaw({ name: 'm1', state: 'idle', step: '' }), status: {} } } })
		await settle()
		expect(calls.getModuleStatus.mock.calls.map(call => call[0])).toEqual(['m0', 'm1', 'm2', 'm3', 'm4'])

		for (let round = 0; round < 8; round++) {
			for (const name of Object.keys(out))
				out[name].resolve({ data: { data: { job: jobRaw({ name, state: 'idle', step: '' }), status: {} } } })
			await settle()
		}
		expect(calls.getModuleStatus).toHaveBeenCalledTimes(10)
		expect(most).toBeLessThanOrEqual(4)
		expect(wrapper.vm.probing).toBe(false)
	})

	it('gives the whole look one deadline, and the buttons come back when statuses hang', async () => {
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation((name, signal) => new Promise((resolve, reject) => {
			signal?.addEventListener('abort', () => reject(new Error('aborted')))
		}))
		await open(listRaw(modules(16)))

		expect(wrapper.vm.probing).toBe(true)
		expect(calls.getModuleStatus).toHaveBeenCalledTimes(4)
		await tick(14000)
		expect(wrapper.vm.probing).toBe(true)
		await tick(1000)
		await settle()

		expect(wrapper.vm.probing).toBe(false)
		// no more are asked once the time is up, and the ones that were out were given up
		expect(calls.getModuleStatus).toHaveBeenCalledTimes(4)
		for (const call of calls.getModuleStatus.mock.calls)
			expect(call[1].aborted).toBe(true)
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeUndefined()
		expect(vi.getTimerCount()).toBe(0)
	})

	it('leaves no timer and gives up the asks when the window closes during the look', async () => {
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation(() => new Promise(() => {}))
		await open(listRaw(modules(6)))
		const signals = calls.getModuleStatus.mock.calls.map(call => call[1])
		close()

		expect(signals.every(signal => signal.aborted)).toBe(true)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('stops asking for the next modules once a job is found to run', async () => {
		calls.getModuleStatus.mockReset()
		calls.getModuleStatus.mockImplementation(name => answer(name === 'm0' ? jobAnswer({ name, state: 'running', step: 'packages' }) : { job: jobRaw({ name, state: 'idle', step: '' }), status: {} }))
		await open(listRaw(modules(12)))

		expect(wrapper.vm.follow).toBe('m0')
		expect(calls.getModuleStatus.mock.calls.filter(call => call[0] !== 'm0').length).toBeLessThanOrEqual(4)
	})
})

describe('a plan that was given up', () => {
	it('says once that the machine may still work on it for up to a minute, announces it, and does not ask again by itself', async () => {
		const out = deferred()
		calls.planModule.mockReturnValue(out.promise)
		await open()
		await press('.modules-install')
		await press('.modules-dialog-cancel')

		expect(text('.modules-plan-note')).toBe(TEXT.plan.cancelled)
		expect(text('.modules-live')).toBe(TEXT.plan.cancelled)
		await tick(120000)
		expect(calls.planModule).toHaveBeenCalledTimes(1)
		// it goes away when the minute is over
		expect(wrapper.find('.modules-plan-note').exists()).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('is not said for a plan that was answered', async () => {
		await open()
		await installDialog()
		await press('.modules-dialog-cancel')

		expect(wrapper.find('.modules-plan-note').exists()).toBe(false)
	})

	it('goes when another plan is asked for', async () => {
		const out = deferred()
		calls.planModule.mockReturnValueOnce(out.promise)
		await open()
		await press('.modules-install')
		await press('.modules-dialog-cancel')
		expect(wrapper.find('.modules-plan-note').exists()).toBe(true)
		await installDialog()

		expect(wrapper.find('.modules-plan-note').exists()).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('leaves no timer when the window closes while the note is up', async () => {
		calls.planModule.mockReturnValue(deferred().promise)
		await open()
		await press('.modules-install')
		await press('.modules-dialog-cancel')
		expect(vi.getTimerCount()).toBeGreaterThan(0)
		close()

		expect(vi.getTimerCount()).toBe(0)
	})
})

// ---- the confirmation window says what it does ------------------------------------------------------------------------------

describe('the confirmation of an install', () => {
	it('shows what the module says about itself, with its notes, the version, and what the install does to the machine', async () => {
		await open()
		await installDialog()

		expect(text('.modules-dialog-about')).toContain('A virtual machine can be given a USB device')
		expect(text('.modules-dialog-version')).toBe('Version offered: v0.1.0')
		expect(text('.modules-consequences')).toBe(TEXT.plan.consequencesText)
		expect(text('.modules-consequences')).toContain('apt as root')
		expect(text('.modules-consequences')).toContain('/usr/bin')
		expect(text('.modules-consequences')).toContain('/usr/lib/systemd/system')
		expect(text('.modules-consequences')).toContain('starts when the machine boots')
		expect(text('.modules-consequences')).toContain('Do not switch the machine off')
	})

	it('says the description as text', async () => {
		const html = '<img src=x onerror="alert(1)">'
		await open(listRaw([moduleRaw({ description: html })]))
		await installDialog()

		expect(dialog().find('img').exists()).toBe(false)
		expect(text('.modules-dialog-about')).toBe(html)
	})

	it('does not show a version that is not a tag', async () => {
		await open()
		await installDialog({ tag: '<b>1</b>' })

		expect(wrapper.find('.modules-dialog-version').exists()).toBe(false)
	})

	it('says what is happening while the install is asked for, and not that there is something to read; the window cannot be left', async () => {
		await open()
		await installDialog()
		calls.installModule.mockReturnValue(deferred().promise)
		await press('.modules-dialog-ok')

		expect(text('.modules-dialog-calling')).toBe(TEXT.plan.starting)
		expect(dialog().text()).not.toContain('Read it, then confirm')
		expect(wrapper.find('.modules-dialog-line').exists()).toBe(false)
		expect(wrapper.find('.modules-calling').attributes('aria-label')).toBe('Starting the install')
		expect(wrapper.find('.modules-dialog-cancel').attributes('disabled')).toBeDefined()
		expect(text('.modules-live')).toBe(TEXT.plan.starting)
	})

	it('says what is happening while the remove is asked for', async () => {
		await open(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })]))
		await press('.modules-remove')
		calls.removeModule.mockReturnValue(deferred().promise)
		await press('.modules-dialog-ok')

		expect(text('.modules-dialog-calling')).toBe(TEXT.remove.starting)
		expect(wrapper.find('.modules-calling').attributes('aria-label')).toBe('Starting the removal')
		expect(texts('.modules-dialog .modules-dialog-line')).toHaveLength(2)
	})

	it('announces the plan when it is there, and why it is refused when it is', async () => {
		await open()
		await installDialog()
		expect(text('.modules-live')).toBe('The plan for Virtual machines is ready. Read it, then confirm.')
		await press('.modules-dialog-cancel')

		await installDialog({ refused: 'os', plan_id: '', checks: okChecks().map(check => check.code === 'os' ? { ...check, ok: false, detail: 'unsupported debian:11' } : check) })
		expect(text('.modules-live')).toBe(REASONS.os)
	})

	it('names the box of the log, which takes the focus to be scrolled', async () => {
		serveJob(jobAnswer({ state: 'running', step: 'download', log_tail: ['a line'] }))
		await open()

		const pre = wrapper.find('.modules-log-text pre')
		expect(pre.attributes('tabindex')).toBe('0')
		expect(pre.attributes('aria-label')).toBe(TEXT.job.log)
		expect(pre.attributes('role')).toBe('region')
	})
})

describe('the report of a job that stopped', () => {
	it('is put away when the person has read it, until another job begins', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back', started_at: '2026-10-18T10:00:00Z' }))
		await open()
		expect(text('.modules-job-close')).toBe('Close this report')

		await press('.modules-job-close')

		expect(wrapper.find('.modules-job').exists()).toBe(false)
		expect(document.activeElement).toBe(wrapper.find('.modules-card-title').element)
		// the buttons are not shut by a report: they were not before it was closed either
		expect(wrapper.find('.modules-install').attributes('disabled')).toBeUndefined()

		serveJob(jobAnswer({ state: 'running', step: 'packages', started_at: '2026-10-18T12:30:00Z' }))
		await installDialog()
		await press('.modules-dialog-ok')
		expect(wrapper.find('.modules-job').exists()).toBe(true)
		expect(wrapper.find('.modules-job-close').exists()).toBe(false)
	})

	it('is put away for a job that was cut short too', async () => {
		serveJob(jobAnswer({ state: 'interrupted', step: 'unpack' }))
		await open()
		await press('.modules-job-close')

		expect(wrapper.find('.modules-job').exists()).toBe(false)
	})

	it.each([
		['running', { step: 'download' }],
		['succeeded', { step: 'done' }],
	])('is not offered for a job that is %s', async (state, extra) => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state, ...extra }))
		await press('.modules-dialog-ok')

		expect(wrapper.find('.modules-job').exists()).toBe(true)
		expect(wrapper.find('.modules-job-close').exists()).toBe(false)
	})

	it('comes back for the report of another job of the same module', async () => {
		serveJob(jobAnswer({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back', started_at: '2026-10-18T10:00:00Z' }))
		await open()
		await press('.modules-job-close')
		expect(wrapper.find('.modules-job').exists()).toBe(false)

		serveJob(jobAnswer({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back', started_at: '2026-10-18T11:00:00Z' }))
		await wrapper.vm.probeJob('virt')
		await settle()
		expect(wrapper.find('.modules-job').exists()).toBe(true)
	})
})

describe('the shape of the card', () => {
	it('lets the log scroll in its own box: the message the report stands in cannot grow to the width of its longest line', () => {
		const style = source.slice(source.indexOf('<style'))
		expect(style).toMatch(/\.modules-job\s+:deep\(\.media-content\)/)
		expect(style).toMatch(/min-width: 0/)
	})
})

// ---- the Tab key --------------------------------------------------------------------------------------------------------------

describe('the Tab key inside the confirmation window, under the real hold of Buefy on the window it stands on', () => {
	const Outer = {
		data: () => ({ open: true }),
		render() {
			const props = { 'modelValue': this.open, 'hasModalCard': true, 'canCancel': ['escape'], 'trapFocus': true, 'autoFocus': false, 'onUpdate:modelValue': (value) => {
				this.open = value
			} }
			return h(BModal, props, { default: () => h('div', { class: 'modal-card outer-card' }, [h(ModulesModal)]) })
		},
	}

	async function opened() {
		calls.getModules.mockImplementation(() => answer(listRaw()))
		calls.planModule.mockImplementation(() => answer(planRaw()))
		wrapper = mount(Outer, { attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await settle()
		wrapper.find('.modules-install').element.focus()
		await press('.modules-install')
	}

	function tab(target, shift = false) {
		const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true })
		target.dispatchEvent(event)
		return event
	}
	const inDialog = () => Boolean(document.activeElement?.closest('.modules-dialog'))
	const cancel = () => wrapper.find('.modules-dialog-cancel').element
	const ok = () => wrapper.find('.modules-dialog-ok').element

	it('goes from the heading to the first control of the window, and not to the button of the card under it', async () => {
		await opened()
		const heading = wrapper.find('.modules-dialog-title').element
		expect(document.activeElement).toBe(heading)

		const event = tab(heading)

		expect(event.defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(cancel())
		expect(document.activeElement).not.toBe(wrapper.find('.modules-install').element)
	})

	it('goes from the last control to the first, and from the first to the last with the Shift key', async () => {
		await opened()

		cancel().focus()
		expect(tab(cancel(), true).defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(ok())

		expect(tab(ok()).defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(cancel())
	})

	it('goes from the heading to the last control with the Shift key, and does not leave for what is before the window', async () => {
		await opened()
		const heading = wrapper.find('.modules-dialog-title').element

		const event = tab(heading, true)

		expect(event.defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(ok())
		expect(inDialog()).toBe(true)
	})

	it('leaves the keys of the middle to the browser, which goes from one control to the next', async () => {
		await opened()
		const event = tab(cancel())
		expect(event.defaultPrevented).toBe(false)
		expect(tab(ok(), true).defaultPrevented).toBe(false)
	})

	it('keeps the focus inside the window, whichever key is pressed again and again', async () => {
		await opened()
		let at = wrapper.find('.modules-dialog-title').element
		for (const shift of [false, true, false, false, true, true, false]) {
			tab(at, shift)
			expect(inDialog()).toBe(true)
			at = document.activeElement
		}
	})

	// a click on the text of a window leaves the focus on the window itself, which is no stop of the Tab key
	it('goes from the window itself to its first control, and with the Shift key to its last', async () => {
		await opened()
		const card = wrapper.find('.modules-dialog').element
		card.focus()
		expect(document.activeElement).toBe(card)

		expect(tab(card).defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(cancel())
		card.focus()
		expect(tab(card, true).defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(ok())
	})

	it('goes round in the window itself too, and from its heading', async () => {
		calls.getModules.mockImplementation(() => answer(listRaw()))
		wrapper = mount(Outer, { attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await settle()
		const title = wrapper.find('.modules-title').element
		const buttons = wrapper.findAll('.modules-modal button:not([disabled])').map(button => button.element)
		expect(document.activeElement).toBe(title)

		const back = tab(title, true)
		expect(back.defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(buttons.at(-1))
		expect(document.activeElement.textContent).toContain('Close')

		tab(buttons.at(-1))
		expect(document.activeElement).toBe(buttons[0])
		tab(buttons[0], true)
		expect(document.activeElement).toBe(buttons.at(-1))
	})
})

// ---- the page --------------------------------------------------------------------------------------------------------------

describe('the page', () => {
	it('has a name for every control, and the list of steps is an ordered list', async () => {
		await open()
		await installDialog()
		serveJob(jobAnswer({ state: 'running', step: 'packages' }))
		await press('.modules-dialog-ok')

		for (const button of wrapper.findAll('button'))
			expect(button.text() || button.attributes('aria-label'), button.html()).toBeTruthy()
		expect(wrapper.find('ol.modules-steps').exists()).toBe(true)
		expect(wrapper.find('progress').attributes('aria-label')).toBeTruthy()
	})

	it('lets a button wrap in a narrow window and keeps the names inside it', () => {
		expect(source).toMatch(/white-space: normal/)
		expect(source).toMatch(/overflow-wrap: anywhere/)
		expect(source).toMatch(/flex-wrap: wrap/)
		expect(source).not.toMatch(/white-space: nowrap/)
	})

	it('takes its colours from the project\'s variables', () => {
		const style = source.slice(source.indexOf('<style'))
		const rules = style.split('\n').filter(rule => /^\s*(?:color|background|border[\w-]*):/.test(rule))
		expect(rules.length).toBeGreaterThan(3)
		expect(rules.filter(rule => /#[0-9a-f]{3,6}\b|rgb|hsl/i.test(rule))).toEqual([])
	})

	it('closes with its button', async () => {
		await open()
		await wrapper.find('.modal-card-foot .button').trigger('click')

		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('says its sentences in French', async () => {
		i18n.global.locale = 'fr_fr'
		await open()

		expect(text('.modules-tier-sentence')).toBe('Testé uniquement sur une machine simulée, pas sur une vraie.')
		expect(text('.modules-offered')).toBe('Version proposée : v0.1.0')
		expect(wrapper.find('.modules-install').text()).toBe('Installer')
	})
})

// ---- the update -------------------------------------------------------------------------------------------------------------

describe('the update of an installed module', () => {
	const UPDATE_CHECK_CODES = ['catalogue', 'os', 'arch', 'recasaos', 'installed', 'newer', 'foreign_unit', 'busy', 'dpkg_state', 'disk', 'apt']
	const updatable = (changes = {}) => listRaw([moduleRaw({ installed: { version: 'v0.1.2' }, tag: 'v0.1.3', update: { available: true, installed: 'v0.1.2', latest: 'v0.1.3' }, ...changes })])
	const updateChecks = () => UPDATE_CHECK_CODES.map(code => ({ code, ok: true, detail: '' }))
	const updatePlanRaw = (changes = {}) => planRaw({
		mode: 'update',
		tag: 'v0.1.3',
		checks: updateChecks(),
		packages: { to_install: ['qemu-img', 'libc6'], to_upgrade: ['libc6'], download_bytes: 1048576, extra_bytes: 2097152, known: true },
		update: { installed: 'v0.1.2', latest: 'v0.1.3', added: ['qemu-img'], dropped: ['old-helper'] },
		...changes,
	})
	// the job of an update, as the core says it
	const updateJob = (changes = {}, status = { installed: true, version: 'v0.1.2' }) => jobAnswer({ kind: 'update', ...changes }, status)

	// the plan of the update on the screen, after Update was pressed
	async function updateDialog(planChanges = {}) {
		calls.planModule.mockImplementation(() => answer(updatePlanRaw(planChanges)))
		wrapper.find('.modules-update-button').element.focus()
		await press('.modules-update-button')
	}
	// an update that is running, its window closed
	async function updating(step = 'backup') {
		await open(updatable())
		await updateDialog()
		serveJob(updateJob({ state: 'running', step }))
		calls.installModule.mockImplementation(() => answer(updateJob({ state: 'running', step: '' })))
		await press('.modules-dialog-ok')
	}
	const finished = (changes, status) => {
		serveJob(updateJob({ ended_at: '2026-10-18T12:01:00Z', ...changes }, status))
		return tick(MODULE_POLL_MS.running)
	}

	beforeEach(() => eventBus.$emit.mockClear())

	describe('the card', () => {
		it('shows the version that is offered, the installed version and an Update button, when an update is available', async () => {
			await open(updatable())

			expect(text('.modules-update-badge')).toBe('Version v0.1.3 available')
			expect(text('.modules-installed')).toBe('Installed version: v0.1.2')
			expect(wrapper.find('.modules-update-button').text()).toBe('Update')
			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeUndefined()
			expect(wrapper.find('.modules-install').exists()).toBe(false)
			expect(wrapper.find('.modules-remove').exists()).toBe(true)
		})

		it.each([
			['the core says that there is none', { update: { available: false, installed: 'v0.1.2', latest: 'v0.1.3' } }],
			['both versions are the same', { update: { available: true, installed: 'v0.1.2', latest: 'v0.1.2' } }],
			['the offered version is earlier', { update: { available: true, installed: 'v0.1.2', latest: 'v0.1.1' } }],
			['the core says nothing of an update', { update: undefined }],
			['the installed version is not known', { installed: { version: null } }],
			['the module is not installed', { installed: null }],
		])('shows neither the badge nor the button when %s', async (_, changes) => {
			await open(updatable(changes))

			expect(wrapper.find('.modules-update-badge').exists()).toBe(false)
			expect(wrapper.find('.modules-update-button').exists()).toBe(false)
		})

		it('says the badge and the button in French', async () => {
			i18n.global.locale = 'fr_fr'
			await open(updatable())

			expect(text('.modules-update-badge')).toBe('Version v0.1.3 disponible')
			expect(text('.modules-update-button')).toBe('Mettre à jour')
		})

		it('shuts the button while a job runs, like Install and Remove, and a press does nothing', async () => {
			serveJob(updateJob({ state: 'running', step: 'download' }, { installed: true }))
			await open(updatable())

			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeDefined()
			expect(wrapper.find('.modules-remove').attributes('disabled')).toBeDefined()
			await wrapper.find('.modules-update-button').trigger('click')
			wrapper.vm.pressUpdate(wrapper.vm.view.modules[0], undefined)
			await settle()
			expect(calls.planModule).not.toHaveBeenCalled()
			expect(dialog().exists()).toBe(false)
		})

		it('shuts the button while the machine is busy', async () => {
			await open(updatable())
			wrapper.vm.busy = { message: null, detail: '' }
			await settle()

			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeDefined()
			wrapper.vm.pressUpdate(wrapper.vm.view.modules[0], undefined)
			await settle()
			expect(calls.planModule).not.toHaveBeenCalled()
		})
	})

	describe('the plan', () => {
		it('asks for the plan with the mode update, once, in a window of the update with a spinner', async () => {
			const out = deferred()
			calls.planModule.mockReturnValue(out.promise)
			await open(updatable())
			wrapper.find('.modules-update-button').element.focus()
			await press('.modules-update-button')

			expect(calls.planModule).toHaveBeenCalledTimes(1)
			expect(calls.planModule).toHaveBeenCalledWith('virt', expect.any(AbortSignal), 'update')
			expect(calls.installModule).not.toHaveBeenCalled()
			expect(text('.modules-dialog-title')).toBe('Update Virtual machines')
			expect(text('.modules-dialog .modules-dialog-line')).toContain('what the update would do')
			expect(wrapper.find('.modules-planning').attributes('aria-label')).toBe('Making the plan')
			expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
			expect(document.activeElement).toBe(wrapper.find('.modules-dialog-title').element)
			out.resolve({ data: { data: updatePlanRaw() } })
		})

		it('asks only once for two clicks and a call of the method', async () => {
			calls.planModule.mockReturnValue(deferred().promise)
			await open(updatable())
			await wrapper.find('.modules-update-button').trigger('click')
			await wrapper.find('.modules-update-button').trigger('click')
			wrapper.vm.pressUpdate(wrapper.vm.view.modules[0], undefined)
			await settle()

			expect(calls.planModule).toHaveBeenCalledTimes(1)
		})

		it('shows the new version, what the update adds, what the new version no longer names, the checks and what the update does', async () => {
			await open(updatable())
			await updateDialog()

			expect(text('.modules-dialog-installed')).toBe('Installed version: v0.1.2')
			expect(text('.modules-dialog-version')).toBe('Version offered: v0.1.3')
			expect(text('.modules-dialog .modules-dialog-line')).toBe('This is what the update does. Read it, then confirm.')
			expect(text('.modules-update-added-heading')).toBe('These packages will be installed')
			expect(texts('.modules-added li')).toEqual(['qemu-img'])
			expect(texts('.modules-dropped li')).toEqual(['old-helper'])
			expect(text('.modules-dropped-note')).toBe('They stay on the machine: ReCasaOS never removes a package.')
			// the list of what apt installs is the one above: it is not said twice
			expect(wrapper.findAll('.modules-dialog .modules-names:not(.modules-added):not(.modules-dropped):not(.modules-upgrades)')).toHaveLength(0)
			expect(text('.modules-size-download')).toBe('Download of the packages: 1 MiB')
			expect(texts('.modules-update-consequences li')).toEqual([
				'The service of the module stops for a moment, then starts again.',
				'This page does not touch the machines that the module runs, but the service that manages them is stopped for a moment: check that this is a good time.',
				'The configuration that you set for the module, and its data, are kept.',
				'If something fails, the old version is put back.',
				'Do not switch the machine off while it runs.',
			])
			expect(wrapper.find('.modules-stay').exists()).toBe(false)
			expect(wrapper.findAll('.modules-check')).toHaveLength(11)
			expect(texts('.modules-check-label')).toContain('Installed, and its files can be checked')
			expect(texts('.modules-check-label')).toContain('A later version is offered')
			expect(wrapper.find('.modules-dialog-ok').text()).toBe('Update the module')
			expect(wrapper.find('.modules-dialog-ok').classes()).toContain('is-primary')
			expect(wrapper.find('.modules-dialog-cancel').text()).toBe('Cancel')
			expect(calls.installModule).not.toHaveBeenCalled()
		})

		it('says an update that adds no package in a line, and offers to confirm it', async () => {
			await open(updatable())
			await updateDialog({ packages: { to_install: [], to_upgrade: [], known: false }, update: { installed: 'v0.1.2', latest: 'v0.1.3', added: [], dropped: [] } })

			expect(text('.modules-no-added')).toBe('No package to install')
			expect(wrapper.find('.modules-added').exists()).toBe(false)
			expect(wrapper.find('.modules-dropped').exists()).toBe(false)
			expect(wrapper.find('.modules-no-packages').exists()).toBe(false)
			expect(wrapper.find('.modules-size-unknown').exists()).toBe(false)
			expect(wrapper.find('.modules-dialog-ok').exists()).toBe(true)
		})

		it('shows the names of the packages as text', async () => {
			await open(updatable())
			await updateDialog({ update: { installed: 'v0.1.2', latest: 'v0.1.3', added: ['<img src=x onerror=alert(1)>'], dropped: ['<b>old</b>'] } })

			expect(wrapper.find('.modules-dialog img').exists()).toBe(false)
			expect(wrapper.find('.modules-dialog .modules-dropped b').exists()).toBe(false)
			expect(text('.modules-added')).toContain('<img src=x onerror=alert(1)>')
			expect(text('.modules-dropped')).toBe('<b>old</b>')
		})

		it('says a refused plan: the sentence and the code, the check that failed first, and no button; the list is read again', async () => {
			await open(updatable())
			const checks = UPDATE_CHECK_CODES.map(code => ({ code, ok: code !== 'newer', detail: code === 'newer' ? 'same_tag' : '' }))
			await updateDialog({ refused: 'up_to_date', plan_id: '', checks })

			expect(text('.modules-refused')).toContain(REASONS.up_to_date)
			expect(text('.modules-refused code')).toBe('up_to_date')
			expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
			expect(wrapper.findAll('.modules-check')[0].classes()).toContain('is-failed')
			expect(wrapper.findAll('.modules-check-label')[0].text()).toBe('A later version is offered')
			expect(wrapper.findAll('.modules-check-sentence')[0].text()).toBe(REASONS.up_to_date)
			expect(wrapper.find('.modules-dialog-cancel').text()).toBe('Close')
			expect(calls.getModules).toHaveBeenCalledTimes(2)
			expect(calls.installModule).not.toHaveBeenCalled()
		})

		it.each([
			['files_unverified', 'installed'],
			['unit_changed', 'foreign_unit'],
			['downgrade', 'newer'],
		])('says the refusal %s of the check %s in its words', async (code, check) => {
			await open(updatable())
			const checks = UPDATE_CHECK_CODES.map(item => ({ code: item, ok: item !== check, detail: item === check ? 'x' : '' }))
			await updateDialog({ refused: code, plan_id: '', checks })

			expect(text('.modules-refused')).toContain(REASONS[code])
			expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
			expect(wrapper.findAll('.modules-check-sentence')[0].text()).toBe(REASONS[code])
		})

		it('does not take the plan of an install for the plan of an update: a failure to try again, and no button', async () => {
			await open(updatable())
			calls.planModule.mockImplementation(() => answer(planRaw()))
			await press('.modules-update-button')

			expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
			expect(wrapper.find('.modules-dialog-retry').exists()).toBe(true)
			expect(calls.installModule).not.toHaveBeenCalled()
		})

		it('has no button for a plan that does not say what changes', async () => {
			await open(updatable())
			await updateDialog({ update: undefined })

			expect(wrapper.find('.modules-dialog-ok').exists()).toBe(false)
			expect(text('.modules-no-list')).toContain('cannot be confirmed')
		})

		it('gives up when Cancel is pressed, and the focus is back on the Update button', async () => {
			await open(updatable())
			await updateDialog()
			await press('.modules-dialog-cancel')

			expect(dialog().exists()).toBe(false)
			expect(calls.installModule).not.toHaveBeenCalled()
			expect(document.activeElement).toBe(wrapper.find('.modules-update-button').element)
		})

		it('closes at Escape, the window that is on top and not the one under it', async () => {
			await open(updatable())
			await updateDialog()
			document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
			await settle()

			expect(dialog().exists()).toBe(false)
			expect(wrapper.find('.modules-modal').exists()).toBe(true)
			expect(wrapper.emitted('close')).toBeUndefined()
		})

		it('says the window in French, with the words of the update', async () => {
			i18n.global.locale = 'fr_fr'
			await open(updatable())
			await updateDialog()

			expect(text('.modules-dialog-title')).toBe('Mettre à jour Virtual machines')
			expect(text('.modules-dialog-ok')).toBe('Mettre à jour le module')
			expect(text('.modules-dropped-note')).toBe('Ils restent sur la machine : ReCasaOS ne supprime jamais un paquet.')
		})
	})

	describe('the start of the job', () => {
		it('starts the job with the id of the plan that is shown and the mode update, once, after the plan, and follows it', async () => {
			await open(updatable())
			await updateDialog()
			serveJob(updateJob({ state: 'running', step: 'backup' }))
			const out = deferred()
			calls.installModule.mockReturnValue(out.promise)

			await wrapper.find('.modules-dialog-ok').trigger('click')
			await wrapper.find('.modules-dialog-ok').trigger('click')
			wrapper.vm.confirmDialog()
			await settle()

			expect(text('.modules-dialog-calling')).toContain('starting the update')
			expect(wrapper.find('.modules-calling').attributes('aria-label')).toBe('Starting the update')
			expect(calls.installModule).toHaveBeenCalledTimes(1)
			expect(calls.installModule).toHaveBeenCalledWith('virt', { plan_id: PLAN_ID, mode: 'update' })
			expect(calls.planModule.mock.invocationCallOrder[0]).toBeLessThan(calls.installModule.mock.invocationCallOrder[0])
			expect(calls.removeModule).not.toHaveBeenCalled()
			out.resolve({ data: { data: updateJob({ state: 'running', step: '' }) } })
			await settle()

			expect(calls.installModule).toHaveBeenCalledTimes(1)
			expect(calls.planModule).toHaveBeenCalledTimes(1)
			expect(dialog().exists()).toBe(false)
			expect(calls.getModuleStatus).toHaveBeenLastCalledWith('virt')
		})

		it('asks for the plan again, with the mode update, when the plan changed, and starts the job for the new one', async () => {
			await open(updatable())
			await updateDialog()
			calls.planModule.mockImplementation(() => answer(updatePlanRaw({ plan_id: PLAN_ID_2 })))
			calls.installModule.mockImplementationOnce(failure(refused('plan_changed', {})))
			await press('.modules-dialog-ok')

			expect(calls.planModule).toHaveBeenCalledTimes(2)
			expect(calls.planModule).toHaveBeenLastCalledWith('virt', expect.any(AbortSignal), 'update')
			expect(text('.modules-dialog-notice')).toBe(REASONS.plan_changed)
			await press('.modules-dialog-ok')

			expect(calls.installModule).toHaveBeenCalledTimes(2)
			expect(calls.installModule).toHaveBeenLastCalledWith('virt', { plan_id: PLAN_ID_2, mode: 'update' })
		})

		it.each([
			['up_to_date', 'newer'],
			['downgrade', 'newer'],
			['unit_changed', 'foreign_unit'],
			['files_unverified', 'installed'],
			['not_installed', 'installed'],
		])('says the refusal %s in the window with the check that failed, and keeps the window open', async (code, check) => {
			await open(updatable())
			await updateDialog()
			const checks = UPDATE_CHECK_CODES.map(item => ({ code: item, ok: item !== check, detail: item === check ? 'x' : '' }))
			calls.installModule.mockImplementationOnce(failure(refused(code, { checks })))
			await press('.modules-dialog-ok')

			expect(dialog().exists()).toBe(true)
			expect(text('.modules-call-sentence')).toBe(REASONS[code])
			expect(text('.modules-call-code')).toBe(code)
			expect(wrapper.find('.modules-job').exists()).toBe(false)
			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeUndefined()
			// a list that is out of date is read again
			if (code === 'up_to_date' || code === 'not_installed')
				expect(calls.getModules).toHaveBeenCalledTimes(2)
		})
	})

	describe('the job', () => {
		it('lists the steps of an update with the current one marked, and says that the module is being updated', async () => {
			await updating('backup')

			expect(dialog().exists()).toBe(false)
			expect(text('.modules-job-title')).toBe('Updating Virtual machines')
			expect(texts('.modules-step .modules-step-text')).toEqual([
				STEP_TEXTS.update.packages,
				STEP_TEXTS.update.download,
				STEP_TEXTS.update.verify,
				STEP_TEXTS.update.unpack,
				STEP_TEXTS.update.backup,
				STEP_TEXTS.update.stop,
				STEP_TEXTS.update.swap,
				STEP_TEXTS.update.units,
				STEP_TEXTS.update.start,
				STEP_TEXTS.update.route,
			])
			expect(texts('.modules-step .modules-step-mark')).toEqual(['Done', 'Done', 'Done', 'Done', 'Now', 'Not yet', 'Not yet', 'Not yet', 'Not yet', 'Not yet'])
			expect(wrapper.find('.modules-progress').attributes('aria-label')).toBe('Progress of the update: step 5 of 10')
			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeDefined()
			expect(wrapper.find('.modules-remove').attributes('disabled')).toBeDefined()
		})

		it('says the end: the update to the version, the list read again with the new version, and nothing said to the dashboard', async () => {
			await updating('route')
			calls.getModules.mockImplementation(() => answer(updatable({ installed: { version: 'v0.1.3' }, update: { available: false, installed: 'v0.1.3', latest: 'v0.1.3' } })))
			await finished({ state: 'succeeded', step: 'done' }, { installed: true, version: 'v0.1.3' })

			expect(text('.modules-job-title')).toBe('The update of Virtual machines to v0.1.3 is done.')
			expect(text('.modules-job-group')).toBe('Finished')
			expect(text('.modules-next')).toBe(JOB_NEXT.succeededUpdate)
			expect(texts('.modules-step .modules-step-mark').every(mark => mark === 'Done')).toBe(true)
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
			expect(wrapper.find('.modules-kept').exists()).toBe(false)
			// the list is read again: the new version is the installed one and there is no badge any more
			expect(calls.getModules).toHaveBeenCalledTimes(2)
			expect(text('.modules-installed')).toBe('Installed version: v0.1.3')
			expect(wrapper.find('.modules-update-badge').exists()).toBe(false)
			expect(wrapper.find('.modules-update-button').exists()).toBe(false)
			expect(wrapper.find('.modules-remove').attributes('disabled')).toBeUndefined()
			// the module did not come or go: the cards of the dashboard are left alone
			expect(eventBus.$emit).not.toHaveBeenCalled()
		})

		it('says the end in French', async () => {
			i18n.global.locale = 'fr_fr'
			await updating('route')
			await finished({ state: 'succeeded', step: 'done' }, { installed: true, version: 'v0.1.3' })

			expect(text('.modules-job-title')).toBe('La mise à jour de Virtual machines vers v0.1.3 est terminée.')
		})

		it('says a failed update that was rolled back: where it stopped, why by the code, that the old version is back, and no command', async () => {
			await updating('swap')
			await finished({ state: 'failed', step: 'swap', code: 'swap_failed', undo: 'rolled_back' })

			expect(text('.modules-job-title')).toBe('The update of Virtual machines stopped.')
			expect(text('.modules-job-group')).toBe('Stopped')
			expect(text('.modules-stopped-at')).toBe(`It stopped at: ${STEP_TEXTS.update.swap}`)
			expect(text('.modules-reason-sentence')).toBe(`${REASONS.swap_failed} swap_failed`)
			expect(text('.modules-undo')).toBe(JOB_NEXT.updateBack)
			expect(texts('.modules-step .modules-step-mark')).toEqual(['Done', 'Done', 'Done', 'Done', 'Done', 'Done', 'Failed here', 'Not reached', 'Not reached', 'Not reached'])
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
			expect(wrapper.find('.modules-kept').exists()).toBe(false)
			expect(wrapper.find('.modules-job-close').exists()).toBe(true)
			// the buttons are back, and nothing was said to the dashboard
			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeUndefined()
			expect(eventBus.$emit).not.toHaveBeenCalled()
		})

		it.each([
			['backup_failed', 'backup'],
			['unit_changed', ''],
			['up_to_date', ''],
			['downgrade', ''],
			['version_unknown', ''],
			['files_unverified', ''],
			['files_unreadable', ''],
			['not_installed', ''],
			['manifest_invalid', 'unpack'],
		])('says the code %s of an update in its sentence', async (code, step) => {
			await updating('unpack')
			await finished({ state: step ? 'failed' : 'refused', step, code, undo: step ? 'rolled_back' : '' })

			expect(text('.modules-reason-sentence')).toBe(`${reasonMessage(code, { kind: 'update' }).key} ${code}`)
		})

		it('shows start and route as skipped when the service was stopped before the update, and keeps the headline', async () => {
			await updating('route')
			await finished({ state: 'succeeded', step: 'done' }, { installed: true, version: 'v0.1.3', unit: { active: false, enabled: false }, route: { answers: false } })

			expect(text('.modules-job-title')).toBe('The update of Virtual machines to v0.1.3 is done.')
			expect(texts('.modules-step .modules-step-mark')).toEqual(['Done', 'Done', 'Done', 'Done', 'Done', 'Done', 'Done', 'Done', 'Skipped: the service was stopped before the update', 'Skipped: the service was stopped before the update'])
		})

		it('tells the owner where the copy of the old version is kept, and to press Update or Remove again, when it could not be put back', async () => {
			await updating('swap')
			await finished({ state: 'failed', step: 'swap', code: 'recovery_incomplete', undo: 'rollback_incomplete' })

			expect(text('.modules-reason-sentence')).toBe(`${REASONS.recovery_incomplete} recovery_incomplete`)
			expect(text('.modules-undo')).toContain('a file was changed while the update ran')
			expect(text('.modules-undo')).toContain('press Update or Remove again')
			// the folder is given as text to copy, and nothing in the page deletes it
			expect(text('.modules-folder code')).toBe('/var/lib/casaos/modules/tmp/backup-virt')
			expect(wrapper.find('.modules-folder button').exists()).toBe(true)
			expect(text('.modules-folder-label')).toBe('The folder that is kept')
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
			expect(wrapper.find('.modules-kept').exists()).toBe(false)
		})

		it('says the refusal files_unreadable of an update in the words of an update, in the window', async () => {
			await open(updatable())
			await updateDialog()
			const checks = UPDATE_CHECK_CODES.map(item => ({ code: item, ok: item !== 'installed', detail: item === 'installed' ? 'files_missing' : '' }))
			calls.installModule.mockImplementationOnce(failure(refused('files_unreadable', { checks })))
			await press('.modules-dialog-ok')

			expect(text('.modules-call-sentence')).toBe(reasonMessage('files_unreadable', { kind: 'update' }).key)
			expect(text('.modules-call-items')).toContain('The record of the installed module cannot be read')
		})

		it('does not say that the old version is back when files were left as they are, names them to copy, and says to remove then install', async () => {
			await updating('swap')
			await finished({ state: 'failed', step: 'swap', code: 'swap_failed', undo: 'rolled_back_with_left', log_tail: ['left: /usr/bin/virt-tool'] })

			expect(text('.modules-undo')).toBe(JOB_NEXT.updateLeft)
			expect(text('.modules-undo')).not.toContain('is back')
			expect(text('.modules-left-label')).toBe('Files that were left as they are')
			expect(text('.modules-left')).toContain('left: /usr/bin/virt-tool')
			expect(wrapper.find('.modules-left button').exists()).toBe(true)
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
		})

		it('does not show the headline of a success when the update is installed but its backup stayed, and names the folder to copy', async () => {
			await updating('route')
			await finished({ state: 'failed', step: '', code: 'backup_not_dropped', undo: '' }, { installed: true, version: 'v0.1.3' })

			expect(text('.modules-job-title')).toBe('The update of Virtual machines is installed, but its backup is still there')
			expect(text('.modules-job-title')).not.toContain('is done')
			expect(text('.modules-undo')).toBe(JOB_NEXT.updateNotDropped)
			expect(text('.modules-folder code')).toBe('/var/lib/casaos/modules/tmp/backup-virt')
			expect(wrapper.findAll('.modules-step')).toHaveLength(0)
			expect(text('.modules-reason-sentence')).toBe(`${REASONS.backup_not_dropped} backup_not_dropped`)
			// nothing in the card deletes the folder
			expect(wrapper.find('.modules-folder').findAll('button').map(button => button.text())).toEqual(['Copy'])
		})

		it('does not say that the old version is back when the core does not say so', async () => {
			await updating('swap')
			await finished({ state: 'failed', step: 'swap', code: 'swap_failed', undo: '' })

			expect(text('.modules-undo')).toBe(JOB_NEXT.updateUnknown)
		})

		it('tells the owner of an update that was cut short to press Update or Remove again', async () => {
			await updating('swap')
			await finished({ state: 'interrupted', step: 'swap' })

			expect(text('.modules-job-title')).toBe('The job on Virtual machines was cut short.')
			expect(text('.modules-undo')).toBe(JOB_NEXT.updateCut)
			expect(wrapper.find('.modules-advice').exists()).toBe(false)
			expect(wrapper.find('.modules-job-close').exists()).toBe(true)
		})

		it('says that the old version is being put back while it is, in one line and with no list of steps', async () => {
			await updating('swap')
			serveJob(updateJob({ state: 'running', step: 'rollback_restore' }))
			await tick(MODULE_POLL_MS.running)

			expect(text('.modules-job-title')).toBe('Putting the old version of Virtual machines back')
			expect(text('.modules-rollback')).toBe('Putting the old version back.')
			expect(wrapper.findAll('.modules-step')).toHaveLength(0)
			expect(wrapper.find('.modules-progress').exists()).toBe(false)
			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeDefined()
			expect(wrapper.find('.modules-live').text()).toBe('Virtual machines: putting the old version back.')
		})

		it('follows an update that was started before the window was opened', async () => {
			serveJob(updateJob({ state: 'running', step: 'stop' }))
			await open(updatable())

			expect(text('.modules-job-title')).toBe('Updating Virtual machines')
			expect(text('.modules-step.is-current .modules-step-text')).toBe(STEP_TEXTS.update.stop)
			expect(wrapper.find('.modules-update-button').attributes('disabled')).toBeDefined()
		})

		it('shows the log as text', async () => {
			await updating('swap')
			await finished({ state: 'failed', step: 'swap', code: 'swap_failed', undo: 'rolled_back', log_tail: ['<img src=x onerror=alert(1)>'] })

			expect(wrapper.find('.modules-log img').exists()).toBe(false)
			expect(text('.modules-log-text')).toContain('<img src=x onerror=alert(1)>')
		})
	})
})
