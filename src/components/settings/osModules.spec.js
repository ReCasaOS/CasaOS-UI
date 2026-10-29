import { describe, expect, it } from 'vitest'
import {
	CHECKS,
	CHECK_UNKNOWN,
	JOB_LIVE,
	JOB_NEXT,
	JOB_STATES,
	JOB_TITLES,
	MODULE_KEYS,
	MODULE_NAME,
	MODULE_POLL_MS,
	PLAN_ID,
	REASONS,
	REASON_UNKNOWN,
	ROLLBACK,
	STEPS,
	STEP_MARKS,
	STEP_TEXTS,
	TEXT,
	TIERS,
	formatBytes,
	installBody,
	jobAnnouncement,
	jobView,
	listView,
	moduleFailure,
	moduleOutage,
	modulePlanView,
	moduleStatusFailure,
	nextJobPoll,
	reasonMessage,
} from './osModules'
import { POLL_MS, RESTART_LOOK_AFTER_MS } from './osUpgrade'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

// ---- the core's words, pinned here ----------------------------------------------------------------------------------------
// These lists MIRROR the core (CasaOS pkg/modulecmd, pkg/osmodule, service/system_module.go): a code added to the core without a sentence in
// osModules.js, or dropped from it, is noticed.

// pkg/modulecmd/install.go Step*, remove.go Step*
const INSTALL_STEPS = ['packages', 'download', 'verify', 'unpack', 'units', 'manifest', 'start', 'route', 'done']
const REMOVE_STEPS = ['stop', 'files', 'manifest', 'reload', 'done']
// pkg/modulecmd/jobstate.go Job*
const JOB_STATE_NAMES = ['idle', 'running', 'succeeded', 'refused', 'failed', 'interrupted']
// pkg/osmodule/plan.go Check*, in the order the plan lists them
const CHECK_CODES = ['catalogue', 'os', 'arch', 'recasaos', 'already_installed', 'foreign_unit', 'busy', 'dpkg_state', 'disk', 'apt']
// pkg/osmodule/plan.go: the code a plan is refused with (the code of the check, but for the disk and apt checks, which say more)
const PLAN_REFUSALS = ['catalogue', 'os', 'arch', 'recasaos', 'already_installed', 'foreign_unit', 'busy', 'dpkg_state', 'disk_short', 'disk_unknown', 'apt_missing', 'apt_failed', 'apt_removes', 'apt_downgrades', 'held_package', 'package_not_exact']
// pkg/modulecmd/install.go Code*
const RUN_CODES = ['not_root', 'busy', 'plan_changed', 'confirmation_needed', 'declined', 'not_installed', 'log_unwritable', 'lock_failed', 'files_unreadable', 'packages_failed', 'dpkg_broken', 'held_package', 'download_failed', 'download_too_large', 'checksum_mismatch', 'unpack_failed', 'units_failed', 'manifest_invalid', 'manifest_mismatch', 'manifest_write_failed', 'start_failed', 'route_timeout', 'interrupted', 'unit_not_stopped', 'remove_incomplete', 'tmp_unusable', 'state_unsafe', 'internal_error']
// pkg/osmodule/unpack.go: Unpack*, FileExists
const UNPACK_CODES = ['unpack_path', 'file_exists', 'unpack_limits', 'unpack_corrupt']
// service/system_module.go Module*, and route/v1/system_module.go (a failure that no refusal covers)
const API_CODES = ['bad_request', 'not_root', 'unsupported', 'busy', 'plan_changed', 'not_installed', 'plan_timeout', 'start_failed', 'internal']
// pkg/modulecmd/query.go: the checks that say no to a system in the list (and a module that the catalogue no longer has)
const SYSTEM_REASONS = ['os', 'arch', 'recasaos', 'catalogue']
// the update of a module (docs/os-modules.md, "Updating an installed module"): the steps, the checks in their order, the codes of a plan that is refused
// and the codes of a job that failed
const UPDATE_STEPS = ['packages', 'download', 'verify', 'unpack', 'backup', 'stop', 'swap', 'units', 'start', 'route', 'done']
const UPDATE_CHECK_CODES = ['catalogue', 'os', 'arch', 'recasaos', 'installed', 'newer', 'foreign_unit', 'busy', 'dpkg_state', 'disk', 'apt']
const UPDATE_REFUSALS = ['catalogue', 'os', 'arch', 'recasaos', 'not_installed', 'manifest_invalid', 'files_unreadable', 'files_unverified', 'version_unknown', 'up_to_date', 'downgrade', 'foreign_unit', 'unit_changed', 'busy', 'dpkg_state', 'disk_short', 'disk_unknown', 'apt_missing', 'apt_failed', 'apt_removes', 'apt_downgrades', 'held_package', 'package_not_exact']
const UPDATE_JOB_CODES = ['backup_failed', 'swap_failed', 'recovery_incomplete', 'backup_not_dropped', 'unit_not_stopped', 'unpack_corrupt', 'unpack_path', 'unpack_limits', 'file_exists', 'manifest_invalid', 'manifest_mismatch', 'start_failed', 'route_timeout', 'interrupted']
const ALL_CODES = [...new Set([...PLAN_REFUSALS, ...RUN_CODES, ...UNPACK_CODES, ...API_CODES, ...SYSTEM_REASONS, ...UPDATE_REFUSALS, ...UPDATE_JOB_CODES])]

// ---- what the core sends, and what is hostile ------------------------------------------------------------------------------

// the characters that a text must not keep: the controls, and the marks that turn a text round or show nothing
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028-\u202E\u2060\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/u
const HOSTILE = [
	'<img src=x onerror=alert(1)>',
	'<script>alert(1)</script>',
	'a\u0000b\u0007c',
	'rtl\u202Eevil\u2066x',
	'zero\u200Bwidth\uFEFFmark',
	'tag\u{E0041}char',
	'line\u2028sep',
	'x'.repeat(100000),
	// eslint-disable-next-line no-template-curly-in-string
	'{{ 7 * 7 }} ${process.env} @:Operating system | x',
	'https://user:secret@example.com/path?token=abc',
]
const NOT_TEXT = [null, undefined, 0, 7, true, false, [], {}, ['x'], { a: 1 }, () => 'x']
// what is not a list of lines: a list with a line in it is one
const NOT_A_LIST = NOT_TEXT.filter(value => !(Array.isArray(value) && value.length))

const PLAN_ID_OK = `m1-${'ab'.repeat(16)}`
const URL_OK = 'https://github.com/ReCasaOS/CasaOS-VirtManagement/releases/download/v0.1.0/linux-amd64-casaos-virt-management-v0.1.0.tar.gz'
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
		plan_id: PLAN_ID_OK,
		...changes,
	}
}
const plan = (changes, options) => modulePlanView(planRaw(changes), { name: 'virt', ...options })

function moduleRaw(changes = {}) {
	return {
		name: 'virt',
		title: 'Virtual machines',
		description: 'Create and run virtual machines with libvirt and QEMU.',
		tier: 'community',
		tag: 'v0.1.0',
		catalogue: true,
		installed: null,
		system: { supported: true, reasons: [] },
		...changes,
	}
}
const listRaw = (modules = [moduleRaw()], catalogue = { ok: true }) => ({ catalogue, modules })

const jobRaw = (changes = {}) => ({ name: 'virt', state: 'running', step: 'download', code: '', undo: '', kept_packages: null, started_at: '2026-10-18T10:00:00Z', ended_at: '', log_tail: [], ...changes })
const answer = (changes = {}, status = { installed: false }) => ({ job: jobRaw(changes), status })
const job = (changes, options) => jobView(answer(changes, options?.status), { name: 'virt', title: 'Virtual machines', ...options })

// a refusal of the core: a 409 with its code in data.error_code
const refusal = (error_code, data, status = 409) => ({ response: { status, data: { success: status, message: 'x', data: { error_code, error: 'A sentence of the core, in English', data } } } })

// every message of a view: { key, params, keys? }, and the keys alone
function keysIn(view) {
	const keys = []
	const message = (item) => {
		if (item)
			keys.push(item.key, ...(item.keys ?? []).map(name => item.params[name]))
	}
	for (const name of ['title', 'live', 'reason', 'undoText', 'next', 'rollbackStep', 'stoppedAt'])
		message(view[name])
	message(view.progress?.label)
	keys.push(view.group)
	for (const step of view.steps)
		keys.push(step.text, step.markText)
	return keys.filter(Boolean)
}

// ---- the sentences ---------------------------------------------------------------------------------------------------------

describe('the sentences of the codes', () => {
	it.each(ALL_CODES)('says %s in a sentence of its own', (code) => {
		const message = reasonMessage(code, { data: { field: 'plan_id' } })
		expect(message.key).not.toBe(REASON_UNKNOWN)
		expect(MODULE_KEYS).toContain(message.key)
		expect(en[message.key]).toBe(message.key)
		expect(fr[message.key]).toBeTruthy()
	})

	it('has no sentence that the core does not send', () => {
		for (const code of Object.keys(REASONS))
			expect(ALL_CODES, code).toContain(code)
	})

	it('says an unknown code as one, with the code as text', () => {
		expect(reasonMessage('brand_new')).toEqual({ key: REASON_UNKNOWN, params: { code: 'brand_new' } })
		expect(reasonMessage('')).toEqual({ key: REASON_UNKNOWN, params: { code: '?' } })
		expect(reasonMessage(undefined).params.code).toBe('?')
	})

	// a code named like a method of Object is not one of the table
	it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])('does not take %s for a code', (code) => {
		expect(reasonMessage(code).key).toBe(REASON_UNKNOWN)
	})

	it('cuts the text of an unknown code', () => {
		expect(reasonMessage('x'.repeat(10000)).params.code).toHaveLength(60)
		expect(reasonMessage('a\u202Eb').params.code).toBe('a b')
	})

	it('says start_failed by the step that it came with', () => {
		expect(reasonMessage('start_failed', { step: 'start' }).key).toBe(REASONS.start_failed.steps.start)
		expect(reasonMessage('start_failed', { step: '' }).key).toBe(REASONS.start_failed.text)
		expect(reasonMessage('start_failed', { step: 'download' }).key).toBe(REASONS.start_failed.text)
		expect(reasonMessage('start_failed', { step: '__proto__' }).key).toBe(REASONS.start_failed.text)
	})

	it('names the field of a request that was not accepted, when the core says it, and cleans it', () => {
		expect(reasonMessage('bad_request', { data: { field: 'plan_id' } }).params).toEqual({ field: 'plan_id' })
		expect(reasonMessage('bad_request', { data: {} }).params).toEqual({})
		expect(reasonMessage('bad_request', { data: { field: '<b>x</b>\u0000' } }).params.field).toBe('<b>x</b>')
		expect(reasonMessage('bad_request', { data: null }).key).toBe(REASONS.bad_request[1])
	})

	it('ends every sentence that has placeholders on one that has none', () => {
		expect(REASONS.bad_request.at(-1)).not.toMatch(/\{\w+\}/)
	})

	// the writing phase can have written some of the files before it stopped: what was written is said by the undo of the job, and not by the code
	it.each(['unpack_path', 'file_exists', 'unpack_limits', 'unpack_corrupt'])('does not say, with %s, that nothing was written', (code) => {
		expect(REASONS[code]).not.toMatch(/nothing was written/i)
	})

	it('does not tell the person to update apt when apt names unmet dependencies', () => {
		expect(REASONS.apt_failed).toMatch(/unmet dependencies/)
		expect(REASONS.apt_failed).toMatch(/will not help/)
	})

	it('says a download that is not the one the release expects as a module that was not installed, and not as one to mend', () => {
		expect(REASONS.checksum_mismatch).toBe('The downloaded file is not the one this release expects, so the module was not installed. Try again later; if it happens again, report it.')
	})
})

// ---- the list --------------------------------------------------------------------------------------------------------------

describe('the view of the list', () => {
	it('shows a module of the catalogue that can be installed', () => {
		const view = listView(listRaw())
		expect(view.ok).toBe(true)
		expect(view.modules).toHaveLength(1)
		expect(view.modules[0]).toMatchObject({
			name: 'virt',
			title: 'Virtual machines',
			description: 'Create and run virtual machines with libvirt and QEMU.',
			tag: 'v0.1.0',
			installed: null,
			supported: true,
			reasons: [],
			broken: '',
			inCatalogue: true,
			canInstall: true,
			canRemove: false,
		})
		expect(view.modules[0].tier).toMatchObject({ id: 'community', label: 'Community', sentence: TIERS.community.sentence })
	})

	it.each([
		['installed', { installed: { version: 'v0.1.0' } }, { canInstall: false, canRemove: true }],
		['installed with no version', { installed: { version: null } }, { canInstall: false, canRemove: true }],
		['installed with a version that is not a tag', { installed: { version: '<b>1</b>' } }, { canInstall: false, canRemove: true }],
		['broken', { broken: 'manifest_invalid' }, { canInstall: false, canRemove: true }],
		['broken with a word that is not text', { broken: 5 }, { canInstall: false, canRemove: true }],
		['not supported by this system', { system: { supported: false, reasons: ['os'] } }, { canInstall: false, canRemove: false }],
		['said supported with reasons against it', { system: { supported: true, reasons: ['arch'] } }, { canInstall: false, canRemove: false }],
		['said not supported with no reason', { system: { supported: false, reasons: [] } }, { canInstall: false, canRemove: false }],
		['with no system', { system: undefined }, { canInstall: false, canRemove: false }],
		['with a system that is not an object', { system: 'yes' }, { canInstall: false, canRemove: false }],
		['no longer in the catalogue and installed', { catalogue: false, installed: { version: 'v0.1.0' }, system: { supported: false, reasons: ['catalogue'] } }, { canInstall: false, canRemove: true, inCatalogue: false }],
		['no longer in the catalogue, not installed', { catalogue: false }, { canInstall: false, canRemove: false, inCatalogue: false }],
		['with a catalogue flag that is not a boolean', { catalogue: 'no' }, { canInstall: true, inCatalogue: true }],
	])('tells a module that is %s', (_, changes, expected) => {
		expect(listView(listRaw([moduleRaw(changes)])).modules[0]).toMatchObject(expected)
	})

	it('reads the installed version only as a tag', () => {
		expect(listView(listRaw([moduleRaw({ installed: { version: 'v0.1.0' } })])).modules[0].installed).toEqual({ version: 'v0.1.0' })
		expect(listView(listRaw([moduleRaw({ installed: { version: null } })])).modules[0].installed).toEqual({ version: '' })
		expect(listView(listRaw([moduleRaw({ installed: { version: '1.0' } })])).modules[0].installed).toEqual({ version: '' })
	})

	it('says the reasons of a system that cannot have a module, by code', () => {
		const [module] = listView(listRaw([moduleRaw({ system: { supported: false, reasons: ['os', 'arch', 'recasaos', 'brand_new'] } })])).modules
		expect(module.reasons.map(reason => reason.code)).toEqual(['os', 'arch', 'recasaos', 'brand_new'])
		expect(module.reasons.map(reason => reason.message.key)).toEqual([REASONS.os, REASONS.arch, REASONS.recasaos, REASON_UNKNOWN])
		expect(module.reasons[3].message.params).toEqual({ code: 'brand_new' })
	})

	it('keeps at most 8 reasons, and only the ones that are text', () => {
		const reasons = [...Array.from({ length: 30 }, () => 'os'), 5]
		expect(listView(listRaw([moduleRaw({ system: { supported: false, reasons } })])).modules[0].reasons).toHaveLength(8)
		expect(listView(listRaw([moduleRaw({ system: { supported: false, reasons: [5, null, {}, 'os'] } })])).modules[0].reasons.map(reason => reason.code)).toEqual(['os'])
	})

	describe('says the kind of module', () => {
		it.each(Object.keys(TIERS))('%s with its label and its sentence', (tier) => {
			expect(listView(listRaw([moduleRaw({ tier })])).modules[0].tier).toEqual({ id: tier, ...TIERS[tier], raw: '' })
		})

		it('says the community sentence in plain words: tested against a simulated machine only', () => {
			expect(TIERS.community.sentence).toBe('Tested only against a simulated machine, not a real one.')
			expect(TIERS.community.sentence).not.toMatch(/maintained|proved/i)
		})

		it('says the core sentence, and names the tier by who maintains it', () => {
			expect(TIERS.core.sentence).toBe('Proved on a real machine by ReCasaOS.')
			expect(TIERS.core.label).toBe('Maintained by ReCasaOS')
		})

		it.each(['beta', '<b>core</b>', 'Core', '__proto__', 'constructor', 'x'.repeat(1000)])('says %j as a kind that it does not know, and never as proved', (tier) => {
			const { tier: got } = listView(listRaw([moduleRaw({ tier })])).modules[0]
			expect(got.id).toBe('unknown')
			expect(got.sentence).toMatch(/has not proved it/)
			expect(got.raw.length).toBeLessThanOrEqual(20)
		})

		it.each([undefined, null, '', 5, {}, []])('says nothing of a kind that is %j', (tier) => {
			expect(listView(listRaw([moduleRaw({ tier })])).modules[0].tier).toBeNull()
		})
	})

	describe('when the catalogue is not ok', () => {
		it.each([
			['none', { ok: false, error: 'none' }],
			['unreadable', { ok: false, error: 'unreadable' }],
			['invalid', { ok: false, error: 'invalid', detail: 'modules[0].tier value' }],
			['not said', null],
			['not an object', 'ok'],
			['ok in a word that is not true', { ok: 'true' }],
			['ok as a number', { ok: 1 }],
		])('offers nothing to install when it is %s, whatever the list says', (_, catalogue) => {
			const view = listView(listRaw([moduleRaw(), moduleRaw({ name: 'other' })], catalogue))
			expect(view.ok).toBe(false)
			expect(view.modules.some(module => module.canInstall)).toBe(false)
			expect(view.modules).toEqual([])
		})

		it('keeps what is installed, so that it can be removed', () => {
			const view = listView(listRaw([moduleRaw({ catalogue: false, installed: { version: 'v0.1.0' }, system: { supported: false, reasons: ['catalogue'] } }), moduleRaw({ name: 'other' })], { ok: false, error: 'invalid' }))
			expect(view.modules.map(module => module.name)).toEqual(['virt'])
			expect(view.modules[0]).toMatchObject({ canInstall: false, canRemove: true })
			expect(view.error).toBe('invalid')
		})

		it('says the error as text, cut', () => {
			expect(listView(listRaw([], { ok: false, error: '<b>x</b>\u0000'.repeat(20) })).error.length).toBeLessThanOrEqual(20)
			expect(listView(listRaw([], { ok: false, error: 5 })).error).toBe('')
		})
	})

	it.each([null, undefined, 'list', 5, [], true])('is nothing for %j', (raw) => {
		expect(listView(raw)).toBeNull()
	})

	it('survives a list whose modules are not a list', () => {
		for (const modules of [null, 'virt', 5, {}, { length: 1 }])
			expect(listView({ catalogue: { ok: true }, modules }).modules).toEqual([])
	})

	it('drops what is not a module, a name that is not a name, and a module twice', () => {
		const names = ['', 'Virt', '1virt', 'virt_x', '../virt', 'virt ', 'v'.repeat(33), '__proto__', 5, null, undefined, {}, ['virt']]
		const modules = [...names.map(name => moduleRaw({ name })), null, 'virt', 5, [], moduleRaw({ name: 'a' }), moduleRaw({ name: 'a', title: 'second' }), moduleRaw({ name: 'b' })]
		const view = listView(listRaw(modules))
		expect(view.modules.map(module => module.name)).toEqual(['a', 'b'])
		expect(view.modules[0].title).toBe('Virtual machines')
	})

	it('accepts a name like a method of Object, which is a name', () => {
		expect(listView(listRaw([moduleRaw({ name: 'constructor' })])).modules.map(module => module.name)).toEqual(['constructor'])
	})

	it('keeps at most 64 modules', () => {
		const modules = Array.from({ length: 200 }, (_, index) => moduleRaw({ name: `m${index}` }))
		expect(listView(listRaw(modules)).modules).toHaveLength(64)
	})

	it.each(HOSTILE)('shows %#: the text of the title, the description and the kind as text, cleaned and cut', (value) => {
		const [module] = listView(listRaw([moduleRaw({ title: value, description: value, tier: value, tag: value, broken: value, installed: { version: value } })])).modules
		for (const text of [module.title, module.description, module.tier.raw, module.broken])
			expect(text).not.toMatch(UNSAFE)
		expect(module.title.length).toBeLessThanOrEqual(80)
		expect(module.description.length).toBeLessThanOrEqual(400)
		expect(module.tag).toBe('')
		expect(module.installed).toEqual({ version: '' })
	})

	it('keeps the text of HTML as it is, to be shown as text', () => {
		const [module] = listView(listRaw([moduleRaw({ title: '<b>Virtual</b>', description: '<img src=x onerror=alert(1)> and more' })])).modules
		expect(module.title).toBe('<b>Virtual</b>')
		expect(module.description).toBe('<img src=x onerror=alert(1)> and more')
	})

	it.each(NOT_TEXT)('takes %j for a title and a description as nothing, and names the module by its name', (value) => {
		const [module] = listView(listRaw([moduleRaw({ title: value, description: value })])).modules
		expect(module.title).toBe('virt')
		expect(module.description).toBe('')
	})

	it('survives a list that comes from JSON with a key __proto__', () => {
		const raw = JSON.parse('{"catalogue":{"ok":true,"__proto__":{"ok":false}},"modules":[{"name":"virt","title":"T","system":{"supported":true,"reasons":[],"__proto__":{"supported":false}},"installed":null,"__proto__":{"installed":{"version":"v1.0.0"}}}],"__proto__":{"modules":[]}}')
		const view = listView(raw)
		expect(view.ok).toBe(true)
		expect(view.modules[0]).toMatchObject({ name: 'virt', canInstall: true, installed: null })
		expect({}.polluted).toBeUndefined()
	})
})

// ---- the plan --------------------------------------------------------------------------------------------------------------

describe('the view of the plan', () => {
	it('can install a plan that is not refused, whose checks all passed, and whose id is the core\'s', () => {
		const view = plan()
		expect(view.installable).toBe(true)
		expect(view.refused).toBe('')
		expect(view.incomplete).toBe(false)
		expect(view.planId).toBe(PLAN_ID_OK)
		expect(view.packages.install).toEqual(['qemu-utils', 'libvirt-daemon-system'])
		expect(view.packages.upgrade).toEqual(['libc6'])
		expect(view.checks.map(check => check.code)).toEqual(CHECK_CODES)
		expect(view.tier.id).toBe('community')
	})

	it('says the sizes in readable units, rounded up, in the language', () => {
		expect(plan().packages).toMatchObject({ downloadText: '50 MiB', extraText: '200 MiB', known: true })
		expect(plan().archive).toMatchObject({ url: URL_OK, bytesText: '3 MiB' })
		expect(plan({ packages: { to_install: [], to_upgrade: [], download_bytes: 1610612736, extra_bytes: 100, known: true } }).packages).toMatchObject({ downloadText: '1.5 GiB', extraText: '100 B' })
		expect(plan({}, { locale: 'fr_fr' }).packages).toMatchObject({ downloadText: '50 Mio', extraText: '200 Mio' })
	})

	it('says no size that apt did not give', () => {
		const view = plan({ packages: { to_install: ['a'], to_upgrade: [], download_bytes: 1048576, extra_bytes: 1048576, known: false } })
		expect(view.packages).toMatchObject({ known: false, downloadText: '', extraText: '' })
		expect(plan({ archive: { url: URL_OK } }).archive.bytesText).toBe('')
	})

	it.each(PLAN_REFUSALS)('cannot install a plan that is refused with %s, and says why', (code) => {
		const view = plan({ refused: code, plan_id: '' })
		expect(view.installable).toBe(false)
		expect(view.refused).toBe(code)
		expect(view.refusedMessage.key).toBe(REASONS[code])
	})

	it('cannot install a plan that is refused, whatever else is in it', () => {
		expect(plan({ refused: 'os' }).installable).toBe(false)
		expect(plan({ refused: 'os' }).planId).toBe(PLAN_ID_OK)
	})

	it.each([5, true, {}, ['os'], 'x'.repeat(1000), '<b>', '__proto__'])('cannot install a plan whose refusal is %j, and says it as a code it does not know', (refused) => {
		const view = plan({ refused })
		expect(view.installable).toBe(false)
		expect(view.refused).not.toBe('')
		expect(view.refusedMessage.key).toBe(REASON_UNKNOWN)
	})

	it.each(['', null, undefined])('takes %j for no refusal', (refused) => {
		expect(plan({ refused }).refused).toBe('')
	})

	it.each(['', 'm1-', `m1-${'ab'.repeat(15)}`, `m1-${'AB'.repeat(16)}`, `m2-${'ab'.repeat(16)}`, `m1-${'ab'.repeat(17)}`, `${PLAN_ID_OK} `, `x${PLAN_ID_OK}`, `m1-${'zz'.repeat(16)}`, 5, null, undefined, {}, ['x'], '<b>'])('cannot install with the plan id %j', (plan_id) => {
		const view = plan({ plan_id })
		expect(view.installable).toBe(false)
		expect(view.planId).toBe('')
		expect(installBody(view)).toBeNull()
	})

	it('cannot install a plan with a check that did not pass, even if it says no refusal, and says that it could not check everything', () => {
		const checks = okChecks().map(check => check.code === 'disk' ? { ...check, ok: false, detail: 'short' } : check)
		const view = plan({ checks })
		expect(view.installable).toBe(false)
		expect(view.incomplete).toBe(true)
	})

	// "Read it, then confirm" is for a plan that has a button: one that cannot be installed says why
	it('cannot install a plan whose id is not the core\'s, and says that, and not that there is something to confirm', () => {
		for (const plan_id of ['', 'm1-', 5, null, undefined]) {
			const view = plan({ plan_id })
			expect(view.installable).toBe(false)
			expect(view.noId).toBe(true)
			expect(view.incomplete).toBe(false)
			expect(view.noList).toBe(false)
		}
		expect(plan().noId).toBe(false)
		expect(plan({ refused: 'os', plan_id: '' }).noId).toBe(false)
		expect(plan({ plan_id: '', checks: [] }).noId).toBe(false)
	})

	it('cannot install a plan that does not list the packages that apt installs, and does not say that apt installs none', () => {
		for (const packages of [undefined, null, 'x', 5, [], {}, { to_install: null, known: true }, { to_install: 'qemu-utils', known: true }, { to_upgrade: [], known: true }]) {
			const view = plan({ packages })
			expect(view.installable, JSON.stringify(packages)).toBe(false)
			expect(view.packages.listed).toBe(false)
			expect(view.noList).toBe(true)
			expect(installBody(view)).toBeNull()
		}
		// an empty list that the plan gives is a plan that installs nothing, and that is something it can say
		const none = plan({ packages: { to_install: [], to_upgrade: [], download_bytes: 0, extra_bytes: 0, known: true } })
		expect(none.packages.listed).toBe(true)
		expect(none.noList).toBe(false)
		expect(none.installable).toBe(true)
	})

	it('says the version of the module that the plan installs, as a tag and nothing else', () => {
		expect(plan().tag).toBe('v0.1.0')
		for (const tag of ['0.1.0', 'v0.1', '<b>', 5, null, undefined, 'v0.1.0 '])
			expect(plan({ tag }).tag).toBe('')
	})

	it('cannot install a plan with no check at all', () => {
		for (const checks of [[], undefined, null, 'ok', {}, [null, 5]]) {
			const view = plan({ checks })
			expect(view.installable).toBe(false)
			expect(view.incomplete).toBe(true)
		}
	})

	it('cannot install a plan whose check says ok in a word that is not true', () => {
		for (const ok of ['true', 1, 'yes', {}, null, undefined]) {
			const checks = okChecks().map(check => check.code === 'os' ? { ...check, ok } : check)
			expect(plan({ checks }).installable).toBe(false)
		}
	})

	it('puts the checks that failed first, then the ones that were not made, each by its mark', () => {
		const checks = [
			{ code: 'catalogue', ok: true, detail: '' },
			{ code: 'os', ok: false, detail: 'unsupported debian:11' },
			{ code: 'arch', ok: true, detail: '' },
			{ code: 'recasaos', ok: false, detail: 'not_checked' },
			{ code: 'busy', ok: false, detail: 'not_checked: needs root, the install checks it as root' },
			{ code: 'disk', ok: false, detail: 'low' },
		]
		const view = plan({ refused: 'os', checks })
		expect(view.checks.map(check => [check.code, check.mark])).toEqual([['os', 'failed'], ['disk', 'failed'], ['recasaos', 'notChecked'], ['busy', 'notChecked'], ['catalogue', 'passed'], ['arch', 'passed']])
		const os = view.checks[0]
		expect(os.message.key).toBe(REASONS.os)
		expect(os.detail).toBe('unsupported debian:11')
		expect(view.checks.find(check => check.code === 'disk').message.key).toBe(REASONS.disk_short)
		// a check that was not made says nothing of why: it is not the reason
		expect(view.checks.find(check => check.code === 'recasaos')).toMatchObject({ message: null, detail: '', markText: TEXT.marks.notChecked })
	})

	it.each([['disk_unknown', 'disk'], ['apt_failed', 'apt'], ['held_package', 'apt'], ['package_not_exact', 'apt']])('says a failed %s check by the refusal of the plan (%s)', (refused, code) => {
		const view = plan({ refused, checks: okChecks().map(check => check.code === code ? { ...check, ok: false, detail: 'x' } : check) })
		expect(view.checks[0].code).toBe(code)
		expect(view.checks[0].message.key).toBe(REASONS[refused])
	})

	// the core allows 400 characters to what apt says of why it cannot plan the install
	it('shows what apt says of a plan it could not make, up to the 400 characters the core allows', () => {
		const detail = `The following packages have unmet dependencies: ${'libfoo (>= 1.2) '.repeat(40)}`.slice(0, 400)
		const view = plan({ refused: 'apt_failed', plan_id: '', checks: okChecks().map(check => check.code === 'apt' ? { ...check, ok: false, detail } : check) })
		expect(view.checks[0].detail).toBe(detail.trim())
		expect(view.checks[0].detail.length).toBeGreaterThan(300)
		expect(plan({ refused: 'apt_failed', plan_id: '', checks: [{ code: 'apt', ok: false, detail: 'x '.repeat(500) }] }).checks[0].detail.length).toBeLessThanOrEqual(400)
	})

	describe('says the details of a check in the words of the language, where the core\'s words are a closed set', () => {
		const withDetail = (code, detail, refused = '') => plan({ refused, plan_id: refused ? '' : PLAN_ID_OK, checks: okChecks().map(check => check.code === code ? { ...check, ok: false, detail } : check) }).checks[0]

		it.each(['package_manager', 'os_upgrade', 'unreadable'])('what keeps the machine busy: %s', (detail) => {
			const check = withDetail('busy', detail, 'busy')
			expect(check.detailMessage).toEqual({ key: TEXT.busy[detail], params: {} })
		})

		it('says another word of the busy check as it came, as text', () => {
			const check = withDetail('busy', 'dpkg is locked', 'busy')
			expect(check.detailMessage).toBeNull()
			expect(check.detail).toBe('dpkg is locked')
		})

		it('says the room that is needed and free in the units of the page, not in bytes', () => {
			const check = withDetail('disk', 'need 314572800 bytes on /var/lib/casaos/modules/tmp, 52428800 free', 'disk_short')
			expect(check.detailMessage).toEqual({ key: TEXT.checks.disk, params: { path: '/var/lib/casaos/modules/tmp', needed: '300 MiB', free: '50 MiB' } })
			const french = plan({ refused: 'disk_short', plan_id: '', checks: [{ code: 'disk', ok: false, detail: 'need 314572800 bytes on /usr, 1610612736 free' }] }, { locale: 'fr_fr' }).checks[0]
			expect(french.detailMessage.params).toEqual({ path: '/usr', needed: '300 Mio', free: '1,5 Gio' })
		})

		it.each([
			'need 5 bytes on tmp, 1 free',
			'need 5 bytes on /a b, 1 free',
			'need 5 bytes on /<img>, 1 free',
			'need -5 bytes on /usr, 1 free',
			`need ${'9'.repeat(40)} bytes on /usr, 1 free`,
			'unknown',
			'room for 200 MiB, 100 MiB free',
		])('shows the detail %j of a disk check as it came, as text', (detail) => {
			const check = withDetail('disk', detail, 'disk_short')
			expect(check.detailMessage).toBeNull()
			expect(check.detail).toBe(detail)
		})

		it('does not translate the detail of a check that passed or was not made', () => {
			const ok = plan({ checks: okChecks().map(check => check.code === 'busy' ? { ...check, detail: 'package_manager' } : check) }).checks.find(check => check.code === 'busy')
			expect(ok.detailMessage).toBeNull()
			expect(ok.detail).toBe('')
		})

		it('shows what the os check of a derivative says when it passed, as it came, and nothing of the other checks that passed', () => {
			const detail = 'ubuntu:24.04 (linuxmint:22.2, UBUNTU_CODENAME=noble)'
			const view = plan({ checks: okChecks().map(check => ({ ...check, detail: check.code === 'os' ? detail : 'x' })) })
			expect(view.checks.find(check => check.code === 'os')).toMatchObject({ mark: 'passed', message: null, detailMessage: null, detail })
			expect(view.checks.filter(check => check.code !== 'os').every(check => check.detail === '')).toBe(true)
		})
	})

	describe('a release that ReCasaOS cannot tell', () => {
		const unknown = (extra = {}) => plan({ refused: 'recasaos', plan_id: '', checks: okChecks().map(check => check.code === 'recasaos' ? { ...check, ok: false, detail: 'unknown' } : check), ...extra })

		it('is not a release that is too old: the check and the refusal say it in their own words', () => {
			const view = unknown()
			expect(view.checks[0].message).toEqual({ key: TEXT.checks.recasaosUnknown, params: {} })
			expect(view.refusedMessage).toEqual({ key: TEXT.checks.recasaosUnknown, params: {} })
			expect(TEXT.checks.recasaosUnknown).toBe('ReCasaOS cannot tell its own version, so it cannot tell whether the module fits it.')
		})

		it('says too old for a release that is old', () => {
			const view = plan({ refused: 'recasaos', plan_id: '', checks: okChecks().map(check => check.code === 'recasaos' ? { ...check, ok: false, detail: 'have v0.5.20 need 0.5.23' } : check) })
			expect(view.checks[0].message.key).toBe(REASONS.recasaos)
			expect(view.refusedMessage.key).toBe(REASONS.recasaos)
		})

		it('says the refusal of a call in the same words', () => {
			const failure = moduleFailure(refusal('recasaos', { checks: [{ code: 'recasaos', ok: false, detail: 'unknown' }] }))
			expect(failure.message.key).toBe(TEXT.checks.recasaosUnknown)
			expect(moduleFailure(refusal('recasaos', {})).message.key).toBe(REASONS.recasaos)
		})
	})

	describe('a package that is on hold', () => {
		const held = (detail, refused = 'held_package') => plan({ refused, plan_id: '', checks: okChecks().map(check => check.code === 'apt' ? { ...check, ok: false, detail } : check) })

		it('gives the command that takes the hold off, for the names apt gave', () => {
			expect(held('held qemu-utils').unhold).toEqual({ command: 'apt-mark unhold qemu-utils' })
			expect(held('held qemu-utils ovmf').unhold).toEqual({ command: 'apt-mark unhold qemu-utils ovmf' })
		})

		it.each([
			'held',
			'held ',
			'held a',
			'held ab; reboot',
			'held ab $(reboot)',
			'held --force',
			'held ab AB',
			'held ab/ab',
			'the following packages have unmet dependencies',
			`held ${Array.from({ length: 30 }, (_, index) => `pkg${index}`).join(' ')}`,
		])('gives no command for the detail %j', (detail) => {
			expect(held(detail).unhold).toBeNull()
		})

		it('gives none for a refusal that is not a hold, or when the plan is not refused', () => {
			expect(held('held qemu-utils', 'apt_failed').unhold).toBeNull()
			expect(plan().unhold).toBeNull()
		})

		it('gives it for the refusal of a call, too', () => {
			const failure = moduleFailure(refusal('held_package', { checks: [{ code: 'apt', ok: false, detail: 'held ovmf' }] }))
			expect(failure.unhold).toEqual({ command: 'apt-mark unhold ovmf' })
			expect(moduleFailure(refusal('held_package', {})).unhold).toBeNull()
			expect(moduleFailure(refusal('os', { checks: [{ code: 'apt', ok: false, detail: 'held ovmf' }] })).unhold).toBeNull()
		})
	})

	it('says a check it does not know as one, with its code', () => {
		const view = plan({ checks: [...okChecks(), { code: 'brand_new', ok: true }] })
		expect(view.checks.at(-1).label.params).toEqual({ code: 'brand_new' })
		expect(view.installable).toBe(true)
	})

	it('has a label for every check of the core', () => {
		// the checks of an install and of an update: each has its words
		expect([...Object.keys(CHECKS)].sort()).toEqual([...new Set([...CHECK_CODES, ...UPDATE_CHECK_CODES])].sort())
	})

	it.each([null, undefined, 'plan', 5, [], true, {}, planRaw({ name: 'other' }), planRaw({ name: 5 })])('is nothing for %j, or for the plan of another module', (raw) => {
		expect(modulePlanView(raw, { name: 'virt' })).toBeNull()
	})

	it('is nothing when the name asked for is not given', () => {
		expect(modulePlanView(planRaw())).toBeNull()
	})

	it.each(HOSTILE)('shows %#: every text of the plan as text, cleaned and cut', (value) => {
		const view = plan({
			tier: value,
			refused: value,
			checks: [{ code: value, ok: false, detail: value }],
			packages: { to_install: [value], to_upgrade: [value], download_bytes: value, extra_bytes: value, known: true },
			archive: { url: value, bytes: value },
		})
		for (const text of [view.tier.raw, view.refused, view.checks[0].code, view.checks[0].detail, ...view.packages.install, ...view.packages.upgrade, view.archive.url])
			expect(text).not.toMatch(UNSAFE)
		expect(view.checks[0].detail.length).toBeLessThanOrEqual(400)
		expect(view.archive.url.length).toBeLessThanOrEqual(200)
		expect(view.packages.install[0].length).toBeLessThanOrEqual(80)
		expect(view.installable).toBe(false)
		expect(view.packages.downloadText).toBe('')
		expect(view.archive.url).not.toContain('secret')
		expect(view.archive.url).not.toContain('token=abc')
	})

	it('keeps at most 100 package names of each list, and counts the others', () => {
		const names = Array.from({ length: 130 }, (_, index) => `pkg-${index}`)
		const view = plan({ packages: { to_install: names, to_upgrade: names.slice(0, 101), download_bytes: 1, extra_bytes: 1, known: true } })
		expect(view.packages.install).toHaveLength(100)
		expect(view.packages.moreInstall).toBe(30)
		expect(view.packages.upgrade).toHaveLength(100)
		expect(view.packages.moreUpgrade).toBe(1)
	})

	it.each(NOT_TEXT)('survives packages and archive that are %j', (value) => {
		const view = plan({ packages: value, archive: value })
		expect(view.packages.install).toEqual([])
		expect(view.archive).toEqual({ url: '', bytesText: '' })
		expect(view.packages.known).toBe(false)
	})

	it('survives a list of names that holds what is not a name', () => {
		const view = plan({ packages: { to_install: ['a', 5, null, {}, '', '   ', 'b'], to_upgrade: 'x', download_bytes: 1, extra_bytes: 1, known: true } })
		expect(view.packages.install).toEqual(['a', 'b'])
		expect(view.packages.upgrade).toEqual([])
	})

	it('survives a plan that comes from JSON with a key __proto__', () => {
		const raw = JSON.parse(`{"name":"virt","refused":null,"checks":[{"code":"os","ok":true,"__proto__":{"ok":false}}],"packages":{"to_install":[],"known":true,"__proto__":{"to_install":["evil"]}},"plan_id":"${PLAN_ID_OK}","__proto__":{"refused":"os"}}`)
		const view = modulePlanView(raw, { name: 'virt' })
		expect(view.refused).toBe('')
		expect(view.packages.install).toEqual([])
		expect(view.installable).toBe(true)
		expect({}.polluted).toBeUndefined()
	})
})

describe('the body of the install', () => {
	it('is the id of the plan that is shown, and nothing else', () => {
		const first = plan()
		const second = plan({ plan_id: `m1-${'cd'.repeat(16)}` })
		expect(installBody(first)).toEqual({ plan_id: PLAN_ID_OK })
		expect(installBody(second)).toEqual({ plan_id: `m1-${'cd'.repeat(16)}` })
		expect(Object.keys(installBody(first))).toEqual(['plan_id'])
	})

	it('is nothing for a plan that cannot install, or for what is not a plan', () => {
		expect(installBody(plan({ refused: 'os' }))).toBeNull()
		expect(installBody(null)).toBeNull()
		expect(installBody(undefined)).toBeNull()
		expect(installBody('plan')).toBeNull()
		expect(installBody({ installable: true, planId: 'x' })).toBeNull()
		expect(installBody({ installable: 'true', planId: PLAN_ID_OK })).toBeNull()
		expect(installBody({ planId: PLAN_ID_OK })).toBeNull()
	})

	it('has the shape of the core\'s plan id', () => {
		expect(PLAN_ID.test(PLAN_ID_OK)).toBe(true)
		expect(MODULE_NAME.test('virt')).toBe(true)
		expect(MODULE_NAME.test('Virt')).toBe(false)
	})
})

// ---- the job ---------------------------------------------------------------------------------------------------------------

describe('the view of the job', () => {
	it('has a group and a title for each state of the core', () => {
		expect(Object.keys(JOB_STATES)).toEqual(JOB_STATE_NAMES)
		expect(Object.keys(JOB_TITLES)).toEqual(JOB_STATE_NAMES)
	})

	it('has a step list for the steps of the core, and a sentence for each step', () => {
		expect([...STEPS.install, 'done']).toEqual(INSTALL_STEPS)
		expect([...STEPS.remove, 'done']).toEqual(REMOVE_STEPS)
		for (const step of STEPS.install)
			expect(STEP_TEXTS.install[step], step).toBeTruthy()
		for (const step of STEPS.remove)
			expect(STEP_TEXTS.remove[step], step).toBeTruthy()
		expect(STEP_TEXTS.any.done).toBeTruthy()
	})

	// every state, with every step the core says, for an install, for a remove and for a rollback: the view is there, it says the state in the words of
	// the language, and every key it says is one of the language files
	describe.each(JOB_STATE_NAMES)('in the state %s', (state) => {
		it.each([['install', INSTALL_STEPS], ['remove', REMOVE_STEPS]])('for a %s, at each step', (kind, steps) => {
			for (const step of ['', ...steps]) {
				const view = job({ state, step, code: state === 'failed' || state === 'refused' ? 'internal_error' : '' }, { kind })
				expect(view, step).not.toBeNull()
				expect(view.known).toBe(true)
				expect(view.state).toBe(state)
				expect(view.running).toBe(state === 'running')
				expect(view.finished).toBe(['succeeded', 'refused', 'failed', 'interrupted'].includes(state))
				for (const key of keysIn(view))
					expect(MODULE_KEYS, `${state}/${step}: ${key}`).toContain(key)
				// the list is the steps of the kind, in order, each marked
				const list = kind === 'install' ? STEPS.install : STEPS.remove
				if (view.kind === kind) {
					expect(view.steps.map(item => item.id)).toEqual(list)
					for (const item of view.steps) {
						expect(Object.keys(STEP_MARKS)).toContain(item.mark)
						// the mark is a word and an icon, never a colour alone
						expect(item.markText).toBeTruthy()
						expect(item.icon).toBeTruthy()
					}
				}
			}
		})

		it('for the steps of a rollback: the list stays, with the steps of the undo', () => {
			for (const step of REMOVE_STEPS.filter(item => item !== 'done')) {
				const view = job({ state, step: `${ROLLBACK}${step}`, undo: state === 'failed' ? 'rollback_incomplete' : '' })
				expect(view).not.toBeNull()
				expect(view.rollback).toBe(true)
				expect(view.kind).toBe('install')
				expect(view.steps.map(item => item.id)).toEqual(STEPS.remove)
				expect(view.progress === null || view.progress.label.key === TEXT.job.progressRollback).toBe(true)
				for (const key of keysIn(view))
					expect(MODULE_KEYS, key).toContain(key)
			}
		})
	})

	describe('marks the steps by the state', () => {
		const marks = (changes, options) => job(changes, { kind: 'install', ...options }).steps.map(step => step.mark)

		it('a job that runs: done before, now at the step, not yet after', () => {
			expect(marks({ state: 'running', step: 'unpack' })).toEqual(['done', 'done', 'done', 'current', 'pending', 'pending', 'pending', 'pending'])
			expect(marks({ state: 'running', step: 'packages' })).toEqual(['current', ...Array.from({ length: 7 }, () => 'pending')])
			expect(marks({ state: 'running', step: 'route' })).toEqual([...Array.from({ length: 7 }, () => 'done'), 'current'])
		})

		it('a job that has not begun: nothing yet', () => {
			expect(marks({ state: 'running', step: '' })).toEqual(Array.from({ length: 8 }, () => 'pending'))
		})

		it('a job that succeeded: all done', () => {
			expect(marks({ state: 'succeeded', step: 'done' })).toEqual(Array.from({ length: 8 }, () => 'done'))
		})

		it('a job that failed: the step that failed, and the ones it did not reach', () => {
			expect(marks({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back' })).toEqual(['done', 'done', 'failed', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'])
			expect(marks({ state: 'failed', step: '', code: 'start_failed' })).toEqual(Array.from({ length: 8 }, () => 'skipped'))
		})

		it('a job that was cut short: the step that it was in', () => {
			expect(marks({ state: 'interrupted', step: 'download' })).toEqual(['done', 'stopped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'])
		})

		it('a job that was refused: nothing was reached', () => {
			expect(marks({ state: 'refused', step: '', code: 'busy' })).toEqual(Array.from({ length: 8 }, () => 'skipped'))
		})

		it('a step this page does not know marks none of them as the one it is in', () => {
			expect(marks({ state: 'running', step: 'brand_new' })).toEqual(Array.from({ length: 8 }, () => 'pending'))
		})

		it('the steps of a remove, for a remove', () => {
			const view = job({ state: 'running', step: 'files' }, { kind: 'remove' })
			expect(view.steps.map(step => [step.id, step.mark])).toEqual([['stop', 'done'], ['files', 'current'], ['manifest', 'pending'], ['reload', 'pending']])
		})
	})

	describe('tells install from remove, which the core does not say', () => {
		it.each(['packages', 'download', 'verify', 'unpack', 'units', 'start', 'route'])('by the step %s: an install, whatever the page remembers', (step) => {
			expect(job({ step }, { kind: 'remove' }).kind).toBe('install')
			expect(job({ step }).kind).toBe('install')
		})

		it.each(['stop', 'files', 'reload'])('by the step %s: a remove, whatever the page remembers', (step) => {
			expect(job({ step }, { kind: 'install' }).kind).toBe('remove')
			expect(job({ step }).kind).toBe('remove')
		})

		it('by the steps of a rollback: an install', () => {
			expect(job({ step: 'rollback_stop' }, { kind: 'remove' }).kind).toBe('install')
		})

		it.each(['manifest', 'done'])('by what the page remembers of its call, for the step %s that both have', (step) => {
			expect(job({ step }, { kind: 'install' }).kind).toBe('install')
			expect(job({ step }, { kind: 'remove' }).kind).toBe('remove')
		})

		it('by whether the module is installed, for a job that ended at done', () => {
			expect(job({ state: 'succeeded', step: 'done' }, { status: { installed: true } }).kind).toBe('install')
			expect(job({ state: 'succeeded', step: 'done' }, { status: { installed: false } }).kind).toBe('remove')
		})

		it.each(['install', 'remove'])('by what the core says (%s), before the step and before what the page remembers', (declared) => {
			const other = declared === 'install' ? 'remove' : 'install'
			for (const step of ['', 'packages', 'files', 'manifest', 'rollback_stop', 'done'])
				expect(job({ step, kind: declared }, { kind: other }).kind, step).toBe(declared)
		})

		it.each(['', 'both', 5, null, undefined, {}, [], '__proto__', 'INSTALL', 'install '])('does not take %j, which the core says, for a kind', (declared) => {
			expect(job({ step: 'packages', kind: declared }).kind).toBe('install')
			expect(job({ step: 'manifest', kind: declared }).kind).toBe('')
		})

		it('not at all when nothing says it, and says the step without a list', () => {
			for (const view of [job({ step: 'manifest' }), job({ state: 'succeeded', step: 'done' }, { status: {} }), job({ step: '' }, { kind: 'both' })]) {
				expect(view.kind).toBe('')
				expect(view.steps).toEqual([])
			}
			expect(job({ step: 'manifest' }).title.key).toBe(JOB_TITLES.running.any)
		})
	})

	describe('says the job in words', () => {
		it('a running install, with the step and the progress', () => {
			const view = job({ state: 'running', step: 'unpack' }, { kind: 'install' })
			expect(view.title).toEqual({ key: JOB_TITLES.running.install, params: { module: 'Virtual machines' } })
			expect(view.live).toEqual({ key: expect.stringContaining('step {index} of {total}'), params: { module: 'Virtual machines', index: '4', total: '8', step: STEP_TEXTS.install.unpack }, keys: ['step'] })
			expect(view.progress).toMatchObject({ value: 3, max: 8 })
			expect(view.progress.label.params).toEqual({ index: '4', total: '8' })
			expect(view.group).toBe('In progress')
			expect(view.tone).toBe('is-info')
		})

		it('a running remove', () => {
			const view = job({ state: 'running', step: 'files' }, { kind: 'remove' })
			expect(view.title.key).toBe(JOB_TITLES.running.remove)
			expect(view.progress.label.key).toBe(TEXT.job.progressRemove)
			expect(view.live.params).toMatchObject({ index: '2', total: '4', step: STEP_TEXTS.remove.files })
		})

		it('a rollback, in the words of the steps of a remove', () => {
			const view = job({ state: 'running', step: 'rollback_files' })
			expect(view.rollbackStep).toEqual({ key: TEXT.job.rollback, params: { step: STEP_TEXTS.remove.files }, keys: ['step'] })
			expect(view.live.params.step).toBe(STEP_TEXTS.remove.files)
		})

		it('a job that succeeded, in an install and a remove', () => {
			expect(job({ state: 'succeeded', step: 'done' }, { kind: 'install' })).toMatchObject({ title: { key: JOB_TITLES.succeeded.install }, next: { key: expect.stringContaining('card of the module appears') }, tone: 'is-success', group: 'Finished' })
			expect(job({ state: 'succeeded', step: 'done' }, { kind: 'remove' })).toMatchObject({ title: { key: JOB_TITLES.succeeded.remove }, next: { key: expect.stringContaining('are still on the machine') } })
		})

		it('a job that was refused: nothing changed, and the reason', () => {
			const view = job({ state: 'refused', step: '', code: 'already_installed' })
			expect(view.title.key).toBe(JOB_TITLES.refused.any)
			expect(view.reason.key).toBe(REASONS.already_installed)
			expect(view.code).toBe('already_installed')
			expect(view.advice).toBeNull()
			expect(view.kept).toBeNull()
		})

		// what the core's `undo` is set to for every failure of an install, even before anything was written, and packages are never undone
		it.each([
			['rolled_back', JOB_NEXT.undone, false],
			['rollback_incomplete', JOB_NEXT.notUndone, true],
			['', JOB_NEXT.nothingWritten, false],
		])('a job that failed with undo %j at a step before the files: says what became of what it had done', (undo, sentence, advice) => {
			const view = job({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo }, { kind: 'install' })
			expect(view.undoText.key).toBe(sentence)
			expect(view.reason.key).toBe(REASONS.checksum_mismatch)
			expect(view.stoppedAt).toEqual({ key: TEXT.job.stoppedAt, params: { step: STEP_TEXTS.install.verify }, keys: ['step'] })
			expect(Boolean(view.advice)).toBe(advice)
			expect(view.tone).toBe('is-danger')
		})

		it('does not say that what the install had done was undone: the files and the service were removed, and the packages were not', () => {
			expect(JOB_NEXT.undone).toBe('The files and the service of the module were removed; the packages were not.')
			for (const step of ['packages', 'unpack', 'start', 'route'])
				expect(job({ state: 'failed', step, code: 'internal_error', undo: 'rolled_back' }, { kind: 'install' }).undoText.key).toBe(JOB_NEXT.undone)
		})

		it('says that nothing can be told of the undo of an install that stopped after it began to write and says no undo, and gives the console', () => {
			const view = job({ state: 'failed', step: 'unpack', code: 'unpack_failed', undo: '' }, { kind: 'install' })
			expect(view.undoText.key).toBe(JOB_NEXT.undoUnknown)
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
		})

		it('says an undo that it does not know as an undo that did not finish, and gives the console', () => {
			const view = job({ state: 'failed', step: 'verify', code: 'internal_error', undo: 'half' }, { kind: 'install' })
			expect(view.undoText.key).toBe(JOB_NEXT.notUndone)
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
		})

		// the matrix of a job that was cut short: the step says what was done, and the console is for what the page cannot finish
		it.each([
			['', 'install', JOB_NEXT.cutBeforeStart, false],
			['', 'remove', JOB_NEXT.cutBeforeStart, false],
			['', '', JOB_NEXT.cutBeforeStart, false],
			['packages', 'install', JOB_NEXT.cutEarly, false],
			['download', 'install', JOB_NEXT.cutEarly, false],
			['verify', 'install', JOB_NEXT.cutEarly, false],
			['unpack', 'install', JOB_NEXT.cutInstall, true],
			['units', 'install', JOB_NEXT.cutInstall, true],
			['manifest', 'install', JOB_NEXT.cutInstall, true],
			['start', 'install', JOB_NEXT.cutInstall, true],
			['route', 'install', JOB_NEXT.cutInstall, true],
			['stop', 'remove', JOB_NEXT.cutRemove, true],
			['files', 'remove', JOB_NEXT.cutRemove, true],
			['manifest', 'remove', JOB_NEXT.cutRemove, true],
			['reload', 'remove', JOB_NEXT.cutRemove, true],
			['manifest', '', JOB_NEXT.cutUnknown, true],
			['rollback_stop', 'install', JOB_NEXT.cutRollback, true],
			['rollback_files', '', JOB_NEXT.cutRollback, true],
		])('a job cut short at the step %j, of the kind %j: says %#, and the console is %s', (step, kind, sentence, advice) => {
			const view = job({ state: 'interrupted', step, kind }, {})
			expect(view.undoText.key).toBe(sentence)
			expect(Boolean(view.advice)).toBe(advice)
			expect(view.title.key).toBe(JOB_TITLES.interrupted.any)
			expect(view.undoText.key).not.toBe('Nothing was undone.')
		})

		it('says that an install that failed and whose undo was cut short is that, and not that nothing was undone', () => {
			const view = job({ state: 'interrupted', step: 'rollback_files' })
			expect(view.undoText.key).toBe('The install failed and the undo was cut short: some files of the module may still be on the machine.')
			expect(view.stoppedAt.params.step).toBe(STEP_TEXTS.remove.files)
		})

		it('a remove that failed: the console finishes it', () => {
			const view = job({ state: 'failed', step: 'files', code: 'remove_incomplete' }, { kind: 'remove' })
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
			expect(view.undoText).toBeNull()
			expect(view.kept).toBeNull()
		})

		// a failed remove seen from a window that was opened later: nothing says it was a remove, and the step manifest is in both
		it('a job that failed at the step manifest, whose kind nobody says: says neither an install nor that there was nothing to undo, and gives the console', () => {
			const view = job({ state: 'failed', step: 'manifest', code: 'manifest_write_failed', undo: '' })
			expect(view.kind).toBe('')
			expect(view.undoText).toBeNull()
			expect(view.title.key).toBe(JOB_TITLES.failed.any)
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
			expect(view.kept).toBeNull()
			expect(JSON.stringify(keysIn(view))).not.toMatch(/nothing to undo|install/i)
		})

		it('a remove that failed at the step manifest, as the core says it: no word of an install', () => {
			const view = job({ state: 'failed', step: 'manifest', code: 'manifest_write_failed', undo: '', kind: 'remove' })
			expect(view.kind).toBe('remove')
			expect(view.title.key).toBe(JOB_TITLES.failed.remove)
			expect(view.undoText).toBeNull()
			expect(view.kept).toBeNull()
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
			expect(view.steps.map(step => step.id)).toEqual(STEPS.remove)
		})

		it('the steps of a rollback keep the list, with the step of the undo marked, and a progress bar of their own', () => {
			const run = job({ state: 'running', step: 'rollback_files' })
			expect(run.steps.map(step => [step.id, step.mark])).toEqual([['stop', 'done'], ['files', 'current'], ['manifest', 'pending'], ['reload', 'pending']])
			expect(run.progress).toMatchObject({ value: 1, max: 4 })
			expect(run.progress.label).toEqual({ key: TEXT.job.progressRollback, params: { index: '2', total: '4' } })
			const cut = job({ state: 'interrupted', step: 'rollback_manifest' })
			expect(cut.steps.map(step => step.mark)).toEqual(['done', 'done', 'stopped', 'skipped'])
		})

		it('the heading while an install is undone is that, and not that it is installing', () => {
			const view = job({ state: 'running', step: 'rollback_stop' })
			expect(view.title).toEqual({ key: 'Undoing the install of {module}', params: { module: 'Virtual machines' } })
			expect(view.title.key).not.toBe(JOB_TITLES.running.install)
			expect(job({ state: 'running', step: 'unpack' }, { kind: 'install' }).title.key).toBe(JOB_TITLES.running.install)
		})

		it('says the end of the job as a sentence that names what was done, for the heading and for the announcement', () => {
			const install = job({ state: 'succeeded', step: 'done', kind: 'install' })
			const remove = job({ state: 'succeeded', step: 'done', kind: 'remove' })
			expect(install.title).toEqual({ key: 'The install of {module} is done.', params: { module: 'Virtual machines' } })
			expect(remove.title).toEqual({ key: 'The removal of {module} is done.', params: { module: 'Virtual machines' } })
			expect(jobAnnouncement(job({ state: 'running', step: 'route', kind: 'install' }), install)).toBe(install.title)
		})

		it('gives no command for a job that did not fail, or an install that was undone', () => {
			for (const view of [job({ state: 'running', step: 'download' }), job({ state: 'succeeded', step: 'done' }, { kind: 'install' }), job({ state: 'refused', code: 'busy' }), job({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back' }, { kind: 'install' })])
				expect(view.advice).toBeNull()
		})

		it('says a reason by the code and the step', () => {
			expect(job({ state: 'failed', step: 'start', code: 'start_failed' }, { kind: 'install' }).reason.key).toBe(REASONS.start_failed.steps.start)
			expect(job({ state: 'refused', step: '', code: 'start_failed' }).reason.key).toBe(REASONS.start_failed.text)
		})

		it('says a code it does not know as one, and a code with no word as no reason', () => {
			expect(job({ state: 'failed', code: 'brand_new' }).reason).toEqual({ key: REASON_UNKNOWN, params: { code: 'brand_new' } })
			expect(job({ state: 'failed', code: '' }).reason).toBeNull()
			expect(job({ state: 'failed', code: 'Not A Code!' }).reason).toEqual({ key: REASON_UNKNOWN, params: { code: 'Not A Code!' } })
		})

		it('says the title of the module as text, cut, or its name', () => {
			expect(job({}, { title: '<b>x</b>' }).title.params.module).toBe('<b>x</b>')
			expect(job({}, { title: '' }).title.params.module).toBe('virt')
			expect(job({}, { title: 'x'.repeat(1000) }).title.params.module).toHaveLength(80)
			expect(job({}, { title: 5 }).title.params.module).toBe('virt')
		})
	})

	describe('says an unknown state as one', () => {
		it.each(['brand_new', '', 'RUNNING', '<b>', '__proto__', 'constructor', 'toString'])('%j: a view with no step and no poll', (state) => {
			const view = job({ state, step: 'download' })
			expect(view).not.toBeNull()
			expect(view.known).toBe(false)
			expect(view.running).toBe(false)
			expect(view.finished).toBe(false)
			expect(view.title.key).toBe(TEXT.job.unknownState)
			expect(view.group).toBe('Unknown state')
			expect(view.state).toBe(state.slice(0, 40))
			expect(view.advice).toBeNull()
			expect(view.reason).toBeNull()
		})

		// the state of a job is a class of the card and a piece of text: an unknown one is never a class, and is cleaned and cut as a text
		it.each(HOSTILE)('%#: never as a class name, and cleaned and cut as a text', (state) => {
			const view = job({ state })
			expect(view.stateClass).toBe('is-unknown')
			expect(view.stateText).not.toMatch(UNSAFE)
			expect(view.stateText.length).toBeLessThanOrEqual(40)
			expect(view.state).toBe(view.stateText)
			expect(view.changeKey).not.toContain('\u0000')
		})

		it.each(JOB_STATE_NAMES)('%s: a class of its own', (state) => {
			expect(job({ state }).stateClass).toBe(`is-${state}`)
			expect(job({ state }).stateText).toBe(state)
		})
	})

	describe('refuses what is not the job of the module', () => {
		it.each([null, undefined, 'job', 5, [], {}, { job: null }, { job: [] }, { job: 'x' }, { job: { name: 'virt' } }, { job: { name: 'virt', state: 5 } }, { job: { name: 'other', state: 'running' } }, { job: { name: 5, state: 'running' } }, { status: {} }])('%j: nothing', (raw) => {
			expect(jobView(raw, { name: 'virt' })).toBeNull()
		})

		it('does not take the job of another module for this one\'s', () => {
			expect(jobView(answer({ name: 'other' }), { name: 'virt' })).toBeNull()
		})
	})

	describe('the codes the core can say', () => {
		it.each(ALL_CODES)('says %s as a reason of a job that failed, and of one that was refused', (code) => {
			for (const state of ['failed', 'refused']) {
				const view = job({ state, step: 'download', code })
				expect(view.reason.key).not.toBe(REASON_UNKNOWN)
				expect(view.code).toBe(code)
			}
		})
	})

	describe('the packages that a failed install left', () => {
		const kept = names => job({ state: 'failed', step: 'start', code: 'start_failed', undo: 'rolled_back', kept_packages: names }, { kind: 'install' }).kept

		it('lists them and gives the command to purge them by hand', () => {
			expect(kept(['qemu-utils', 'libvirt-daemon-system'])).toMatchObject({ known: true, count: 2, names: 'qemu-utils, libvirt-daemon-system', command: 'apt-get purge qemu-utils libvirt-daemon-system', unsafe: false })
		})

		it('says there were none, with no command', () => {
			expect(kept([])).toMatchObject({ known: true, count: 0, command: '' })
		})

		it.each([null, undefined, 'qemu-utils', 5, {}, { length: 1 }])('says they are not known when the core sends %j, with no command', (value) => {
			expect(kept(value)).toMatchObject({ known: false, command: '' })
		})

		it.each([
			['a name with a space', ['a b']],
			['a name that is an option', ['--force-yes']],
			['a name with a command after it', ['qemu-utils; rm -rf /']],
			['a name with a substitution', ['$(reboot)']],
			['a name with a backtick', ['`id`']],
			['a name with a line end', ['a\nb']],
			['an upper case name', ['Qemu']],
			['a name that begins with a dash', ['-y']],
			['a name that begins with a dot', ['.x']],
			['a name that is too long', ['a'.repeat(65)]],
			['a name that is not text', ['ok', 5]],
			['an empty name', ['ok', '']],
			['a name with a mark that turns the text round', ['ok\u202Ex']],
		])('gives no command when the list holds %s, and says so', (_, names) => {
			const got = kept(names)
			expect(got.command).toBe('')
			expect(got.unsafe).toBe(true)
		})

		it('gives no command for more than 40 names, which are not all there', () => {
			const got = kept(Array.from({ length: 60 }, (_, index) => `pkg${index}`))
			expect(got.count).toBe(40)
			expect(got.command).toBe('')
		})

		it('is not asked of a job that did not fail, or of a remove that stopped, or of an install that succeeded', () => {
			expect(job({ state: 'succeeded', step: 'done', kept_packages: ['ab'] }, { kind: 'install' }).kept).toBeNull()
			expect(job({ state: 'failed', step: 'files', kept_packages: ['ab'] }, { kind: 'remove' }).kept).toBeNull()
			expect(job({ state: 'running', step: 'download', kept_packages: ['ab'] }).kept).toBeNull()
			expect(job({ state: 'refused', code: 'busy', kept_packages: ['ab'] }).kept).toBeNull()
			expect(job({ state: 'interrupted', step: 'unpack', kept_packages: ['ab'] }).kept).toBeNull()
		})

		// the packages are the module's whole list, and the purge command is the same after a remove that succeeded as after an install that failed
		it('gives the command to purge them after a remove that succeeded, when the core gives the list, and says nothing when it does not', () => {
			const done = list => job({ state: 'succeeded', step: 'done', kind: 'remove', kept_packages: list }).kept
			expect(done(['qemu-utils', 'libvirt-daemon-system'])).toMatchObject({ known: true, count: 2, command: 'apt-get purge qemu-utils libvirt-daemon-system', unsafe: false })
			expect(done(null)).toBeNull()
			expect(done(['x; reboot']).command).toBe('')
		})

		it('says one package in the singular and many in the plural', () => {
			expect(kept(['qemu-utils']).count).toBe(1)
			expect(kept(['qemu-utils', 'ovmf']).count).toBe(2)
			expect(TEXT.job.keptOne).not.toBe(TEXT.job.keptSome)
			expect(TEXT.job.purgeOne).not.toBe(TEXT.job.purge)
		})

		it('says that the packages are the ones the module needs, some of which may have been there before, and that a purge deletes their configuration', () => {
			expect(TEXT.job.keptSome).toMatch(/packages the module needs/)
			expect(TEXT.job.keptSome).toMatch(/may have been on the machine before/)
			expect(TEXT.job.purge).toMatch(/configuration files/)
			expect(TEXT.job.purge).toMatch(/read what apt says before you agree/)
			expect(TEXT.job.purgeOne).toMatch(/configuration files/)
		})

		// the rule of the core's package names (pkg/osmodule/manifest.go ValidPackageName): two to 64 characters, and not one that apt reads as an order or as a file
		it.each([
			['ab', true],
			['a1', true],
			['0ab', true],
			['g++', false],
			['libstdc++6', true],
			['a.b+c-d', true],
			['a'.repeat(64), true],
			['a'.repeat(65), false],
			['a', false],
			['-ab', false],
			['.ab', false],
			['+ab', false],
			['ab-', false],
			['ab+', false],
			['ab.deb', false],
			['x.deb', false],
			['ab.debx', true],
			['Ab', false],
			['a_b', false],
			['a b', false],
		])('takes the package name %j for %s', (name, valid) => {
			expect(Boolean(kept([name]).command)).toBe(valid)
			expect(kept([name]).unsafe).toBe(!valid)
		})

		it('keeps the HTML of a name as text and never in a command', () => {
			const got = kept(['<img src=x onerror=alert(1)>'])
			expect(got.names).toBe('<img src=x onerror=alert(1)>')
			expect(got.command).toBe('')
		})
	})

	describe('the log', () => {
		it('keeps the last 20 lines, as text', () => {
			const lines = Array.from({ length: 50 }, (_, index) => `line ${index}`)
			expect(job({ log_tail: lines }).logTail).toEqual(lines.slice(30))
		})

		it.each(HOSTILE)('cleans %#: no control character, no mark that turns the text round, no secret of an address, cut', (value) => {
			const [got] = job({ log_tail: [value] }).logTail ?? []
			expect(got ?? '').not.toMatch(UNSAFE)
			expect((got ?? '').length).toBeLessThanOrEqual(240)
			expect(got ?? '').not.toContain('secret')
			expect(got ?? '').not.toContain('token=abc')
		})

		it('keeps the HTML of a line as text', () => {
			expect(job({ log_tail: ['<b>bold</b> | <script>x</script>'] }).logTail).toEqual(['<b>bold</b> | <script>x</script>'])
		})

		// the user and the query of an address are hidden BEFORE the line is cut: a user part that runs past the cut is not shown in front of it
		it('hides the user and the query of an address, whatever the length of the line', () => {
			const [got] = job({ log_tail: [`${'x '.repeat(110)}https://user:hunter2@example.com/path?token=abcdef and more`] }).logTail
			expect(got).not.toContain('hunter2')
			expect(got).not.toContain('abcdef')
			for (const text of [`https://user:${'s'.repeat(3000)}@host.example/path?key=abc`, `see https://${'u'.repeat(2500)}@host.example/`]) {
				const shown = job({ log_tail: [text] }).logTail.join('')
				expect(shown).not.toMatch(/[su]{10}/)
			}
		})

		it.each(NOT_A_LIST)('survives a log that is %j', (value) => {
			expect(job({ log_tail: value }).logTail).toEqual([])
		})

		it('drops what is not a line, and the lines that are empty', () => {
			expect(job({ log_tail: ['a', 5, null, {}, '', '   ', ['x'], 'b'] }).logTail).toEqual(['a', 'b'])
		})
	})

	describe('hostile fields', () => {
		it.each(HOSTILE)('%#: a step, a code and an undo that are hostile say nothing wrong', (value) => {
			const view = job({ state: 'failed', step: value, code: value, undo: value, started_at: value, ended_at: value })
			expect(view).not.toBeNull()
			expect(view.step).toBe('')
			expect(view.code).not.toMatch(UNSAFE)
			expect(view.code.length).toBeLessThanOrEqual(60)
			expect(view.startedAt).toBe('')
			expect(view.endedAt).toBe('')
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
		})

		it.each(NOT_A_LIST)('%j in every field is the job of nothing, or a job with nothing in it', (value) => {
			const view = jobView({ job: { name: 'virt', state: 'running', step: value, code: value, undo: value, kept_packages: value, started_at: value, ended_at: value, log_tail: value }, status: value }, { name: 'virt' })
			expect(view).not.toBeNull()
			expect(view.step).toBe('')
			expect(view.logTail).toEqual([])
		})

		it('survives a job that comes from JSON with a key __proto__', () => {
			const raw = JSON.parse('{"job":{"name":"virt","state":"running","step":"download","code":"","undo":"","kept_packages":null,"log_tail":[],"__proto__":{"state":"failed","step":"files"}},"status":{"installed":true,"__proto__":{"installed":false}},"__proto__":{"job":null}}')
			const view = jobView(raw, { name: 'virt', kind: 'install' })
			expect(view.state).toBe('running')
			expect(view.step).toBe('download')
			expect({}.polluted).toBeUndefined()
		})

		it('says the time of the job in the language', () => {
			expect(job({ started_at: '2026-10-18T10:00:00Z' }, { locale: 'en_us' }).startedAt).toMatch(/2026/)
			expect(job({ started_at: 'yesterday' }).startedAt).toBe('')
		})
	})
})

describe('the announcement of the job', () => {
	it('is one sentence per change, and none per answer', () => {
		const a = job({ state: 'running', step: 'download' }, { kind: 'install' })
		const same = job({ state: 'running', step: 'download', log_tail: ['more output'] }, { kind: 'install' })
		const next = job({ state: 'running', step: 'verify' }, { kind: 'install' })
		expect(jobAnnouncement(null, a)).toBe(a.live)
		expect(jobAnnouncement(a, same)).toBeNull()
		expect(jobAnnouncement(a, next)).toBe(next.live)
		expect(jobAnnouncement(next, next)).toBeNull()
	})

	it('names the step, as the sentence of that step', () => {
		const view = job({ state: 'running', step: 'download' }, { kind: 'install' })
		expect(view.live.params.step).toBe(STEP_TEXTS.install.download)
		expect(view.live.params.index).toBe('2')
	})

	it('says the end of the job, once', () => {
		const run = job({ state: 'running', step: 'route' }, { kind: 'install' })
		const done = job({ state: 'succeeded', step: 'done' }, { kind: 'install' })
		expect(jobAnnouncement(run, done)).toBe(done.title)
		expect(jobAnnouncement(done, done)).toBeNull()
	})

	it('says another reason of a job that stopped as a change', () => {
		const a = job({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rolled_back' })
		const b = job({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo: 'rollback_incomplete' })
		expect(jobAnnouncement(a, b)).toBe(b.live)
	})

	it('says nothing when there is no job', () => {
		expect(jobAnnouncement(null, null)).toBeNull()
		expect(jobAnnouncement(job({}), null)).toBeNull()
	})
})

// ---- polling --------------------------------------------------------------------------------------------------------------

describe('the polling of the job', () => {
	it('asks at once when nothing was asked, every 2 seconds after a good answer, and after the pause of the OS page after an error', () => {
		expect(nextJobPoll('none', { running: true })).toBe(0)
		expect(nextJobPoll('ok', { running: true })).toBe(2000)
		expect(MODULE_POLL_MS.running).toBe(2000)
		expect(nextJobPoll('error', { running: true })).toBe(POLL_MS.error)
		expect(nextJobPoll('error', { running: true })).toBe(10000)
	})

	it.each(['none', 'ok', 'error', 'garbage', undefined, null, 5])('does not ask while the document is hidden, whatever the last answer was (%j)', (last) => {
		expect(nextJobPoll(last, { hidden: true, running: true })).toBeNull()
	})

	it.each(['none', 'ok', 'error', 'garbage', undefined])('does not ask when no job is followed (%j)', (last) => {
		expect(nextJobPoll(last, { running: false })).toBeNull()
		expect(nextJobPoll(last, {})).toBeNull()
		expect(nextJobPoll(last)).toBeNull()
	})

	it.each(['garbage', undefined, null, 5, {}, 'OK'])('takes %j for an error', (last) => {
		expect(nextJobPoll(last, { running: true })).toBe(POLL_MS.error)
	})

	it.each([null, undefined, 'x', 5, true])('survives options that are %j', (options) => {
		expect(nextJobPoll('ok', options)).toBeNull()
	})

	it('is a table over every combination', () => {
		for (const last of ['none', 'ok', 'error']) {
			for (const hidden of [true, false]) {
				for (const running of [true, false]) {
					const got = nextJobPoll(last, { hidden, running })
					const expected = hidden || !running ? null : last === 'none' ? 0 : last === 'ok' ? 2000 : 10000
					expect(got, `${last}/${hidden}/${running}`).toBe(expected)
				}
			}
		}
	})
})

describe('why the job cannot be read', () => {
	it.each([
		['a session that ended', { response: { status: 401 } }, 'signin', ''],
		['a core without the route', { response: { status: 404 } }, 'unavailable', ''],
		['no answer at all', { code: 'ERR_NETWORK', request: {} }, 'down', ''],
		['a timeout', { code: 'ECONNABORTED' }, 'down', ''],
		['a gateway with nothing behind it (502)', { response: { status: 502 } }, 'down', ''],
		['a gateway with nothing behind it (503)', { response: { status: 503, data: '<html>' } }, 'down', ''],
		['a gateway with nothing behind it (504)', { response: { status: 504 } }, 'down', ''],
		['an error of the core, with its code', { response: { status: 500, data: { success: 500, data: { error_code: 'internal', error: 'x' } } } }, 'error', 'internal'],
		['an error of the core with a code, behind a gateway', { response: { status: 503, data: { data: { error_code: 'start_failed' } } } }, 'error', 'start_failed'],
		['a 500 that is no answer of the core', { response: { status: 500, data: '<html>' } }, 'error', ''],
		['an answer of a client error', { response: { status: 400, data: {} } }, 'failed', ''],
		['an error of the page', new Error('x'), 'down', ''],
		['nothing', null, 'down', ''],
	])('tells %s', (_, error, kind, code) => {
		expect(moduleStatusFailure(error)).toEqual({ kind, code })
	})

	it('does not take a 500 internal for a machine that restarts', () => {
		const internal = { response: { status: 500, data: { data: { error_code: 'internal' } } } }
		expect(moduleStatusFailure(internal).kind).not.toBe('down')
		expect(moduleOutage(moduleStatusFailure(internal)).message.key).not.toMatch(/restart/i)
	})

	it('takes a browser that is offline for the own network of the person, and not for a core that is away', () => {
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
		try {
			expect(moduleStatusFailure({ request: {} })).toEqual({ kind: 'failed', code: '' })
		} finally {
			delete navigator.onLine
		}
		expect(moduleStatusFailure({ request: {} })).toEqual({ kind: 'down', code: '' })
	})

	it.each(HOSTILE)('cleans the code of an error of the core (%#)', (value) => {
		const got = moduleStatusFailure({ response: { status: 500, data: { data: { error_code: value } } } })
		expect(got.code).not.toMatch(UNSAFE)
		expect(got.code.length).toBeLessThanOrEqual(60)
	})
})

describe('what is said while the job cannot be read', () => {
	it('says a core that does not answer as one that may be restarting, in the words of a module, with the time, and goes on by itself', () => {
		expect(moduleOutage({ kind: 'down', elapsedMs: 0 })).toMatchObject({ level: 'down', elapsed: null })
		const later = moduleOutage({ kind: 'down', elapsedMs: 65000 })
		expect(later.level).toBe('down')
		expect(later.message.key).toBe('ReCasaOS does not answer. It may be restarting. This page tries again by itself.')
		expect(later.elapsed.params.time).toBe('1 min 05 s')
		expect(later.message.key).not.toMatch(/The machine is restarting/)
	})

	it('says a core that answers with an error as that, with its code, and not as a machine that restarts', () => {
		const view = moduleOutage({ kind: 'error', code: 'internal', elapsedMs: 5000 })
		expect(view.level).toBe('error')
		expect(view.message.key).toBe('ReCasaOS answered with an error. This page tries again by itself.')
		expect(view.code).toBe('internal')
		expect(view.elapsed.params.time).toBe('5 s')
	})

	it('sends the person to the machine after fifteen minutes of anything, in the words of a module and not in those of an upgrade that waits for the person', () => {
		for (const kind of ['down', 'failed', 'error']) {
			const view = moduleOutage({ kind, elapsedMs: RESTART_LOOK_AFTER_MS })
			expect(view.level).toBe('look')
			expect(view.message.params.time).toBe('15 min 00 s')
			expect(view.message.key).toBe('ReCasaOS has not answered for {time}. Look at the machine: it may be off, or still restarting. This page keeps trying.')
			expect(view.message.key).not.toMatch(/waiting for you/)
		}
		expect(moduleOutage({ kind: 'down', elapsedMs: RESTART_LOOK_AFTER_MS - 1 }).level).toBe('down')
	})

	it('says an answer that is not a state as the state of the job that could not be read, in the words of a job', () => {
		const view = moduleOutage({ kind: 'failed', elapsedMs: 5000 })
		expect(view.level).toBe('unreadable')
		expect(view.message.key).toBe(TEXT.outage.unreadable)
		expect(view.message.key).not.toMatch(/upgrade/)
	})

	it('says a session that ended in the words of a job, and a core without the feature as nothing', () => {
		expect(moduleOutage({ kind: 'signin' }).message.key).toBe(TEXT.outage.signin)
		expect(moduleOutage({ kind: 'signin' }).message.key).not.toMatch(/upgrade/)
		expect(moduleOutage({ kind: 'unavailable' }).message).toBeNull()
	})
})

// ---- when a call fails -----------------------------------------------------------------------------------------------------

describe('the failure of a call', () => {
	it.each(API_CODES)('says the refusal %s in its sentence, with the code', (code) => {
		const failure = moduleFailure(refusal(code, { field: 'plan_id' }, code === 'bad_request' ? 400 : code === 'start_failed' || code === 'internal' ? 500 : 409))
		expect(failure.kind).toBe('refusal')
		expect(failure.code).toBe(code)
		expect(failure.message.key).not.toBe(REASON_UNKNOWN)
		expect(failure.message.key).toBe(reasonMessage(code, { data: { field: 'plan_id' } }).key)
	})

	it.each(PLAN_REFUSALS)('says the refusal %s of the install in its sentence and lists the checks that failed', (code) => {
		const checks = [{ code: 'os', ok: false, detail: 'x' }, { code: 'arch', ok: true, detail: '' }, { code: 'busy', ok: false, detail: 'not_checked' }]
		const failure = moduleFailure(refusal(code, { checks }))
		expect(failure.message.key).toBe(REASONS[code])
		expect(failure.items.map(item => item.code)).toEqual(['os'])
		expect(failure.items[0].message.key).toBe(REASONS.os)
	})

	it('says an unknown code as one, and never the words of the core', () => {
		const failure = moduleFailure(refusal('brand_new', {}))
		expect(failure.message).toEqual({ key: REASON_UNKNOWN, params: { code: 'brand_new' } })
		expect(JSON.stringify(failure)).not.toContain('A sentence of the core')
	})

	it('puts what the core saw of a busy machine in text beside the sentence, and does not match it', () => {
		const failure = moduleFailure(refusal('busy', { reason: 'an upgrade of the operating system is open' }))
		expect(failure.message.key).toBe(REASONS.busy)
		expect(failure.detail).toBe('an upgrade of the operating system is open')
		expect(moduleFailure(refusal('busy', { reason: '<b>x</b>\u0000'.repeat(100) })).detail).not.toMatch(UNSAFE)
		expect(moduleFailure(refusal('busy', { reason: 'word '.repeat(1000) })).detail).toHaveLength(200)
		expect(moduleFailure(refusal('busy', {})).detail).toBe('')
		expect(moduleFailure(refusal('plan_changed', { reason: 'x' })).detail).toBe('')
	})

	it('says what the plan says of the thing that keeps the machine busy, in the words of the language, beside the core\'s prose', () => {
		const failure = moduleFailure(refusal('busy', { reason: 'an upgrade of the operating system is open', checks: [{ code: 'busy', ok: false, detail: 'os_upgrade' }] }))
		expect(failure.busy).toEqual({ key: TEXT.busy.os_upgrade, params: {} })
		expect(failure.detail).toBe('an upgrade of the operating system is open')
		expect(moduleFailure(refusal('busy', { reason: 'x' })).busy).toBeNull()
		expect(moduleFailure(refusal('os', { checks: [{ code: 'busy', ok: false, detail: 'os_upgrade' }] })).busy).toBeNull()
	})

	it('names the field of a request that was not accepted', () => {
		expect(moduleFailure(refusal('bad_request', { field: 'plan_id' }, 400)).message.params).toEqual({ field: 'plan_id' })
	})

	it.each([
		['a session that ended', { response: { status: 401 } }, 'signin'],
		['a core without the feature', { response: { status: 404 } }, 'unavailable'],
		['a timeout', { code: 'ECONNABORTED' }, 'timeout'],
		['a network that failed', { code: 'ERR_NETWORK', request: {} }, 'timeout'],
		['an answer that is not a refusal', { response: { status: 502, data: '<html>' } }, 'failed'],
		['nothing', null, 'failed'],
	])('tells %s', (_, error, kind) => {
		const failure = moduleFailure(error)
		expect(failure.kind).toBe(kind)
		expect(failure.items).toEqual([])
		expect(failure.detail).toBe('')
		expect(MODULE_KEYS.concat(Object.values(en)).includes(failure.message.key)).toBe(true)
	})

	it('says a core without the feature in the words of the modules', () => {
		expect(moduleFailure({ response: { status: 404 } }).message.key).toBe(TEXT.unavailable)
	})

	it('tells a read that got no answer as one to be tried again, and not as a call that may have gone through', () => {
		expect(moduleFailure({ code: 'ERR_NETWORK', request: {} }, 'en_us', { read: true }).kind).toBe('failed')
	})

	// a read changes nothing: whatever the way it got no answer, it says so and says to try again
	it.each([
		['a timeout', { code: 'ECONNABORTED' }],
		['a timeout of the browser', { code: 'ETIMEDOUT' }],
		['no answer', { code: 'ERR_NETWORK', request: {} }],
		['a gateway with nothing behind it', { response: { status: 502 } }],
		['a 500 that is no answer of the core', { response: { status: 500, data: '<html>' } }],
		['nothing', null],
	])('says a read that got %s: nothing was changed, try again', (_, error) => {
		const failure = moduleFailure(error, 'en_us', { read: true })
		expect(failure.kind).toBe('failed')
		expect(failure.message.key).toBe(TEXT.call.readFailed)
		expect(failure.message.key).not.toMatch(/gone through/)
	})

	// a call that changes the machine may have been carried out when it got no answer: the page looks at the job before it says anything
	it.each([
		['a timeout', { code: 'ECONNABORTED' }],
		['no answer', { code: 'ERR_NETWORK', request: {} }],
		['a gateway with nothing behind it (502)', { response: { status: 502 } }],
		['a gateway with nothing behind it (503)', { response: { status: 503, data: '<html>' } }],
		['a gateway with nothing behind it (504)', { response: { status: 504, data: {} } }],
		['a 500 with no code of the core', { response: { status: 500, data: '<html>' } }],
		['a 502 with a body that has no code', { response: { status: 502, data: { data: {} } } }],
		['a 503 with a code of the core', { response: { status: 503, data: { data: { error_code: 'busy' } } } }],
	])('says a call that changes the machine, and that got %s, as one that may have gone through', (_, error) => {
		const failure = moduleFailure(error, 'en_us', { mutating: true })
		expect(failure.kind).toBe('timeout')
		expect(failure.message.key).toBe(TEXT.call.maybe)
	})

	it.each([
		['a refusal of the core', { response: { status: 409, data: { data: { error_code: 'busy' } } } }, 'refusal'],
		['an error of the core with its code', { response: { status: 500, data: { data: { error_code: 'start_failed' } } } }, 'refusal'],
		['a session that ended', { response: { status: 401 } }, 'signin'],
		['a request that was not accepted, with no code', { response: { status: 400, data: {} } }, 'failed'],
	])('does not say that %s may have gone through', (_, error, kind) => {
		expect(moduleFailure(error, 'en_us', { mutating: true }).kind).toBe(kind)
	})

	it.each(HOSTILE)('survives %# in the code, the data and the reason', (value) => {
		const failure = moduleFailure(refusal(value, { reason: value, field: value, checks: [{ code: value, ok: false, detail: value }] }))
		expect(failure.kind).toBe('refusal')
		expect(failure.code).not.toMatch(UNSAFE)
		expect(failure.code.length).toBeLessThanOrEqual(60)
		expect(failure.detail).not.toMatch(UNSAFE)
	})

	it('survives data that is not an object', () => {
		for (const data of [null, undefined, 'x', 5, [], { checks: 'x' }, { checks: [null, 5, 'x'] }])
			expect(moduleFailure(refusal('busy', data)).kind).toBe('refusal')
	})
})

// ---- the sizes -------------------------------------------------------------------------------------------------------------

// ---- the update ---------------------------------------------------------------------------------------------------------------

describe('the list: an update that is available', () => {
	const offered = (changes = {}) => moduleRaw({ installed: { version: 'v0.1.2' }, tag: 'v0.1.3', update: { available: true, installed: 'v0.1.2', latest: 'v0.1.3' }, ...changes })
	const first = raw => listView(listRaw([raw])).modules[0]

	it('offers the update that the core says is available, with both tags', () => {
		const module = first(offered())
		expect(module.update).toEqual({ installed: 'v0.1.2', latest: 'v0.1.3' })
		expect(module.canUpdate).toBe(true)
		expect(module.canInstall).toBe(false)
		expect(module.canRemove).toBe(true)
	})

	it('compares the tags as numbers: v0.1.10 is later than v0.1.9', () => {
		expect(first(offered({ installed: { version: 'v0.1.9' }, update: { available: true, installed: 'v0.1.9', latest: 'v0.1.10' } })).canUpdate).toBe(true)
		expect(first(offered({ installed: { version: 'v0.9.0' }, update: { available: true, installed: 'v0.9.0', latest: 'v1.0.0' } })).canUpdate).toBe(true)
	})

	it.each([
		['the core says that there is none', { update: { available: false, installed: 'v0.1.2', latest: 'v0.1.3' } }],
		['the versions are the same, whatever the core says', { update: { available: true, installed: 'v0.1.2', latest: 'v0.1.2' } }],
		['the latest is earlier, whatever the core says', { update: { available: true, installed: 'v0.1.2', latest: 'v0.1.1' } }],
		['v0.1.10 is installed and v0.1.9 is the latest', { installed: { version: 'v0.1.10' }, update: { available: true, installed: 'v0.1.10', latest: 'v0.1.9' } }],
		['the update is for another version than the one the list shows', { update: { available: true, installed: 'v0.1.1', latest: 'v0.1.3' } }],
		['the flag is not a boolean', { update: { available: 'true', installed: 'v0.1.2', latest: 'v0.1.3' } }],
		['the tags are not tags', { update: { available: true, installed: 'v0.1.2', latest: '<b>v9</b>' } }],
		['the update is not an object', { update: 'available' }],
		['the core says nothing', { update: undefined }],
		['the module is not installed', { installed: null }],
		['the installed version is not known', { installed: { version: null } }],
		['the module is broken', { broken: 'manifest_broken' }],
		['the catalogue no longer has the module', { catalogue: false }],
	])('offers no update when %s', (_, changes) => {
		expect(first(offered(changes)).canUpdate).toBe(false)
	})

	it('offers none when the catalogue is not ok, but the module can still be removed', () => {
		const view = listView(listRaw([offered()], { ok: false, error: 'invalid' }))
		expect(view.modules).toHaveLength(1)
		expect(view.modules[0].canUpdate).toBe(false)
		expect(view.modules[0].canRemove).toBe(true)
	})
})

describe('the view of the plan of an update', () => {
	const updateChecks = () => UPDATE_CHECK_CODES.map(code => ({ code, ok: true, detail: '' }))
	function updatePlanRaw(changes = {}) {
		return planRaw({
			mode: 'update',
			tag: 'v0.1.3',
			checks: updateChecks(),
			packages: { to_install: ['qemu-img'], to_upgrade: [], download_bytes: 1048576, extra_bytes: 2097152, known: true },
			update: { installed: 'v0.1.2', latest: 'v0.1.3', added: ['qemu-img'], dropped: ['old-helper'] },
			...changes,
		})
	}
	const updatePlan = (changes, options) => modulePlanView(updatePlanRaw(changes), { name: 'virt', mode: 'update', ...options })

	it('can install an update plan that is not refused, whose checks all passed, and that says what changes', () => {
		const view = updatePlan()
		expect(view.installable).toBe(true)
		expect(view.mode).toBe('update')
		expect(view.update).toEqual({ installed: 'v0.1.2', latest: 'v0.1.3', added: ['qemu-img'], dropped: ['old-helper'], moreAdded: 0, moreDropped: 0 })
		expect(view.tag).toBe('v0.1.3')
		expect(view.checks.map(check => check.code)).toEqual(UPDATE_CHECK_CODES)
		for (const check of view.checks)
			expect(check.label.key, check.code).not.toBe(CHECK_UNKNOWN)
	})

	it('can install a plan that adds no package (apt is not asked)', () => {
		const view = updatePlan({ packages: { to_install: [], to_upgrade: [], known: false }, update: { installed: 'v0.1.2', latest: 'v0.1.3', added: [], dropped: [] } })
		expect(view.installable).toBe(true)
		expect(view.packages.listed).toBe(true)
		expect(view.update.added).toEqual([])
		expect(view.update.dropped).toEqual([])
	})

	it('cuts a long list of packages and counts what it left out', () => {
		const names = Array.from({ length: 130 }, (_, index) => `pkg-${index}`)
		const view = updatePlan({ update: { installed: 'v0.1.2', latest: 'v0.1.3', added: names, dropped: names } })
		expect(view.update.added).toHaveLength(100)
		expect(view.update.moreAdded).toBe(30)
		expect(view.update.moreDropped).toBe(30)
	})

	it('is the plan of an update only in the mode of an update, and the plan of an install only in the mode of an install', () => {
		expect(modulePlanView(updatePlanRaw(), { name: 'virt' })).toBeNull()
		expect(modulePlanView(updatePlanRaw(), { name: 'virt', mode: 'install' })).toBeNull()
		expect(modulePlanView(planRaw(), { name: 'virt', mode: 'update' })).toBeNull()
		expect(modulePlanView(planRaw({ mode: 'install' }), { name: 'virt', mode: 'update' })).toBeNull()
		expect(modulePlanView(planRaw(), { name: 'virt' }).installable).toBe(true)
	})

	it.each([
		['says nothing of what changes', { update: undefined }],
		['says it as something that is not an object', { update: 'v0.1.3' }],
		['has two tags that are the same', { update: { installed: 'v0.1.3', latest: 'v0.1.3', added: [], dropped: [] } }],
		['goes back to an earlier tag', { update: { installed: 'v0.1.3', latest: 'v0.1.2', added: [], dropped: [] } }],
		['has a latest that is not the tag of the plan', { update: { installed: 'v0.1.2', latest: 'v0.1.4', added: [], dropped: [] } }],
		['has tags that are not tags', { update: { installed: 'x', latest: 'v0.1.3', added: [], dropped: [] } }],
	])('cannot install a plan that %s', (_, changes) => {
		const view = updatePlan(changes)
		expect(view.installable).toBe(false)
		expect(view.update).toBeNull()
		expect(view.noList).toBe(true)
	})

	it.each(UPDATE_REFUSALS)('cannot install a plan that is refused with %s, and says why', (code) => {
		const view = updatePlan({ refused: code, plan_id: '' })
		expect(view.installable).toBe(false)
		expect(view.refusedMessage.key).toBe(reasonMessage(code, { kind: 'update' }).key)
	})

	it.each([
		['installed', 'not_installed'],
		['installed', 'manifest_invalid'],
		['installed', 'files_unreadable'],
		['installed', 'files_unverified'],
		['newer', 'up_to_date'],
		['newer', 'downgrade'],
		['newer', 'version_unknown'],
		['foreign_unit', 'foreign_unit'],
		['foreign_unit', 'unit_changed'],
	])('says the check %s that failed with %s in the sentence of the refusal, first', (check, code) => {
		const checks = UPDATE_CHECK_CODES.map(item => ({ code: item, ok: item !== check, detail: item === check ? 'x' : '' }))
		const view = updatePlan({ refused: code, plan_id: '', checks })
		expect(view.refusedMessage.key).toBe(reasonMessage(code, { kind: 'update' }).key)
		expect(view.checks[0].code).toBe(check)
		expect(view.checks[0].mark).toBe('failed')
		expect(view.checks[0].message.key).toBe(reasonMessage(code, { kind: 'update' }).key)
	})

	it('says that the check of the version was not made when the check of the installation failed', () => {
		const checks = UPDATE_CHECK_CODES.map(item => ({ code: item, ok: !['installed', 'newer'].includes(item), detail: item === 'newer' ? 'not_checked' : item === 'installed' ? 'files_missing' : '' }))
		const view = updatePlan({ refused: 'files_unreadable', plan_id: '', checks })
		const newer = view.checks.find(check => check.code === 'newer')
		expect(newer.mark).toBe('notChecked')
		expect(newer.message).toBeNull()
		expect(view.checks.find(check => check.code === 'installed').message.key).toBe(reasonMessage('files_unreadable', { kind: 'update' }).key)
	})

	it('shows HTML in the names of the packages as text', () => {
		const view = updatePlan({ update: { installed: 'v0.1.2', latest: 'v0.1.3', added: ['<img src=x onerror=alert(1)>', 'a\u0000b'], dropped: ['x'.repeat(1000)] } })
		for (const name of [...view.update.added, ...view.update.dropped])
			expect(name).not.toMatch(UNSAFE)
		expect(view.update.dropped[0].length).toBeLessThanOrEqual(80)
	})
})

describe('the body of the install of an update', () => {
	const updateOk = () => modulePlanView(planRaw({ mode: 'update', tag: 'v0.1.3', checks: UPDATE_CHECK_CODES.map(code => ({ code, ok: true, detail: '' })), update: { installed: 'v0.1.2', latest: 'v0.1.3', added: [], dropped: [] } }), { name: 'virt', mode: 'update' })

	it('is the id of the plan that is shown and the mode of an update, and nothing else', () => {
		expect(installBody(updateOk())).toEqual({ plan_id: PLAN_ID_OK, mode: 'update' })
		expect(Object.keys(installBody(updateOk())).sort()).toEqual(['mode', 'plan_id'])
	})

	it('is the id alone for the plan of an install', () => {
		expect(installBody(plan())).toEqual({ plan_id: PLAN_ID_OK })
	})

	it('is nothing for an update plan that cannot install', () => {
		expect(installBody({ ...updateOk(), installable: false })).toBeNull()
		expect(installBody({ ...updateOk(), planId: '' })).toBeNull()
	})
})

describe('the view of the job of an update', () => {
	const ujob = (changes, options) => job({ kind: 'update', ...changes }, options)

	it('has the steps of the core, in order, each with a sentence', () => {
		expect([...STEPS.update, 'done']).toEqual(UPDATE_STEPS)
		for (const step of STEPS.update)
			expect(STEP_TEXTS.update[step], step).toBeTruthy()
		expect(STEP_TEXTS.update.putBack).toBeTruthy()
	})

	describe.each(JOB_STATE_NAMES)('in the state %s', (state) => {
		it('says each step of the update in the words of the language, and lists them all', () => {
			for (const step of ['', ...UPDATE_STEPS]) {
				const view = ujob({ state, step, code: state === 'failed' || state === 'refused' ? 'swap_failed' : '', undo: state === 'failed' ? 'rolled_back' : '' })
				expect(view, step).not.toBeNull()
				expect(view.kind).toBe('update')
				expect(view.steps.map(item => item.id)).toEqual(STEPS.update)
				for (const key of keysIn(view))
					expect(MODULE_KEYS, `${state}/${step}: ${key}`).toContain(key)
			}
		})

		it('puts the old version back in one sentence, and lists no step for it', () => {
			for (const step of ['rollback_restore', 'rollback_units', 'rollback_start', 'recover_restore', 'recover_units', 'recover_start']) {
				const view = ujob({ state, step, undo: state === 'failed' ? 'rollback_incomplete' : '' })
				expect(view.steps, step).toEqual([])
				expect(view.progress).toBeNull()
				for (const key of keysIn(view))
					expect(MODULE_KEYS, `${state}/${step}: ${key}`).toContain(key)
			}
		})
	})

	it('tells an update from the step when the core does not say, for the two steps only an update has and for its steps of putting back', () => {
		expect(job({ step: 'backup' }).kind).toBe('update')
		expect(job({ step: 'swap' }).kind).toBe('update')
		expect(job({ step: 'rollback_restore' }).kind).toBe('update')
		expect(job({ step: 'rollback_units' }).kind).toBe('update')
		expect(job({ step: 'rollback_start' }).kind).toBe('update')
		// the steps that an install and a remove have too stay as they were
		expect(job({ step: 'stop' }).kind).toBe('remove')
		expect(job({ step: 'download' }).kind).toBe('install')
		expect(job({ step: 'rollback_stop' }).kind).toBe('install')
		// what the page remembers of its call counts when nothing else says
		expect(job({ step: 'manifest' }, { kind: 'update' }).kind).toBe('update')
	})

	it('shows the progress of an update, in the words of an update', () => {
		const view = ujob({ state: 'running', step: 'backup' })
		expect(view.progress).toMatchObject({ value: 4, max: 10 })
		expect(view.progress.label).toEqual({ key: TEXT.job.progressUpdate, params: { index: '5', total: '10' } })
		expect(view.title).toEqual({ key: JOB_TITLES.running.update, params: { module: 'Virtual machines' } })
		expect(view.live.params).toMatchObject({ index: '5', total: '10' })
		expect(view.steps.map(item => item.mark)).toEqual(['done', 'done', 'done', 'done', 'current', 'pending', 'pending', 'pending', 'pending', 'pending'])
	})

	it('says that the old version is being put back, in the title, in the live region and in a line of its own', () => {
		for (const step of ['rollback_restore', 'recover_restore']) {
			const view = ujob({ state: 'running', step })
			expect(view.title).toEqual({ key: JOB_TITLES.running.putBack, params: { module: 'Virtual machines' } })
			expect(view.live).toEqual({ key: JOB_LIVE.putBack, params: { module: 'Virtual machines' } })
			expect(view.rollbackStep).toEqual({ key: TEXT.job.putBack, params: {} })
		}
		// a run that begins by putting back the copy of an update that was cut short says so too, whatever it is going to do
		const install = job({ kind: 'install', state: 'running', step: 'recover_restore' })
		expect(install.rollbackStep.key).toBe(TEXT.job.putBack)
		expect(install.steps).toEqual([])
		expect(install.title.key).toBe(JOB_TITLES.running.install)
	})

	it('says the step it stopped at, in words', () => {
		expect(ujob({ state: 'failed', step: 'backup', code: 'backup_failed', undo: 'rolled_back' }).stoppedAt.params.step).toBe(STEP_TEXTS.update.backup)
		expect(ujob({ state: 'failed', step: 'recover_restore', code: 'recovery_incomplete', undo: 'rollback_incomplete' }).stoppedAt.params.step).toBe(STEP_TEXTS.update.putBack)
	})

	describe('when it is done', () => {
		it('says the update to the version the status gives, and that the configuration was kept', () => {
			const view = ujob({ state: 'succeeded', step: 'done' }, { status: { installed: true, version: 'v0.1.3' } })
			expect(view.title).toEqual({ key: JOB_TITLES.succeeded.updateTo, params: { module: 'Virtual machines', tag: 'v0.1.3' } })
			expect(view.next).toEqual({ key: JOB_NEXT.succeededUpdate, params: {} })
			expect(view.kept).toBeNull()
			expect(view.advice).toBeNull()
			expect(view.undoText).toBeNull()
			expect(view.steps.every(item => item.mark === 'done')).toBe(true)
		})

		it.each([undefined, null, '', 'v1', '<b>v0.1.3</b>', 5])('says the update with no version when the status gives %j', (version) => {
			const view = ujob({ state: 'succeeded', step: 'done' }, { status: { installed: true, version } })
			expect(view.title).toEqual({ key: JOB_TITLES.succeeded.update, params: { module: 'Virtual machines' } })
		})
	})

	describe('when it did not go well', () => {
		it.each(ALL_CODES)('says the code %s as the reason of an update that failed', (code) => {
			const view = ujob({ state: 'failed', step: 'swap', code, undo: 'rolled_back' })
			expect(view.reason.key).not.toBe(REASON_UNKNOWN)
			expect(view.code).toBe(code)
			expect(view.title.key).toBe(code === 'backup_not_dropped' ? JOB_TITLES.failed.updateNotDropped : JOB_TITLES.failed.update)
		})

		it.each(['backup_failed', 'swap_failed', 'recovery_incomplete', 'up_to_date', 'downgrade', 'unit_changed', 'version_unknown', 'files_unverified', 'files_unreadable', 'not_installed', 'manifest_invalid'])('says %s in its own sentence', (code) => {
			const key = reasonMessage(code, { kind: 'update' }).key
			expect(key).not.toBe(REASON_UNKNOWN)
			expect(MODULE_KEYS).toContain(key)
			expect(en[key]).toBe(key)
			expect(fr[key]).not.toBe(key)
		})

		it('says that the old version is back when the core says the update was rolled back, whatever the step', () => {
			for (const step of ['packages', 'backup', 'swap', 'start', 'route']) {
				const view = ujob({ state: 'failed', step, code: 'swap_failed', undo: 'rolled_back' })
				expect(view.undoText).toEqual({ key: JOB_NEXT.updateBack, params: {} })
				expect(view.advice).toBeNull()
				expect(view.kept).toBeNull()
			}
		})

		it('says where the copy is kept, and what to press, when putting the old version back did not finish', () => {
			const view = ujob({ state: 'failed', step: 'swap', code: 'recovery_incomplete', undo: 'rollback_incomplete' })
			expect(view.undoText).toEqual({ key: JOB_NEXT.updateKept, params: {} })
			// the sentence says what it means in words, and the path is given apart, to copy
			expect(JOB_NEXT.updateKept).toContain('a file was changed while the update ran')
			expect(JOB_NEXT.updateKept).toContain('by hand')
			expect(JOB_NEXT.updateKept).toContain('Update or Remove')
			expect(view.folder).toBe('/var/lib/casaos/modules/tmp/backup-virt')
			expect(view.advice).toBeNull()
			// whatever the core says of the undo, other than it was done, is not that it was done
			expect(ujob({ state: 'failed', step: 'swap', undo: 'something_else' }).undoText.key).toBe(JOB_NEXT.updateKept)
		})

		it('names a folder only when the old version could not be put back whole', () => {
			expect(ujob({ state: 'failed', step: 'swap', undo: 'rolled_back' }).folder).toBeNull()
			expect(ujob({ state: 'failed', step: 'swap', undo: '' }).folder).toBeNull()
			expect(ujob({ state: 'interrupted', step: 'swap' }).folder).toBeNull()
			expect(ujob({ state: 'succeeded', step: 'done' }).folder).toBeNull()
			expect(ujob({ state: 'running', step: 'swap' }).folder).toBeNull()
			expect(job({ kind: 'install', state: 'failed', step: 'unpack', undo: 'rollback_incomplete' }).folder).toBeNull()
			expect(ujob({ state: 'failed', step: 'swap', undo: 'rollback_incomplete' }).folder).toBe('/var/lib/casaos/modules/tmp/backup-virt')
		})

		it('does not say that the old version is back when nothing says so', () => {
			const view = ujob({ state: 'failed', step: 'swap', code: 'swap_failed', undo: '' })
			expect(view.undoText).toEqual({ key: JOB_NEXT.updateUnknown, params: {} })
			expect(view.advice).toBeNull()
		})

		it('says an update that was cut short, and to press Update or Remove again, because ReCasaOS puts the old version back first', () => {
			for (const step of ['packages', 'backup', 'swap', 'route', 'rollback_restore', 'recover_start']) {
				const view = ujob({ state: 'interrupted', step })
				expect(view.undoText, step).toEqual({ key: JOB_NEXT.updateCut, params: {} })
				expect(view.advice).toBeNull()
				expect(view.dismissible).toBe(true)
			}
			expect(JOB_NEXT.updateCut).toContain('Press Update or Remove again')
			expect(JOB_NEXT.updateCut).toContain('puts the old version back before')
			// before it began, nothing was changed
			expect(ujob({ state: 'interrupted', step: '' }).undoText.key).toBe(JOB_NEXT.cutBeforeStart)
		})

		it('says no package that an install left, and no purge command, for an update', () => {
			expect(ujob({ state: 'failed', step: 'swap', undo: 'rolled_back', kept_packages: ['qemu-utils'] }).kept).toBeNull()
			expect(ujob({ state: 'failed', step: 'swap', undo: 'rolled_back' }).kept).toBeNull()
		})

		it('says an update that was refused, with nothing changed', () => {
			const view = ujob({ state: 'refused', step: '', code: 'up_to_date' })
			expect(view.title.key).toBe(JOB_TITLES.refused.any)
			expect(view.reason.key).toBe(REASONS.up_to_date)
		})
	})

	it('announces the change of an update once, not at each answer', () => {
		const running = ujob({ state: 'running', step: 'backup' })
		expect(jobAnnouncement(null, running)).toEqual(running.live)
		expect(jobAnnouncement(running, ujob({ state: 'running', step: 'backup' }))).toBeNull()
		expect(jobAnnouncement(running, ujob({ state: 'running', step: 'swap' }))).not.toBeNull()
	})
})

describe('the words that depend on the kind of job', () => {
	const INSTALL_FILES_UNREADABLE = 'A file that records an earlier install cannot be read. Look at it at a console, delete it by hand, then try again.'

	it('keeps the sentence of an install and of a remove for files_unreadable, byte for byte', () => {
		expect(reasonMessage('files_unreadable')).toEqual({ key: INSTALL_FILES_UNREADABLE, params: {} })
		expect(reasonMessage('files_unreadable', { kind: 'install' }).key).toBe(INSTALL_FILES_UNREADABLE)
		expect(reasonMessage('files_unreadable', { kind: 'remove' }).key).toBe(INSTALL_FILES_UNREADABLE)
		expect(job({ state: 'failed', step: 'unpack', code: 'files_unreadable', undo: 'rolled_back' }).reason.key).toBe(INSTALL_FILES_UNREADABLE)
		expect(fr[INSTALL_FILES_UNREADABLE]).toBe('Un fichier qui garde la trace d\'une installation précédente est illisible. Regardez-le sur une console, supprimez-le à la main, puis réessayez.')
		expect(moduleFailure(refusal('files_unreadable', {})).message.key).toBe(INSTALL_FILES_UNREADABLE)
	})

	it('says for an update that the record of the installed module cannot be read, that nothing was changed, and what to do', () => {
		const key = reasonMessage('files_unreadable', { kind: 'update' }).key
		expect(key).not.toBe(INSTALL_FILES_UNREADABLE)
		expect(key).toContain('The record of the installed module cannot be read')
		expect(key).toContain('Nothing was changed')
		expect(key).toContain('remove the module, then install it again')
		expect(job({ kind: 'update', state: 'failed', step: 'unpack', code: 'files_unreadable', undo: 'rolled_back' }).reason.key).toBe(key)
		expect(moduleFailure(refusal('files_unreadable', {}), 'en_us', { mode: 'update' }).message.key).toBe(key)
		expect(updatePlanFor('files_unreadable').refusedMessage.key).toBe(key)
	})

	function updatePlanFor(code) {
		return modulePlanView(planRaw({ mode: 'update', tag: 'v0.1.3', refused: code, plan_id: '', checks: [], update: { installed: 'v0.1.2', latest: 'v0.1.3', added: [], dropped: [] } }), { name: 'virt', mode: 'update' })
	}
})

describe('the result words of an update that left files, and of one whose backup stayed', () => {
	const ujob = (changes, options) => job({ kind: 'update', ...changes }, options)
	const left = ['some line', 'left: /usr/bin/virt-tool', 'left: /etc/casaos/virt.d/local.conf', 'rolled back, but these files were left as they are']

	it('does not say that the old version is back when files were left as they are, and says to remove then install', () => {
		const view = ujob({ state: 'failed', step: 'swap', code: 'swap_failed', undo: 'rolled_back_with_left', log_tail: left })
		expect(view.undoText).toEqual({ key: JOB_NEXT.updateLeft, params: {} })
		expect(view.undoText.key).not.toBe(JOB_NEXT.updateBack)
		expect(JOB_NEXT.updateLeft).toContain('the old version is not whole')
		expect(JOB_NEXT.updateLeft).toContain('Press Remove, then Install')
		expect(view.advice).toBeNull()
		expect(view.folder).toBeNull()
		expect(view.leftFiles).toEqual(['left: /usr/bin/virt-tool', 'left: /etc/casaos/virt.d/local.conf'])
		expect(view.logTail).toEqual(left)
		expect(view.dismissible).toBe(true)
		for (const key of keysIn(view))
			expect(MODULE_KEYS, key).toContain(key)
	})

	it('names the files only for that word, and only for an update', () => {
		expect(ujob({ state: 'failed', step: 'swap', undo: 'rolled_back_with_left' }).leftFiles).toEqual([])
		expect(ujob({ state: 'failed', step: 'swap', undo: 'rolled_back', log_tail: left }).leftFiles).toEqual([])
		expect(ujob({ state: 'failed', step: 'swap', undo: 'rolled_back', log_tail: left }).undoText.key).toBe(JOB_NEXT.updateBack)
		expect(job({ kind: 'install', state: 'failed', step: 'unpack', undo: 'rolled_back_with_left', log_tail: left }).leftFiles).toEqual([])
		expect(ujob({ state: 'failed', step: 'swap', undo: 'rolled_back_with_left', log_tail: [`left: ${'x'.repeat(5000)}`, 'left: <img src=x>'] }).leftFiles.every(item => item.length <= 240)).toBe(true)
	})

	describe('backup_not_dropped', () => {
		const view = () => ujob({ state: 'failed', step: '', code: 'backup_not_dropped', undo: '' })

		it('does not say that the update is done or that it stopped: it is installed, and its backup is still there', () => {
			expect(view().title).toEqual({ key: JOB_TITLES.failed.updateNotDropped, params: { module: 'Virtual machines' } })
			expect(JOB_TITLES.failed.updateNotDropped).toContain('is installed')
			expect(view().title.key).not.toBe(JOB_TITLES.succeeded.update)
			expect(view().title.key).not.toBe(JOB_TITLES.succeeded.updateTo)
			expect(view().title.key).not.toBe(JOB_TITLES.failed.update)
			expect(view().next).toBeNull()
			expect(view().reason.key).toBe(REASONS.backup_not_dropped)
			expect(view().code).toBe('backup_not_dropped')
		})

		it('names the folder as text, and says that the next job puts the old version back unless it is deleted by hand', () => {
			expect(view().undoText).toEqual({ key: JOB_NEXT.updateNotDropped, params: {} })
			expect(JOB_NEXT.updateNotDropped).toContain('put the old version back')
			expect(JOB_NEXT.updateNotDropped).toContain('by hand')
			expect(view().folder).toBe('/var/lib/casaos/modules/tmp/backup-virt')
			expect(view().advice).toBeNull()
			expect(view().kept).toBeNull()
		})

		it('lists no step as not reached, since every step was made', () => {
			expect(view().steps).toEqual([])
			expect(view().stoppedAt).toBeNull()
			// any other failure of an update still lists them
			expect(ujob({ state: 'failed', step: 'swap', code: 'swap_failed', undo: 'rolled_back' }).steps).toHaveLength(10)
		})

		it('is the sentence of an update only', () => {
			const other = job({ kind: 'install', state: 'failed', step: '', code: 'backup_not_dropped' })
			expect(other.title.key).toBe(JOB_TITLES.failed.install)
			expect(other.folder).toBeNull()
		})
	})
})

describe('the step leftovers of a remove', () => {
	it('is a step of a remove, with a sentence', () => {
		expect(STEP_TEXTS.remove.leftovers).toBe('Checking what an unfinished update left')
		expect(job({ step: 'leftovers' }).kind).toBe('remove')
	})

	it('is listed after the four steps of a remove, and only when the job is at it', () => {
		const view = job({ kind: 'remove', state: 'failed', step: 'leftovers', code: 'remove_incomplete' })
		expect(view.steps.map(item => item.id)).toEqual([...STEPS.remove, 'leftovers'])
		expect(view.steps.map(item => item.mark)).toEqual(['done', 'done', 'done', 'done', 'failed'])
		expect(view.stoppedAt.params.step).toBe(STEP_TEXTS.remove.leftovers)
		expect(job({ kind: 'remove', state: 'failed', step: 'reload', code: 'remove_incomplete' }).steps.map(item => item.id)).toEqual(STEPS.remove)
		expect(job({ kind: 'remove', state: 'succeeded', step: 'done' }).steps.map(item => item.id)).toEqual(STEPS.remove)
		const running = job({ kind: 'remove', state: 'running', step: 'leftovers' })
		expect(running.progress).toMatchObject({ value: 4, max: 5 })
	})

	it('says that the module was removed and that the log names what was left, and no command', () => {
		const view = job({ kind: 'remove', state: 'failed', step: 'leftovers', code: 'remove_incomplete' })
		expect(view.reason.key).toBe(REASONS.remove_incomplete.steps.leftovers)
		expect(view.reason.key).toContain('The module was removed')
		expect(view.reason.key).toContain('log below')
		expect(view.advice).toBeNull()
		// the same code at another step keeps its sentence
		expect(job({ kind: 'remove', state: 'failed', step: 'files', code: 'remove_incomplete' }).reason.key).toBe(REASONS.remove_incomplete.text)
		expect(job({ kind: 'remove', state: 'failed', step: 'files', code: 'remove_incomplete' }).advice).not.toBeNull()
		expect(reasonMessage('remove_incomplete').key).toBe('Some files of the module could not be deleted.')
	})
})

describe('an update of a module that was stopped', () => {
	const stopped = { installed: true, version: 'v0.1.3', unit: { active: false, enabled: false }, route: { answers: false } }
	const ujob = (changes, status) => job({ kind: 'update', ...changes }, { status })

	it('shows start and route as skipped, not failed and not pending, and keeps the headline', () => {
		const view = ujob({ state: 'succeeded', step: 'done' }, stopped)
		expect(view.steps.map(item => item.mark)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'left', 'left'])
		expect(view.steps.slice(8).map(item => item.markText)).toEqual(['Skipped: the service was stopped before the update', 'Skipped: the service was stopped before the update'])
		expect(view.title.key).toBe(JOB_TITLES.succeeded.updateTo)
		expect(view.next.key).toBe(JOB_NEXT.succeededUpdate)
		expect(STEP_MARKS.left.icon).toBeTruthy()
		expect(fr[STEP_MARKS.left.text]).toBe('Ignorée : le service était arrêté avant la mise à jour')
	})

	it.each([
		['the service runs', { ...stopped, unit: { active: true, enabled: true } }],
		['the status does not say', { installed: true, version: 'v0.1.3' }],
		['the unit is not an object', { installed: true, version: 'v0.1.3', unit: 'no' }],
		['active is not false', { installed: true, version: 'v0.1.3', unit: { active: null } }],
	])('shows every step done when %s', (_, status) => {
		expect(ujob({ state: 'succeeded', step: 'done' }, status).steps.every(item => item.mark === 'done')).toBe(true)
	})

	it('skips nothing for a job that did not succeed, or that is not an update', () => {
		expect(ujob({ state: 'failed', step: 'start', code: 'start_failed', undo: 'rolled_back' }, stopped).steps.map(item => item.mark)).not.toContain('left')
		expect(ujob({ state: 'running', step: 'swap' }, stopped).steps.map(item => item.mark)).not.toContain('left')
		expect(job({ kind: 'install', state: 'succeeded', step: 'done' }, { status: stopped }).steps.map(item => item.mark)).not.toContain('left')
	})
})

describe('the failure of a call that updates', () => {
	it.each(UPDATE_REFUSALS)('says the refusal %s of the update in its sentence and lists the checks that failed', (code) => {
		const checks = [{ code: 'installed', ok: false, detail: 'x' }, { code: 'catalogue', ok: true, detail: '' }, { code: 'newer', ok: false, detail: 'not_checked' }]
		const failure = moduleFailure(refusal(code, { checks }), 'en_us', { mode: 'update' })
		expect(failure.message.key).toBe(reasonMessage(code, { kind: 'update' }).key)
		expect(failure.items.map(item => item.code)).toEqual(['installed'])
		expect(failure.items[0].message.key).toBe(reasonMessage(['manifest_invalid', 'files_unreadable', 'files_unverified'].includes(code) ? code : 'not_installed', { kind: 'update' }).key)
	})
})

describe('the sizes', () => {
	it.each([
		[0, 'en', '0 B'],
		[1, 'en', '1 B'],
		[1023, 'en', '1,023 B'],
		[1024, 'en', '1 KiB'],
		[1025, 'en', '2 KiB'],
		[51200, 'en', '50 KiB'],
		[1048000, 'en', '1 MiB'],
		[1048576, 'en', '1 MiB'],
		[52428800, 'en', '50 MiB'],
		[52428801, 'en', '51 MiB'],
		[1073741824, 'en', '1 GiB'],
		[1610612736, 'en', '1.5 GiB'],
		[1048576 * 1023.5, 'en', '1 GiB'],
		[0, 'fr_fr', '0 o'],
		[2048, 'fr_fr', '2 Kio'],
		[52428800, 'fr_fr', '50 Mio'],
		[1610612736, 'fr_fr', '1,5 Gio'],
	])('writes %d bytes for %s as %s', (bytes, locale, expected) => {
		expect(formatBytes(bytes, locale)).toBe(expected)
	})

	it.each([-1, Number.NaN, Infinity, '5', null, undefined, {}, [], true])('writes %j as nothing', (bytes) => {
		expect(formatBytes(bytes)).toBe('')
	})

	it('survives a language that is not an Intl tag', () => {
		expect(formatBytes(2048, 'xx_not a locale')).toBe('2 KiB')
	})

	it('never writes less than what is needed', () => {
		for (const bytes of [1, 1023, 1025, 1048000, 1048577, 52428801, 1610612737]) {
			const text = formatBytes(bytes)
			const [number, unit] = text.split(' ')
			const value = Number(number.replace(',', '')) * { B: 1, KiB: 1024, MiB: 1048576, GiB: 1073741824 }[unit]
			expect(value, text).toBeGreaterThanOrEqual(bytes)
		}
	})
})

// ---- the language files ---------------------------------------------------------------------------------------------------

// a word that French writes as English does
const SAME_IN_FRENCH = new Set(['Modules'])

describe('the language files', () => {
	it('have each key once, and a good many', () => {
		expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length)
		expect(MODULE_KEYS.length).toBeGreaterThan(150)
		for (const key of [TEXT.heading, REASONS.bad_request[0], REASONS.checksum_mismatch, REASONS.start_failed.steps.start, CHECKS.disk, STEP_TEXTS.remove.files, STEP_TEXTS.any.done, JOB_TITLES.failed.install, TIERS.core.label, TEXT.job.purge, TEXT.plan.title, TEXT.outage.signin])
			expect(MODULE_KEYS).toContain(key)
	})

	it.each(MODULE_KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		if (!SAME_IN_FRENCH.has(key))
			expect(fr[key]).not.toBe(key)
		// in the order of the English: {index} and {total} are not interchangeable
		expect(fr[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		// French sets a space before : ? ! ; and a percent sign, and the English text has none to copy
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(fr[key]).not.toMatch(/[^\s%]%/)
		// the characters that vue-i18n reads as syntax are only ever the placeholders
		expect(key.replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
		expect(fr[key].replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
	})

	it('has no sentence in a language file that the tables do not say', () => {
		const said = new Set(MODULE_KEYS)
		expect(['Manage'].every(key => !said.has(key) && en[key] && fr[key])).toBe(true)
	})

	it('speaks plainly: no word of the core\'s internals in a sentence that a person reads', () => {
		for (const key of MODULE_KEYS)
			expect(key, key).not.toMatch(/\b(?:rollback_|plan_id|v-html|manifest\.json|systemctl)\b/)
	})

	// one name for what answers: ReCasaOS, as the sentences of the OS page say it ("ReCasaOS a refusé"), and not the core, and never a heart: "Cœur" is also the cores of a processor
	it('says ReCasaOS, and not the core, in English and in French', () => {
		for (const key of MODULE_KEYS) {
			expect(key, key).not.toMatch(/\bthe core\b/i)
			expect(fr[key], key).not.toMatch(/\bc(?:œ|oe)urs?\b/i)
			expect(fr[key], key).not.toMatch(/\ble core\b/i)
		}
		expect(fr[TEXT.reported]).toBe('Signalé par ReCasaOS')
		expect(fr[TIERS.core.label]).toBe('Maintenu par ReCasaOS')
	})

	it('writes the French of the page as French is written', () => {
		for (const key of MODULE_KEYS) {
			expect(fr[key], key).not.toMatch(/\bque apt\b/)
			expect(fr[key], key).not.toMatch(/\ben travers\b/)
			expect(fr[key], key).not.toMatch(/\bjeté\b/)
			// root is a user: "en tant que root", as the OS page says it
			expect(fr[key], key).not.toMatch(/\b(?:en|au) root\b/)
		}
		expect(fr[CHECKS.apt]).toBe('Paquets qu\'apt peut installer')
		expect(fr[CHECKS.foreign_unit]).toBe('Aucun fichier de service ne gêne')
		expect(fr[REASONS.not_root]).toContain('en tant que root')
	})

	// the marks of a step agree with "étape" (feminine)
	it('makes the marks of a step agree with the word for a step in French', () => {
		expect(fr[STEP_MARKS.done.text]).toBe('Faite')
		expect(fr[STEP_MARKS.pending.text]).toBe('Pas encore faite')
		expect(fr[STEP_MARKS.stopped.text]).toBe('Interrompue ici')
		expect(fr[STEP_MARKS.skipped.text]).toBe('Non atteinte')
		expect(fr[STEP_MARKS.current.text]).toBe('En cours')
		expect(fr[STEP_MARKS.failed.text]).toBe('Échec ici')
	})

	it('says one package in the singular in French, and many in the plural', () => {
		expect(fr[TEXT.job.keptOne]).toMatch(/Voici le paquet.*Il était/)
		expect(fr[TEXT.job.keptSome]).toMatch(/Voici les paquets.*Certains étaient/)
		expect(fr[TEXT.job.purgeOne]).toMatch(/^Pour le purger/)
		expect(fr[TEXT.job.purge]).toMatch(/^Pour les purger/)
	})

	// one word for each thing: a module, an update (a "mise à jour"), and the verb "mettre à jour"
	it('says the update in French with the words "mise à jour" and "mettre à jour", and never an upgrade', () => {
		for (const key of MODULE_KEYS) {
			if (/\bupdate\b/i.test(key) && !/apt-get update|package update|Update ReCasaOS/.test(key))
				expect(fr[key], key).toMatch(/à jour/)
			if (!/upgrade/i.test(key) && /\b(?:update|updating)\b/i.test(key))
				expect(fr[key], key).not.toMatch(/mise à niveau/i)
		}
		expect(fr[TEXT.update.badge]).toBe('Version {latest} disponible')
		expect(fr[TEXT.update.ok]).toBe('Mettre à jour le module')
		expect(fr[JOB_TITLES.succeeded.updateTo]).toBe('La mise à jour de {module} vers {tag} est terminée.')
		expect(fr[JOB_TITLES.running.update]).toBe('Mise à jour de {module}')
		expect(fr.Update).toBe('Mettre à jour')
	})

	it('says the headline of an install and of a removal in French', () => {
		expect(fr[JOB_TITLES.succeeded.install]).toBe('L\'installation de {module} est terminée.')
		expect(fr[JOB_TITLES.succeeded.remove]).toBe('La suppression de {module} est terminée.')
	})
})
