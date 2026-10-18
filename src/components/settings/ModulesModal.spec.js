// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy, { BModal } from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import ModulesModal from './ModulesModal.vue'
import { MODULE_POLL_MS, REASONS, STEP_TEXTS, TEXT, TIERS } from './osModules'
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
		global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } },
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
		expect(text('.modules-tier-sentence')).toBe('Maintained by the community, not proved on a real machine by ReCasaOS.')
		expect(text('.modules-offered')).toBe('Version offered: v0.1.0')
		expect(wrapper.find('.modules-install').exists()).toBe(true)
		expect(wrapper.find('.modules-install').text()).toBe('Install')
		expect(wrapper.find('.modules-remove').exists()).toBe(false)
		expect(wrapper.find('.modules-job').exists()).toBe(false)
	})

	it('says a module of the core in its words', async () => {
		await open(listRaw([moduleRaw({ tier: 'core' })]))

		expect(text('.modules-tier')).toBe('Core')
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

			expect(text('.modules-list-error-sentence')).toBe('The request could not be completed. Try again.')
			expect(wrapper.find('.modules-list-error').attributes('role')).toBe('alert')
			expect(wrapper.find('.modules-card').exists()).toBe(false)

			calls.getModules.mockImplementation(() => answer(listRaw()))
			await press('.modules-reload')

			expect(calls.getModules).toHaveBeenCalledTimes(2)
			expect(wrapper.find('.modules-list-error').exists()).toBe(false)
			expect(wrapper.find('.modules-card').exists()).toBe(true)
			// and it looks for a job that is already running, which it could not before
			expect(calls.getModuleStatus).toHaveBeenCalledWith('virt')
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
			expect(calls.getModuleStatus).toHaveBeenCalledWith('constructor')
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
		expect(text('.modules-dialog-tier')).toContain('Maintained by the community, not proved on a real machine by ReCasaOS.')
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
		expect(text('.modules-dialog .modules-call-sentence')).toBe('The request could not be completed. Try again.')
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
		expect(text('.modules-job-note')).toBe('A job is running. The buttons come back when it ends.')
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
		expect(text('.modules-dialog .modules-call-detail')).toBe('Reported by the core: an upgrade of the operating system is open')
		await press('.modules-dialog-cancel')

		expect(text('.modules-busy-sentence')).toBe(REASONS.busy)
		expect(text('.modules-busy-detail')).toBe('Reported by the core: an upgrade of the operating system is open')
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
		expect(text('.modules-busy-detail')).toBe('Reported by the core: dpkg is locked')
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
			expect(text('.modules-dialog .modules-call-sentence')).toContain('The request took too long. It may have gone through')
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

		it('says when the job is done: the steps are done, the card appears where the service answers, and the buttons come back', async () => {
			await running('route')
			serveJob(jobAnswer({ state: 'succeeded', step: 'done' }, { installed: true }))
			calls.getModules.mockImplementation(() => answer(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])))
			await tick(MODULE_POLL_MS.running)

			expect(text('.modules-job-title')).toBe('Virtual machines is installed.')
			expect(text('.modules-job-group')).toBe('Finished')
			expect(text('.modules-next')).toBe('The card of the module appears on the dashboard once its service answers.')
			expect(wrapper.findAll('.modules-step.is-done')).toHaveLength(8)
			expect(wrapper.find('.modules-progress').exists()).toBe(false)
			expect(text('.modules-live')).toBe('Virtual machines is installed.')
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

			expect(text('.modules-outage-message')).toBe('The machine is restarting. This page goes on by itself.')
			expect(text('.modules-outage-elapsed')).toMatch(/^No answer for \d+ s\.$/)
			expect(text('.modules-live')).toBe('The machine is restarting. This page goes on by itself.')

			await tick(RESTART_LOOK_AFTER_MS)
			expect(text('.modules-outage-message')).toContain('The machine has not answered for')
			expect(text('.modules-outage-message')).toContain('Look at its screen or console')
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
			expect(text('.modules-undo')).toBe('What the install had done was undone. Mend the cause, then install again.')
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

			expect(text('.modules-kept-some')).toBe('These packages are still on the machine: qemu-utils, libvirt-daemon-system.')
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
			expect(text('.modules-undo')).toBe('Nothing was undone.')
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

		it('looks for the job of each module in turn, and stops at the one that runs', async () => {
			calls.getModuleStatus.mockReset()
			calls.getModuleStatus.mockImplementation(name => answer(name === 'b' ? jobAnswer({ name: 'b', state: 'running', step: 'packages' }) : { job: jobRaw({ name, state: 'idle', step: '' }), status: {} }))
			await open(listRaw([moduleRaw({ name: 'a', title: 'A' }), moduleRaw({ name: 'b', title: 'B' }), moduleRaw({ name: 'c', title: 'C' })]))

			expect(calls.getModuleStatus.mock.calls.slice(0, 2).map(call => call[0])).toEqual(['a', 'b'])
			expect(card('b').find('.modules-job').exists()).toBe(true)
			expect(card('a').find('.modules-job').exists()).toBe(false)
			expect(card('c').find('.modules-job').exists()).toBe(false)
			// the one after the job that runs is not asked about
			expect(calls.getModuleStatus.mock.calls.map(call => call[0])).not.toContain('c')
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

		it('tells the console to finish a job that was cut short before the window was opened', async () => {
			serveJob(jobAnswer({ state: 'interrupted', step: 'download' }))
			await open()

			expect(text('.modules-advice-command code')).toBe('casaos module remove virt')
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

		expect(text('.modules-job-title')).toBe('Virtual machines is removed.')
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
		expect(text('.modules-reason-sentence')).toContain(REASONS.remove_incomplete)
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

		expect(text('.modules-busy-detail')).toBe('Reported by the core: a package manager holds the lock')
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

		expect(text('.modules-tier-sentence')).toBe('Maintenu par la communauté, non éprouvé sur une vraie machine par ReCasaOS.')
		expect(text('.modules-offered')).toBe('Version proposée : v0.1.0')
		expect(wrapper.find('.modules-install').text()).toBe('Installer')
	})
})
