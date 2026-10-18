import { describe, expect, it } from 'vitest'
import {
	CHECKS,
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
const CHECK_CODES = ['catalogue', 'os', 'arch', 'recasaos', 'already_installed', 'foreign_unit', 'busy', 'disk', 'apt']
// pkg/osmodule/plan.go: the code a plan is refused with (the code of the check, but for the disk and apt checks, which say more)
const PLAN_REFUSALS = ['catalogue', 'os', 'arch', 'recasaos', 'already_installed', 'foreign_unit', 'busy', 'disk_short', 'disk_unknown', 'apt_missing', 'apt_failed', 'apt_removes', 'apt_downgrades', 'held_package', 'package_not_exact']
// pkg/modulecmd/install.go Code*
const RUN_CODES = ['not_root', 'busy', 'plan_changed', 'confirmation_needed', 'declined', 'not_installed', 'log_unwritable', 'lock_failed', 'files_unreadable', 'packages_failed', 'held_package', 'download_failed', 'download_too_large', 'checksum_mismatch', 'unpack_failed', 'units_failed', 'manifest_invalid', 'manifest_mismatch', 'manifest_write_failed', 'start_failed', 'route_timeout', 'interrupted', 'unit_not_stopped', 'remove_incomplete', 'tmp_unusable', 'state_unsafe', 'internal_error']
// pkg/osmodule/unpack.go: Unpack*, FileExists
const UNPACK_CODES = ['unpack_path', 'file_exists', 'unpack_limits', 'unpack_corrupt']
// service/system_module.go Module*, and route/v1/system_module.go (a failure that no refusal covers)
const API_CODES = ['bad_request', 'not_root', 'unsupported', 'busy', 'plan_changed', 'not_installed', 'plan_timeout', 'start_failed', 'internal']
// pkg/modulecmd/query.go: the checks that say no to a system in the list (and a module that the catalogue no longer has)
const SYSTEM_REASONS = ['os', 'arch', 'recasaos', 'catalogue']
const ALL_CODES = [...new Set([...PLAN_REFUSALS, ...RUN_CODES, ...UNPACK_CODES, ...API_CODES, ...SYSTEM_REASONS])]

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

		it('says the community sentence in plain words', () => {
			expect(TIERS.community.sentence).toBe('Maintained by the community, not proved on a real machine by ReCasaOS.')
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

	it('says a check it does not know as one, with its code', () => {
		const view = plan({ checks: [...okChecks(), { code: 'brand_new', ok: true }] })
		expect(view.checks.at(-1).label.params).toEqual({ code: 'brand_new' })
		expect(view.installable).toBe(true)
	})

	it('has a label for every check of the core', () => {
		expect(Object.keys(CHECKS)).toEqual(CHECK_CODES)
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
		expect(view.checks[0].detail.length).toBeLessThanOrEqual(200)
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

		it('for the steps of a rollback', () => {
			for (const step of REMOVE_STEPS.filter(item => item !== 'done')) {
				const view = job({ state, step: `${ROLLBACK}${step}`, undo: state === 'failed' ? 'rollback_incomplete' : '' })
				expect(view).not.toBeNull()
				expect(view.rollback).toBe(true)
				expect(view.kind).toBe('install')
				expect(view.steps).toEqual([])
				expect(view.progress).toBeNull()
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

		it.each([
			['rolled_back', 'undone', false],
			['rollback_incomplete', 'did not finish', true],
			['', 'nothing to undo', false],
		])('a job that failed with undo %j: says what happened to what it had done', (undo, words, advice) => {
			const view = job({ state: 'failed', step: 'verify', code: 'checksum_mismatch', undo }, { kind: 'install' })
			expect(view.undoText.key).toContain(words)
			expect(view.reason.key).toBe(REASONS.checksum_mismatch)
			expect(view.stoppedAt).toEqual({ key: TEXT.job.stoppedAt, params: { step: STEP_TEXTS.install.verify }, keys: ['step'] })
			expect(Boolean(view.advice)).toBe(advice)
			expect(view.tone).toBe('is-danger')
		})

		it('says an undo that it does not know as an undo that did not finish, and gives the console', () => {
			const view = job({ state: 'failed', step: 'verify', code: 'internal_error', undo: 'half' }, { kind: 'install' })
			expect(view.undoText.key).toContain('did not finish')
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
		})

		it('a job that was cut short: nothing was undone, and the console finishes it', () => {
			const view = job({ state: 'interrupted', step: 'unpack' })
			expect(view.title.key).toBe(JOB_TITLES.interrupted.any)
			expect(view.undoText.key).toBe('Nothing was undone.')
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
			expect(view.stoppedAt.params.step).toBe(STEP_TEXTS.install.unpack)
		})

		it('a remove that failed: the console finishes it', () => {
			const view = job({ state: 'failed', step: 'files', code: 'remove_incomplete' }, { kind: 'remove' })
			expect(view.advice).toEqual({ command: 'casaos module remove virt' })
			expect(view.undoText).toBeNull()
			expect(view.kept).toBeNull()
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
			expect(view.state).toBe(state)
			expect(view.advice).toBeNull()
			expect(view.reason).toBeNull()
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

		it('is not asked of a job that did not fail, or of a remove', () => {
			expect(job({ state: 'succeeded', step: 'done', kept_packages: ['a'] }, { kind: 'install' }).kept).toBeNull()
			expect(job({ state: 'failed', step: 'files', kept_packages: ['a'] }, { kind: 'remove' }).kept).toBeNull()
			expect(job({ state: 'running', step: 'download', kept_packages: ['a'] }).kept).toBeNull()
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

describe('what is said while the job cannot be read', () => {
	it('says a core that restarts as one, with the time, and goes on by itself', () => {
		expect(moduleOutage({ kind: 'down', elapsedMs: 0 })).toMatchObject({ level: 'restarting', elapsed: null })
		const later = moduleOutage({ kind: 'down', elapsedMs: 65000 })
		expect(later.level).toBe('restarting')
		expect(later.message.key).toBe('The machine is restarting. This page goes on by itself.')
		expect(later.elapsed.params.time).toBe('1 min 05 s')
	})

	it('sends the person to the machine after fifteen minutes of anything', () => {
		for (const kind of ['down', 'failed']) {
			const view = moduleOutage({ kind, elapsedMs: RESTART_LOOK_AFTER_MS })
			expect(view.level).toBe('look')
			expect(view.message.params.time).toBe('15 min 00 s')
		}
		expect(moduleOutage({ kind: 'down', elapsedMs: RESTART_LOOK_AFTER_MS - 1 }).level).toBe('restarting')
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

const refusal = (error_code, data, status = 409) => ({ response: { status, data: { success: status, message: 'x', data: { error_code, error: 'A sentence of the core, in English', data } } } })

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
		expect(moduleFailure(refusal('busy', { reason: 'x'.repeat(5000) })).detail).toHaveLength(200)
		expect(moduleFailure(refusal('busy', {})).detail).toBe('')
		expect(moduleFailure(refusal('plan_changed', { reason: 'x' })).detail).toBe('')
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
})
