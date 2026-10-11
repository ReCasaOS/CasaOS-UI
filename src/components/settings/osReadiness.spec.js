import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIX_BROKEN, READINESS_ACTIONS, READINESS_CHECKS, READINESS_KEYS, READINESS_OWN_SENTENCES, READINESS_REASONS, canCheckReadiness, detailLabel, formatSize, readinessView } from './osReadiness'

// what the window says of a check that did not finish, under its title
const DID_NOT_FINISH = 'ReCasaOS could not finish this check, so it counts it as a blocker until it can. Check again in a moment.'

// The codes of the readiness spec, pinned here: the dashboard, the CI proof and the copy of the
// report the owner keeps all use them. A code added to the table without the spec, or dropped
// from it, is noticed here.
const SPEC_CODES = Object.values({
	host: 'unsupported_os vendor_os unproven_arch container virt_xen no_systemd not_root',
	state: 'busy apps reboot_first uptime_long broken_dpkg held held_docker',
	sources: 'sources_cdrom sources_alias sources_pin sources_proposed sources_format sources_third_party sources_backports sources_firmware sources_network_checked_later',
	packages: 'foreign_arch keyring_old openssh_old host_services dkms',
	boot: 'merged_usr cgroup1 bootloader root_zfs root_luks md_degraded smart_failed fstab_unresolved fstab_network log_on_tmpfs disk_root disk_archives disk_boot ram power',
	network: 'network_uplink network_names',
	docker: 'docker_swarm docker_origin docker_down docker_update_pending containers_policy containers_ports backup_age snapshot_reminder',
	neutral: 'latest not_offered hold_until',
}).flatMap(group => group.split(' '))

// GET /v1/sys/os/readiness, as the core answers it
const HOP = {
	from: { id: 'debian', version_id: '11', codename: 'bullseye', pretty_name: 'Debian GNU/Linux 11 (bullseye)' },
	to: { id: 'debian', version_id: '12', codename: 'bookworm', pretty_name: 'Debian 12 (bookworm)' },
}

function check(code, severity = 'refuse', data = {}, extra = {}) {
	return { code, severity, title: `title of ${code}`, detail: `detail of ${code}`, data: { unknown: false, ...data }, ...extra }
}

function report(checks, extra = {}) {
	return { checked_at: '2026-10-11T20:15:02Z', state: 'blocked', hop: HOP, checks, text: 'the report as text', ...extra }
}

// the one row of a one-check report, whatever its group
function row(code, severity, data, extra, locale) {
	const view = readinessView(report([check(code, severity, data, extra)]), locale)
	return [...view.blockers, ...view.warnings, ...view.notes, ...view.passed][0]
}

describe('the table of checks', () => {
	it('has every code of the spec, and no other', () => {
		expect(Object.keys(READINESS_CHECKS).sort()).toEqual([...SPEC_CODES].sort())
	})

	it.each(SPEC_CODES)('says %s in a label and in a sentence that needs no data', (code) => {
		const entry = READINESS_CHECKS[code]
		expect(entry.label).toBeTruthy()
		for (const candidates of [entry.text, entry.refuse, entry.warn, entry.info, ...Object.values(entry.variants ?? {})].filter(Boolean).map(list => [].concat(list))) {
			// the last one is what is said when the core sent no data for it
			expect(candidates.at(-1)).not.toMatch(/\{\w+\}/)
			// and the ones before it use data the view knows how to read
			for (const key of candidates)
				expect(key.match(/\{(\w+)\}/g) || []).toSatisfy(found => found.every(p => ['names', 'variant', 'arch', 'days', 'percent', 'date', 'free', 'needed', 'total'].includes(p.slice(1, -1))))
		}
	})

	// a code that tells its causes apart by a field of the data has a sentence for each value it names, and
	// an action that it has a rule for is one that exists
	it('has its variants wherever it names the field that chooses them, and rules only for the actions that exist', () => {
		for (const [code, entry] of Object.entries(READINESS_CHECKS)) {
			expect(Boolean(entry.by), code).toBe(Boolean(entry.variants))
			for (const action of Object.keys(entry.actions ?? {}))
				expect(Object.keys(READINESS_ACTIONS), `${code}.${action}`).toContain(action)
		}
	})

	it('says what to do for every action the spec names, and nothing for none', () => {
		expect(Object.keys(READINESS_ACTIONS).sort()).toEqual(['finish_dpkg', 'free_disk_space', 'release_holds', 'restart_machine', 'review_sources', 'wait_for_apps', 'wait_for_package_manager'])
	})

	it('lists every key of the language files, once', () => {
		expect(new Set(READINESS_KEYS).size).toBe(READINESS_KEYS.length)
		expect(READINESS_KEYS.length).toBeGreaterThan(SPEC_CODES.length * 2)
	})
})

describe('a check, by its code', () => {
	it.each(SPEC_CODES)('has the label and the sentence of %s', (code) => {
		const found = row(code, 'refuse')
		expect(found.title).toEqual({ key: READINESS_CHECKS[code].label })
		const first = [].concat(READINESS_CHECKS[code].refuse ?? READINESS_CHECKS[code].text)
		expect(found.sentence).toEqual({ key: first.at(-1), params: {} })
		expect(found.code).toBe(code)
	})

	// a code the dashboard has not heard of: the core's English words, as text, never blank
	it('shows the core\'s title and detail for a code it does not know', () => {
		const found = row('from_the_future', 'warn')
		expect(found.title).toEqual({ text: 'title of from_the_future' })
		expect(found.sentence).toEqual({ text: 'detail of from_the_future' })
	})

	it('shows the code itself for a check with no title, and no sentence for one with no detail', () => {
		const found = row('from_the_future', 'warn', {}, { title: undefined, detail: undefined })
		expect(found.title).toEqual({ text: 'from_the_future' })
		expect(found.sentence).toBe(null)
	})

	it('is never blank for a check with neither a code nor a title', () => {
		const found = row(undefined, 'refuse', {}, { title: '', detail: '' })
		expect(found.title).toEqual({ key: 'A check this window does not know' })
	})

	it.each(['title', 'detail'])('takes a %s that is not text as no text', (field) => {
		const found = row('from_the_future', 'warn', {}, { [field]: { not: 'text' } })
		expect(JSON.stringify(found)).not.toContain('not')
	})

	it('does not read a code that is the name of an Object method', () => {
		for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty'])
			expect(row(code, 'refuse').title).toEqual({ text: `title of ${code}` })
	})

	// the same code can carry another severity, and then another meaning
	it('says the DKMS refusal and the DKMS warning differently', () => {
		expect(row('dkms', 'refuse').sentence.key).toMatch(/^A driver built on this machine/)
		expect(row('dkms', 'warn').sentence.key).toMatch(/^Drivers built on this machine/)
	})

	it('says the memory refusal and the memory warning differently', () => {
		expect(row('ram', 'refuse').sentence.key).toContain('less than 1 GiB')
		expect(row('ram', 'warn').sentence.key).toContain('less than 2 GiB')
	})

	it('says a disk that failed and a disk that was not looked at differently', () => {
		expect(row('smart_failed', 'refuse').sentence.key).toMatch(/failing/)
		expect(row('smart_failed', 'info').sentence.key).toMatch(/not checked/)
	})

	it('says the one sentence of a code for any severity it has no other for', () => {
		expect(row('busy', 'info').sentence.key).toBe(row('busy', 'refuse').sentence.key)
		expect(row('held_docker', 'warn').sentence.key).toBe(row('held_docker', 'info').sentence.key)
	})
})

describe('the data of a check', () => {
	it('puts the names in the sentence, as one text', () => {
		const found = row('held', 'refuse', { names: ['libc6', 'libssl3'] })
		expect(found.sentence.key).toContain('{names}')
		expect(found.sentence.params).toEqual({ names: 'libc6, libssl3' })
		expect(found.details).toEqual([])
	})

	it.each([
		['no names', {}],
		['an empty list', { names: [] }],
		['a list of nothing', { names: ['', null, 3, {}] }],
		['names that are not a list', { names: { a: 1 } }],
	])('says the plain sentence for %s', (_, data) => {
		const found = row('held', 'refuse', data)
		expect(found.sentence.key).not.toContain('{names}')
		expect(found.sentence.params).toEqual({})
	})

	it('takes one name given as a text, and keeps only the texts of a list', () => {
		expect(row('held', 'refuse', { names: 'libc6' }).sentence.params.names).toBe('libc6')
		expect(row('held', 'refuse', { names: ['libc6', 7, '', null, 'libssl3'] }).sentence.params.names).toBe('libc6, libssl3')
	})

	it('says twenty names and that there are more', () => {
		const names = Array.from({ length: 25 }, (_, i) => `pkg${i}`)
		const said = row('held', 'refuse', { names }).sentence.params.names
		expect(said.split(', ')).toHaveLength(21)
		expect(said.endsWith(', …')).toBe(true)
		expect(said).toContain('pkg19')
		expect(said).not.toContain('pkg20')
	})

	it('cuts a name that is far too long', () => {
		expect(row('held', 'refuse', { names: ['x'.repeat(500)] }).sentence.params.names.length).toBeLessThanOrEqual(80)
	})

	it('puts the sizes of a disk in the sentence, in the language asked', () => {
		const data = { free_bytes: 1200000000, needed_bytes: 2147483648 }
		expect(row('disk_root', 'refuse', data).sentence.params).toEqual({ free: '1.1 GiB', needed: '2 GiB' })
		expect(row('disk_root', 'refuse', data, {}, 'fr_fr').sentence.params).toEqual({ free: '1,1 Gio', needed: '2 Gio' })
	})

	it('reads a size in MiB as well as in bytes, and writes a small one in MiB', () => {
		expect(row('disk_boot', 'refuse', { free_mib: 120, needed_mib: 300 }).sentence.params).toEqual({ free: '120 MiB', needed: '300 MiB' })
		expect(row('disk_boot', 'refuse', { free_mib: 120, needed_mib: 300 }, {}, 'fr_fr').sentence.params).toEqual({ free: '120 Mio', needed: '300 Mio' })
		expect(row('disk_root', 'refuse', { free_mib: 1536, needed_mib: 2048 }).sentence.params).toEqual({ free: '1.5 GiB', needed: '2 GiB' })
	})

	it('says the plain sentence when a size is missing or not a size, and keeps the other in the details', () => {
		for (const data of [{ free_mib: 120 }, { needed_mib: 300 }, { free_mib: -1, needed_mib: 300 }, { free_mib: 'lots', needed_mib: 300 }, { free_mib: Number.NaN, needed_mib: 300 }, { free_mib: Infinity, needed_mib: 300 }])
			expect(row('disk_boot', 'refuse', data).sentence.params).toEqual({})
		expect(row('disk_boot', 'refuse', { free_mib: 120 }).details).toEqual([{ name: 'free_mib', value: '120' }])
	})

	it('says a size of zero', () => {
		expect(row('disk_boot', 'refuse', { free_mib: 0, needed_mib: 300 }).sentence.params.free).toBe('0 MiB')
	})

	it('puts the days, the percentage, the architecture and the memory in their sentences', () => {
		expect(row('uptime_long', 'warn', { days: 412 }).sentence.params).toEqual({ days: '412' })
		expect(row('backup_age', 'warn', { days: 31 }).sentence.params).toEqual({ days: '31' })
		expect(row('power', 'refuse', { percent: 42 }).sentence.params).toEqual({ percent: '42' })
		expect(row('unproven_arch', 'refuse', { arch: 'arm64' }).sentence.params).toEqual({ arch: 'arm64' })
		expect(row('ram', 'warn', { total_mib: 1536 }).sentence.params).toEqual({ total: '1.5 GiB' })
	})

	it.each([[-3], [1.5], ['12'], [null], [Number.NaN], [true]])('says the plain sentence for days that are %j', (days) => {
		expect(row('uptime_long', 'warn', { days }).sentence.params).toEqual({})
	})

	it('writes the date of the waiting period in the language asked, and says it plainly when it is not a date', () => {
		expect(row('hold_until', 'warn', { date: '2026-11-28' }).sentence.params).toEqual({ date: 'November 28, 2026' })
		expect(row('hold_until', 'warn', { date: '2026-11-28' }, {}, 'fr_fr').sentence.params).toEqual({ date: '28 novembre 2026' })
		expect(row('hold_until', 'warn', { date: 'soon' }).sentence.params).toEqual({})
		expect(row('hold_until', 'warn', { date: '2026-02-31' }).sentence.params).toEqual({})
	})

	// what the sentence did not use is still the core's word on the machine: it is shown, as text
	it('lists what the sentence did not use, and not what it did', () => {
		// a flag says why a check came out as it did, and is left out
		const found = row('held', 'refuse', { names: ['libc6'], count: 1, kernel_hold: false, files: ['a', 'b'], unknown: false })
		expect(found.details).toEqual([
			{ name: 'count', value: '1' },
			{ name: 'files', value: 'a, b' },
		])
	})

	it('lists the data of a code it does not know, and of a sentence that has no place for it', () => {
		expect(row('from_the_future', 'warn', { packages: ['libc6', 'libssl3'], free_mib: 12 }).details).toEqual([
			{ name: 'packages', value: 'libc6, libssl3' },
			{ name: 'free_mib', value: '12' },
		])
		// a list the sentence has no name for: a field it does not know is listed, not lost
		expect(row('held', 'refuse', { widgets: ['libc6'] }).details).toEqual([{ name: 'widgets', value: 'libc6' }])
	})

	it('keeps from the details what is not a plain name or a plain value', () => {
		const found = row('from_the_future', 'warn', { 'Bad Key': 'x', '<b>': 'x', 'nested': { a: 1 }, 'nothing': null, 'fine': 'ok', 'list': ['a', { b: 1 }, 2] })
		expect(found.details).toEqual([{ name: 'fine', value: 'ok' }, { name: 'list', value: 'a, 2' }])
	})

	it('cuts a long value and the number of values', () => {
		const data = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, 'v'.repeat(500)]))
		const found = row('from_the_future', 'warn', data)
		expect(found.details).toHaveLength(6)
		expect(found.details[0].value.length).toBeLessThanOrEqual(200)
	})

	it('says nothing of data that is not an object', () => {
		for (const data of [null, undefined, 'x', 3, ['a']])
			expect(readinessView(report([{ code: 'held', severity: 'refuse', data }])).blockers[0].details).toEqual([])
	})

	it('keeps the markup of a name as the text it is', () => {
		const hostile = '<img src=x onerror=alert(1)>'
		expect(row('held', 'refuse', { names: [hostile] }).sentence.params.names).toBe(hostile)
		expect(row('from_the_future', 'warn', { a: hostile }).details[0].value).toBe(hostile)
	})
})

// The data as the core names it: by what it is, not by the placeholder's name
describe('the data of the core\'s own checks', () => {
	it.each([
		['held', { packages: ['libc6', 'libssl3'], count: 2 }, { names: 'libc6, libssl3' }, [{ name: 'count', value: '2' }]],
		['apps', { apps: ['jellyfin'], count: 1 }, { names: 'jellyfin' }, [{ name: 'count', value: '1' }]],
		['sources_cdrom', { files: ['local.list'] }, { names: 'local.list' }, []],
		['sources_alias', { files: ['debian.list'], suites: ['stable'] }, { names: 'debian.list' }, [{ name: 'suites', value: 'stable' }]],
		['sources_third_party', { files: ['docker.list', 'tailscale.list'], hosts: ['download.docker.com'], docker_files: ['docker.list'] }, { names: 'docker.list, tailscale.list' }, [{ name: 'hosts', value: 'download.docker.com' }, { name: 'docker_files', value: 'docker.list' }]],
		// the package that has to go, and not the architecture it was built for
		['foreign_arch', { architectures: ['i386'], packages: ['libc6:i386'], count: 1 }, { names: 'libc6:i386' }, [{ name: 'architectures', value: 'i386' }, { name: 'count', value: '1' }]],
		// the service the owner knows, and not the package that brings it
		['host_services', { services: ['postgresql'], packages: ['postgresql-13'] }, { names: 'postgresql' }, [{ name: 'packages', value: 'postgresql-13' }]],
		// the source (a unit, or the maintenance of the updater) is not a word the owner reads
		['busy', { source: 'unit', unit: 'apt-daily.service' }, { names: 'apt-daily.service' }, []],
		['busy', { source: 'maintenance' }, {}, []],
		['hold_until', { not_before: '2026-11-28' }, { date: 'November 28, 2026' }, []],
		['power', { capacity: 40 }, { percent: '40' }, []],
		['disk_root', { available_bytes: 1200000000, minimum_bytes: 2147483648 }, { free: '1.1 GiB', needed: '2 GiB' }, []],
	])('says %s from its own fields', (code, data, params, details) => {
		const found = row(code, 'refuse', data)

		expect(found.sentence.params).toEqual(params)
		expect(found.details).toEqual(details)
	})

	// only the architectures, as an older or a different core might send: what there is is named
	it('names the architectures when the core sent no package', () => {
		expect(row('foreign_arch', 'refuse', { architectures: ['i386'] }).sentence.params).toEqual({ names: 'i386' })
	})

	it('says the drivers of a warning by name, and leaves the flags out', () => {
		const found = row('dkms', 'warn', { modules: ['r8168'], network: false, disk: false, secure_boot: false, mok: false })

		expect(found.sentence.params).toEqual({ names: 'r8168' })
		expect(found.details).toEqual([])
	})

	it('keeps from the list of the things concerned the ones the core sent as one name', () => {
		expect(row('busy', 'refuse', { unit: 'apt-daily.service' }).sentence.params).toEqual({ names: 'apt-daily.service' })
		expect(row('busy', 'refuse', { source: 'maintenance' }).sentence.params).toEqual({})
	})

	it('lists what says who the system is, and what it is, when the sentence has no place for it', () => {
		expect(row('unsupported_os', 'refuse', { id: 'ubuntu', version_id: '20.04' }).details).toEqual([{ name: 'id', value: 'ubuntu' }, { name: 'version_id', value: '20.04' }])
		// the variant is said by its name in the sentence
		expect(row('vendor_os', 'refuse', { variant: 'raspberrypi' }).details).toEqual([])
		expect(row('container', 'refuse', { kind: 'lxc' }).details).toEqual([{ name: 'kind', value: 'lxc' }])
		expect(row('keyring_old', 'info', { minimum: '2023.3', installed: '2021.1.1' }).details).toEqual([{ name: 'minimum', value: '2023.3' }, { name: 'installed', value: '2021.1.1' }])
	})

	it('leaves the flags of a check out, and keeps the numbers', () => {
		expect(row('broken_dpkg', 'refuse', { audit: true, updates: 2, apt_check: true }).details).toEqual([{ name: 'updates', value: '2' }])
		expect(row('reboot_first', 'refuse', { restart_requested: true }).details).toEqual([])
	})
})

describe('a check that did not answer', () => {
	// fail closed: the core says refuse with data.unknown, and the dashboard counts it a blocker
	it('is said as a blocker that could not be checked, with the core\'s own words as text when it gave no reason code', () => {
		const found = row('broken_dpkg', 'refuse', { unknown: true }, { detail: 'timed out after 5s' })
		expect(found.title).toEqual({ key: READINESS_CHECKS.broken_dpkg.label })
		expect(found.sentence).toEqual({ key: DID_NOT_FINISH, params: {} })
		expect(found.reason).toEqual({ text: 'timed out after 5s' })
		expect(found.unknown).toBe(true)
	})

	it('is a blocker whatever severity it came with', () => {
		const view = readinessView(report([check('broken_dpkg', 'warn', { unknown: true }), check('apps', 'ok', { unknown: true })]))
		expect(view.blockers.map(r => r.code)).toEqual(['broken_dpkg', 'apps'])
		expect(view.warnings).toEqual([])
		expect(view.passed).toEqual([])
	})

	it('names a check it does not know by the core\'s title', () => {
		const found = row('from_the_future', 'refuse', { unknown: true })
		expect(found.title).toEqual({ text: 'title of from_the_future' })
		expect(found.sentence.key).toMatch(/^ReCasaOS could not finish this check/)
	})

	it('is not one when unknown is anything but true', () => {
		for (const unknown of [false, 'true', 1, null, undefined])
			expect(row('broken_dpkg', 'refuse', { unknown }).unknown).toBe(false)
	})

	it('has no reason when the core gave none', () => {
		expect(row('broken_dpkg', 'refuse', { unknown: true }, { detail: '' }).reason).toBe(null)
	})

	// [c12] [c21]: the core's reason is a code of a closed set (pkg/osreadiness/engine.go), said in the window's language
	describe('and why', () => {
		const CODES = ['timeout', 'not_finished', 'tool_missing', 'too_large', 'missing', 'unreadable', 'not_allowed', 'unexpected_output', 'panic', 'invalid_result', 'failed']

		it('has a sentence for each code of the core\'s closed set, each its own, and for no other', () => {
			expect(Object.keys(READINESS_REASONS).sort()).toEqual([...CODES].sort())
			expect(new Set(Object.values(READINESS_REASONS)).size).toBe(CODES.length)
			expect(Object.keys(READINESS_OWN_SENTENCES).sort()).toEqual(['clock', 'stale'])
		})

		it.each(CODES)('says %s by its own sentence under the one of a check that did not finish, and not in the core\'s English words', (reason) => {
			const found = row('apps', 'refuse', { unknown: true, reason }, { detail: 'This could not be checked: the core says it in English.' })

			expect(found.sentence).toEqual({ key: DID_NOT_FINISH, params: {} })
			expect(found.reason).toEqual({ key: READINESS_REASONS[reason] })
			expect(JSON.stringify(found)).not.toContain('in English')
			expect(found.details).toEqual([])
		})

		it.each([
			['clock', /date of this machine is wrong/],
			['stale', /too old to know the releases/],
		])('says %s as a sentence of its own, and nothing under it', (reason, said) => {
			const found = row('unsupported_os', 'refuse', { unknown: true, reason, id: 'debian', version_id: '12' }, { detail: 'the core says it in English' })

			expect(found.sentence.key).toMatch(said)
			expect(found.sentence.key).not.toMatch(/could not finish/)
			expect(found.reason).toBe(null)
			expect(found.title).toEqual({ key: READINESS_CHECKS.unsupported_os.label })
			expect(found.unknown).toBe(true)
		})

		it('tells the owner of a ReCasaOS that is too old to update it, and not that there is no upgrade from his release', () => {
			expect(READINESS_OWN_SENTENCES.stale).toMatch(/Update ReCasaOS/)
			expect(READINESS_OWN_SENTENCES.stale).toMatch(/eighteen months/)
			expect(READINESS_OWN_SENTENCES.stale).not.toMatch(/no upgrade|not a Debian/i)
		})

		it.each(['from_the_future', 'CLOCK', 'Stale', 'constructor', '__proto__', 'toString', '', 3, null, undefined, ['timeout'], { timeout: true }])('says the core\'s own words, as text, for a reason it does not know: %j', (reason) => {
			const found = row('apps', 'refuse', { unknown: true, reason }, { detail: 'the core says' })

			expect(found.sentence).toEqual({ key: DID_NOT_FINISH, params: {} })
			expect(found.reason).toEqual({ text: 'the core says' })
		})

		it('is a blocker for a ReCasaOS that is too old, with every other check shown beside it', () => {
			const view = readinessView(report([check('unsupported_os', 'refuse', { unknown: true, reason: 'stale' }), check('held', 'ok')], { state: 'blocked' }))

			expect(view.blockers.map(r => r.code)).toEqual(['unsupported_os'])
			expect(view.passed.map(r => r.code)).toEqual(['held'])
			expect(view.summary).toEqual({ key: 'Not ready: 1 blocker', params: {} })
		})
	})
})

describe('the action', () => {
	it.each(Object.keys(READINESS_ACTIONS))('says what to do for %s', (action) => {
		expect(row('busy', 'refuse', {}, { action }).action).toBe(READINESS_ACTIONS[action])
	})

	it.each(['none', 'format_disk', '', undefined, null, 3, ['restart_machine'], 'constructor', '__proto__'])('says nothing for the action %j', (action) => {
		expect(row('busy', 'refuse', {}, { action }).action).toBe('')
	})

	// [c13] the core sends finish_dpkg for each of the three flags of broken_dpkg, and dpkg --configure -a answers two of them
	describe('of broken_dpkg', () => {
		const action = data => row('broken_dpkg', 'refuse', data, { action: 'finish_dpkg' }).action

		it.each([
			['an operation dpkg left unfinished (dpkg --audit)', { audit: true }],
			['a journal that has one', { updates: 2 }],
			['an operation dpkg left unfinished, with broken dependencies besides', { audit: true, apt_check: true }],
			['a journal that has one, with broken dependencies besides', { updates: 2, apt_check: true }],
			['both, with broken dependencies besides', { audit: true, updates: 1, apt_check: true }],
			['a core that sent no flag', {}],
		])('says dpkg --configure -a for %s', (_, data) => {
			expect(action(data)).toBe(READINESS_ACTIONS.finish_dpkg)
			expect(action(data)).toMatch(/dpkg --configure -a/)
		})

		it('says apt-get --fix-broken install for dependencies that are not met, alone', () => {
			expect(action({ apt_check: true })).toBe(FIX_BROKEN)
			expect(FIX_BROKEN).toMatch(/apt-get --fix-broken install/)
			expect(FIX_BROKEN).not.toMatch(/dpkg --configure/)
		})

		it.each([0, -1, 1.5, 'x', null])('does not take %j unfinished operations for one', (updates) => {
			expect(action({ updates, apt_check: true })).toBe(FIX_BROKEN)
		})

		it('leaves the other actions, and the action of other codes, as they are', () => {
			expect(row('broken_dpkg', 'refuse', { apt_check: true }, { action: 'restart_machine' }).action).toBe(READINESS_ACTIONS.restart_machine)
			expect(row('broken_dpkg', 'refuse', { apt_check: true }, { action: 'none' }).action).toBe('')
			expect(row('busy', 'refuse', { apt_check: true }, { action: 'finish_dpkg' }).action).toBe(READINESS_ACTIONS.finish_dpkg)
		})
	})
})

describe('the state', () => {
	function state(name, checks = [], extra = {}) {
		return readinessView(report(checks, { state: name, ...extra }))
	}

	it.each([
		['ready', 'Ready', 'is-success'],
		['attention', 'Ready, with things to look at', 'is-warning'],
		['latest', 'Latest release', 'is-info'],
		['unsupported', 'Not supported for an upgrade from here', 'is-warning'],
	])('says %s as "%s"', (name, sentence, tone) => {
		const view = state(name, name === 'attention' ? [check('uptime_long', 'warn')] : [])
		expect(view.summary).toEqual({ key: sentence, params: {} })
		expect(view.tone).toBe(tone)
		expect(view.state).toBe(name)
	})

	it('says how many blockers, in the singular and in the plural', () => {
		expect(state('blocked', [check('held')]).summary).toEqual({ key: 'Not ready: 1 blocker', params: {} })
		expect(state('blocked', [check('held'), check('broken_dpkg')]).summary).toEqual({ key: 'Not ready: {n} blockers', params: { n: 2 } })
		expect(state('blocked', [check('held')]).tone).toBe('is-danger')
	})

	it('counts the blockers it shows, not the counts the core sent', () => {
		expect(state('blocked', [check('held'), check('broken_dpkg'), check('apps')], { counts: { refuse: 1 } }).summary.params).toEqual({ n: 3 })
	})

	it('says it is not ready, without a number, when it shows no blocker', () => {
		expect(state('blocked', [check('uptime_long', 'warn')]).summary).toEqual({ key: 'Not ready', params: {} })
	})

	// a window must never say Ready next to a blocker
	it.each(['ready', 'attention'])('says blocked, whatever the core says, when %s comes with a blocker', (name) => {
		const view = state(name, [check('held'), check('uptime_long', 'warn')])
		expect(view.state).toBe('blocked')
		expect(view.summary.key).toBe('Not ready: 1 blocker')
		expect(view.tone).toBe('is-danger')
	})

	it('says attention when ready comes with a warning', () => {
		const view = state('ready', [check('uptime_long', 'warn')])
		expect(view.state).toBe('attention')
		expect(view.summary.key).toBe('Ready, with things to look at')
	})

	it('keeps unsupported as it is, with the reasons it is unsupported for', () => {
		const view = state('unsupported', [check('vendor_os')])
		expect(view.summary.key).toBe('Not supported for an upgrade from here')
		expect(view.blockers).toHaveLength(1)
	})

	it.each(['', 'READY', 'constructor', '__proto__', 'done', undefined, null, 3, {}])('reads the state %j from the checks', (name) => {
		expect(state(name, [check('held')]).state).toBe('blocked')
		expect(state(name, [check('uptime_long', 'warn')]).state).toBe('attention')
		// never "ready" for a state it does not know: nothing to say is an answer it could not read
		expect(state(name, [check('snapshot_reminder', 'info')])).toBe(null)
		expect(state(name, [])).toBe(null)
	})
})

describe('the groups', () => {
	it('puts the blockers first, then the warnings, then the notes and the checks that passed, each in the core\'s order', () => {
		const view = readinessView(report([
			check('snapshot_reminder', 'info'),
			check('uptime_long', 'warn'),
			check('held', 'refuse'),
			check('merged_usr', 'ok'),
			check('broken_dpkg', 'refuse'),
			check('docker_down', 'warn'),
			check('network_names', 'info'),
			check('ram', 'ok'),
		]))
		expect(view.blockers.map(r => r.code)).toEqual(['held', 'broken_dpkg'])
		expect(view.warnings.map(r => r.code)).toEqual(['uptime_long', 'docker_down'])
		expect(view.notes.map(r => r.code)).toEqual(['snapshot_reminder', 'network_names'])
		expect(view.passed.map(r => r.code)).toEqual(['merged_usr', 'ram'])
	})

	// a severity it does not know is shown with the warnings: never hidden in the collapsed list
	it.each(['', 'critical', 'REFUSE', 'constructor', undefined, null, 3])('shows the severity %j with the warnings', (severity) => {
		// built by hand: check() gives an undefined severity the default one
		const view = readinessView(report([{ code: 'held', severity, data: {} }], { state: 'attention' }))
		expect(view.warnings.map(r => r.code)).toEqual(['held'])
	})

	it('counts the passed checks and the notes from what it shows', () => {
		const view = readinessView(report([check('a', 'ok'), check('b', 'ok'), check('c', 'info')], { state: 'ready' }))
		expect(view.passed).toHaveLength(2)
		expect(view.notes).toHaveLength(1)
	})

	it('skips what is not a check, and keeps going', () => {
		const view = readinessView(report([null, 'held', 3, [], check('held'), undefined], { state: 'blocked' }))
		expect(view.blockers).toHaveLength(1)
	})

	it('has no group for a report without a list of checks, and still says its state', () => {
		for (const checks of [undefined, null, 'x', {}, 3]) {
			const view = readinessView({ state: 'latest', checks })
			expect(view.state).toBe('latest')
			expect([...view.blockers, ...view.warnings, ...view.notes, ...view.passed]).toEqual([])
		}
	})

	it('gives every row an id of its own, also for two checks of the same code', () => {
		const view = readinessView(report([check('held'), check('held'), check('apps', 'ok')]))
		const ids = [...view.blockers, ...view.passed].map(r => r.id)
		expect(new Set(ids).size).toBe(3)
	})
})

describe('the rest of the report', () => {
	it('names the two releases of the hop by their pretty names', () => {
		expect(readinessView(report([])).hop).toEqual({ from: 'Debian GNU/Linux 11 (bullseye)', to: 'Debian 12 (bookworm)' })
	})

	it('names a release by its id and version without a pretty name, and has no hop without both', () => {
		expect(readinessView(report([], { hop: { from: { id: 'ubuntu', version_id: '22.04' }, to: { id: 'ubuntu', version_id: '24.04', pretty_name: '' } } })).hop).toEqual({ from: 'ubuntu 22.04', to: 'ubuntu 24.04' })
		for (const hop of [undefined, null, {}, { from: HOP.from }, { to: HOP.to }, { from: {}, to: {} }, 'x'])
			expect(readinessView(report([], { hop })).hop).toBe(null)
	})

	it('writes when it checked in the language asked', () => {
		const en = readinessView(report([]), 'en_us').checkedAt
		const fr = readinessView(report([]), 'fr_fr').checkedAt
		expect(en).toMatch(/2026/)
		expect(fr).toMatch(/2026/)
		expect(fr).toMatch(/oct/)
		expect(en).not.toBe(fr)
	})

	// the core writes RFC 3339; a form the browser reads by guessing (a date, a month's name) is not one
	it.each([undefined, null, '', 'yesterday', 'October 11, 2026', '2026-10-11', '2026-13-45T99:00:00Z', 20261011, {}])('writes nothing for the moment %j', (checked_at) => {
		expect(readinessView(report([], { checked_at })).checkedAt).toBe('')
	})

	it('takes the text of the report as the core sent it, and only a text', () => {
		expect(readinessView(report([], { text: 'a\nb' })).text).toBe('a\nb')
		for (const text of [undefined, null, 3, {}, ['x']])
			expect(readinessView(report([], { text })).text).toBe('')
	})

	it.each([null, undefined, 'blocked', 3, [], [check('held')], true])('is not a view for an answer that is %j', (answer) => {
		expect(readinessView(answer)).toBe(null)
	})
})

describe('who can ask', () => {
	const os = { id: 'debian', version_id: '11', known: true, next: { id: 'debian', version_id: '12', pretty_name: 'Debian 12 (bookworm)' } }

	it('is a known Debian or Ubuntu that has a next release', () => {
		expect(canCheckReadiness(os)).toBe(true)
		expect(canCheckReadiness({ ...os, id: 'ubuntu' })).toBe(true)
		// an older core sends no known: it sends no next either, but the rule is the badge's
		expect(canCheckReadiness({ ...os, known: undefined })).toBe(true)
	})

	it.each([
		['no next release', { next: undefined }],
		['an empty next release', { next: {} }],
		['a system the core does not know', { known: false }],
		['a variant', { variant: 'raspberrypi' }],
		['a variant on a known system', { known: true, variant: 'armbian' }],
		['a distribution it has no sentences for', { id: 'linuxmint' }],
		['an id that is the name of an Object method', { id: 'constructor' }],
	])('is not for %s', (_, change) => {
		expect(canCheckReadiness({ ...os, ...change })).toBe(false)
	})

	it.each([null, undefined, {}, [], 'debian', 3])('is not for an answer that is %j', (answer) => {
		expect(canCheckReadiness(answer)).toBe(false)
	})
})

describe('the size', () => {
	it.each([
		[0, 'en_us', '0 MiB'],
		[1048576, 'en_us', '1 MiB'],
		[314572800, 'en_us', '300 MiB'],
		// cut down to what is shown, never rounded up
		[1073741823, 'en_us', '1,023 MiB'],
		[1048575, 'en_us', '0 MiB'],
		[2146435072, 'en_us', '1.9 GiB'],
		[1610612735, 'en_us', '1.4 GiB'],
		[2146435072, 'fr_fr', '1,9 Gio'],
		[1073741824, 'en_us', '1 GiB'],
		[1610612736, 'en_us', '1.5 GiB'],
		[1610612736, 'fr_fr', '1,5 Gio'],
		[314572800, 'fr_fr', '300 Mio'],
		[1610612736, 'not a locale', '1.5 GiB'],
	])('writes %d bytes in %s as "%s"', (bytes, locale, expected) => {
		expect(formatSize(bytes, locale)).toBe(expected)
	})

	it.each([-1, Number.NaN, Infinity, '12', null, undefined, {}])('writes nothing for %j', (bytes) => {
		expect(formatSize(bytes, 'en_us')).toBe('')
	})
})

// What the final core (pkg/osreadiness/checks_*.go) really puts in `data`, code by code: a sample of each, as it
// sends it. A flag (true or false) is left out by the window; any other field is said in the sentence or listed
// with a label of its own, never as a raw word.
const CORE_SAMPLES = {
	unsupported_os: ['refuse', { id: 'ubuntu', version_id: '20.04' }],
	vendor_os: ['refuse', { variant: 'truenas' }],
	unproven_arch: ['refuse', { arch: 'arm64' }],
	container: ['refuse', { kind: 'lxc' }],
	virt_xen: ['refuse', {}],
	no_systemd: ['refuse', {}],
	not_root: ['refuse', {}],
	busy: ['refuse', { source: 'unit', unit: 'apt-daily.service' }],
	apps: ['refuse', { apps: ['jellyfin'], count: 1 }],
	reboot_first: ['refuse', { restart_requested: true, running: '5.10.0-35-amd64', installed: '5.10.0-36-amd64' }],
	uptime_long: ['warn', { days: 412 }],
	broken_dpkg: ['refuse', { audit: true, updates: 2, apt_check: true }],
	held: ['refuse', { packages: ['libc6', 'snapd'], count: 2 }],
	held_docker: ['info', { packages: ['docker-ce'] }],
	sources_cdrom: ['refuse', { files: ['local.list'] }],
	sources_alias: ['refuse', { files: ['debian.list'], suites: ['stable'] }],
	sources_pin: ['refuse', { files: ['preferences', 'pin:stable'], default_release: 'bullseye' }],
	sources_proposed: ['refuse', { files: ['debian.list'], suites: ['bullseye-proposed-updates'] }],
	sources_format: ['refuse', { files: ['odd.list'] }],
	sources_third_party: ['warn', { files: ['docker.list'], hosts: ['download.docker.com'], docker_files: ['docker.list'] }],
	sources_backports: ['info', { files: ['debian.list'] }],
	sources_firmware: ['info', { non_free: true, packages: ['firmware-linux-nonfree'] }],
	foreign_arch: ['refuse', { architectures: ['i386'], packages: ['libc6'], count: 1 }],
	keyring_old: ['info', { minimum: '2021.1.1+deb11u1', installed: '2020.1' }],
	openssh_old: ['info', { installed: '1:9.2p1-2', minimum: '1:9.2p1-2+deb12u7' }],
	host_services: ['refuse', { services: ['postgresql'], packages: ['postgresql-13'] }],
	dkms: ['warn', { modules: ['r8168'], network: false, disk: false, secure_boot: true, mok: true }],
	merged_usr: ['refuse', { directories: ['/bin', '/lib'] }],
	cgroup1: ['refuse', { filesystem: 'tmpfs' }],
	bootloader: ['refuse', { kind: 'not_grub' }],
	root_zfs: ['refuse', { dataset: 'rpool/ROOT/debian' }],
	root_luks: ['refuse', { device: '/dev/sda3' }],
	md_degraded: ['refuse', { arrays: ['md0'] }],
	smart_failed: ['info', { checked: false, why: 'unavailable', disks: ['/dev/vda'] }],
	log_on_tmpfs: ['refuse', { filesystem: 'tmpfs', mount_point: '/var/log' }],
	disk_root: ['refuse', { path: '/', free_mib: 1200, needed_mib: 2048 }],
	disk_archives: ['refuse', { path: '/var/cache/apt/archives', free_mib: 900, needed_mib: 1536 }],
	disk_boot: ['refuse', { path: '/boot', free_mib: 120, needed_mib: 300 }],
	ram: ['warn', { ram_mib: 1024, swap_mib: 512, total_mib: 1536, needed_mib: 2048 }],
	power: ['refuse', { battery: 'BAT0', status: 'discharging', percent: 42 }],
	fstab_unresolved: ['refuse', { mounts: ['/data'], count: 1 }],
	fstab_network: ['warn', { mounts: ['/mnt/nas'], count: 1 }],
	network_uplink: ['refuse', { interface: 'wlan0' }],
	docker_swarm: ['refuse', {}],
	docker_origin: ['refuse', { origin: 'snap' }],
	docker_down: ['warn', {}],
	docker_update_pending: ['warn', { package: 'docker-ce', installed: '5:28.0.4-1~debian.11~bullseye', candidate: '5:29.8.0-1~debian.11~bullseye' }],
	containers_policy: ['warn', { names: ['jellyfin'], count: 1 }],
	containers_ports: ['warn', { names: ['pihole'], ports: ['53'], host_network: false }],
	backup_age: ['warn', { days: 31, last_backup: '2026-09-10' }],
	hold_until: ['warn', { not_before: '2026-11-28' }],
}

describe('what the final core really sends', () => {
	it.each(Object.entries(CORE_SAMPLES))('names every field of %s, in its sentence or with a label', (code, [severity, data]) => {
		const found = row(code, severity, data)

		expect(found.sentence).not.toBe(null)
		for (const detail of found.details)
			expect(detailLabel(detail.name), `${code}.${detail.name}`).toBeTruthy()
	})

	it('has a label for the names of the fields it lists, and none for a name it does not know', () => {
		for (const name of ['free_mib', 'needed_mib', 'total_mib', 'ram_mib', 'swap_mib', 'count', 'path', 'status', 'battery'])
			expect(detailLabel(name), name).toBeTruthy()
		for (const name of ['from_the_future', 'constructor', '__proto__', '', undefined, 3])
			expect(detailLabel(name), String(name)).toBe('')
	})

	// [c24] [c46]: the mount points are the names of the fstab rows, and the folders of merged_usr
	it.each(['fstab_unresolved', 'fstab_network'])('names the mount points in the sentence of %s', (code) => {
		const found = row(code, 'refuse', { mounts: ['/data', '/mnt/nas'], count: 2 })

		expect(found.sentence.key).toContain('{names}')
		expect(found.sentence.params).toEqual({ names: '/data, /mnt/nas' })
		expect(found.details).toEqual([{ name: 'count', value: '2' }])
	})

	it('names the folders that are not links to /usr', () => {
		const found = row('merged_usr', 'refuse', { directories: ['/bin', '/sbin'] })

		expect(found.sentence.params).toEqual({ names: '/bin, /sbin' })
		expect(found.details).toEqual([])
	})

	// the third parties are told by the Release file apt keeps of a source: a mirror it has none of is among them
	it('says that a mirror of Debian or Ubuntu that apt keeps no Release file for is listed with the third parties', () => {
		for (const sentence of [].concat(READINESS_CHECKS.sources_third_party.text)) {
			expect(sentence).toMatch(/A mirror of Debian or Ubuntu is listed here too when apt keeps no Release file for it/)
			expect(sentence).toMatch(/run apt update on the machine, then check again/)
		}
	})

	// [c15] the check runs on Ubuntu as well as on Debian, and on one folder as well as on three
	it('says the next release, and neither a distribution nor how many folders', () => {
		for (const sentence of [].concat(READINESS_CHECKS.merged_usr.text)) {
			expect(sentence).not.toMatch(/Debian|Ubuntu|\b\d\d\b/)
			expect(sentence).toMatch(/next release/)
			expect(sentence).not.toMatch(/^The folders/)
		}
		expect(row('merged_usr', 'refuse', { directories: ['/lib'] }).sentence.params).toEqual({ names: '/lib' })
		expect(row('merged_usr', 'refuse', { directories: ['/lib'] }, {}, 'fr_fr').sentence.key).toBe(row('merged_usr', 'refuse', { directories: ['/lib'] }).sentence.key)
	})

	it('says Debian, and not Ubuntu, of the keys the core checks only for Debian', () => {
		expect(READINESS_CHECKS.keyring_old.text).toMatch(/Debian/)
		expect(READINESS_CHECKS.keyring_old.text).not.toMatch(/Ubuntu/)
	})

	it('says fstab_network for what the core looks at now: a network share mounted at start without _netdev or nofail', () => {
		for (const sentence of [].concat(READINESS_CHECKS.fstab_network.text)) {
			expect(sentence).toMatch(/_netdev/)
			expect(sentence).toMatch(/nofail/)
			expect(sentence).not.toMatch(/verif/i)
		}
	})
})

// [c25] [c44]: a /boot that is too small in total is not a /boot that lacks free room
describe('disk_boot', () => {
	const small = { path: '/boot', total_mib: 512, needed_mib: 700 }

	it('says the filesystem is too small, with its size and the one needed, when the core sends no free room', () => {
		const found = row('disk_boot', 'refuse', small)

		expect(found.sentence.params).toEqual({ total: '512 MiB', needed: '700 MiB' })
		expect(found.sentence.key).toContain('{total}')
		expect(found.sentence.key).not.toContain('{free}')
		expect(found.sentence.key).toMatch(/too small/)
		expect(found.details).toEqual([{ name: 'path', value: '/boot' }])
	})

	it('says the sizes of the too small /boot in French', () => {
		expect(row('disk_boot', 'refuse', small, {}, 'fr_fr').sentence.params).toEqual({ total: '512 Mio', needed: '700 Mio' })
	})

	it('still says the free room for the variant that lacks room', () => {
		const found = row('disk_boot', 'refuse', { path: '/boot', free_mib: 120, needed_mib: 300 })

		expect(found.sentence.params).toEqual({ free: '120 MiB', needed: '300 MiB' })
		expect(found.sentence.key).toContain('{free}')
	})

	it('never tells the owner to free disk space for a /boot that is too small, whatever the core says', () => {
		expect(row('disk_boot', 'refuse', small, { action: 'free_disk_space' }).action).toBe('')
		expect(row('disk_boot', 'refuse', small, { action: 'none' }).action).toBe('')
	})

	it('tells him to free disk space when there is too little free room', () => {
		expect(row('disk_boot', 'refuse', { path: '/boot', free_mib: 120, needed_mib: 300 }, { action: 'free_disk_space' }).action).toBe(READINESS_ACTIONS.free_disk_space)
		// a core that sends no sizes at all says no room that could be freed
		expect(row('disk_boot', 'refuse', {}, { action: 'free_disk_space' }).action).toBe('')
	})

	it('says the other disks the same way as before', () => {
		expect(row('disk_root', 'refuse', { path: '/', free_mib: 1200, needed_mib: 2048 }, { action: 'free_disk_space' }).action).toBe(READINESS_ACTIONS.free_disk_space)
	})
})

// [c26]: one sentence for each reason a disk was not looked at
describe('smart_failed', () => {
	const WHY = ['no_smartctl', 'unavailable', 'no_block_device', 'no_disk', 'standby', 'partial']

	it('says a different sentence for each reason', () => {
		const keys = WHY.map(why => row('smart_failed', 'info', { checked: false, why }).sentence.key)

		expect(new Set(keys).size).toBe(WHY.length)
	})

	it('says the tool is not installed for no_smartctl, and only then', () => {
		for (const why of WHY) {
			const key = row('smart_failed', 'info', { checked: false, why }).sentence.key
			expect(/smartctl/.test(key), why).toBe(why === 'no_smartctl')
		}
	})

	it.each(['unavailable', 'standby'])('names the disks of %s', (why) => {
		const found = row('smart_failed', 'info', { checked: false, why, disks: ['/dev/sda', '/dev/sdb'] })

		expect(found.sentence.key).toContain('{names}')
		expect(found.sentence.params).toEqual({ names: '/dev/sda, /dev/sdb' })
		expect(found.details).toEqual([])
	})

	it.each(['unavailable', 'standby'])('says the sentence of %s without the disks when the core named none', (why) => {
		const found = row('smart_failed', 'info', { checked: false, why })

		expect(found.sentence.key).not.toContain('{names}')
		expect(found.sentence.params).toEqual({})
	})

	it('says that a disk that sleeps was not woken, and that a stack that is too long was asked in part', () => {
		expect(row('smart_failed', 'info', { why: 'standby' }).sentence.key).toMatch(/asleep/)
		expect(row('smart_failed', 'info', { why: 'standby' }).sentence.key).toMatch(/not woken/)
		expect(row('smart_failed', 'info', { why: 'partial' }).sentence.key).toMatch(/first 16/)
	})

	it('does not list the reason as a raw word', () => {
		for (const why of WHY)
			expect(row('smart_failed', 'info', { checked: false, why }).details, why).toEqual([])
	})

	it.each([undefined, 'from_the_future', '', 3, null, ['standby'], 'constructor'])('says that the health was not checked, without a reason, for the reason %j', (why) => {
		const found = row('smart_failed', 'info', { checked: false, why })

		expect(found.sentence.key).toMatch(/not checked/)
		expect(found.sentence.key).not.toMatch(/smartctl/)
	})

	it('still says a disk that is failing, with its name', () => {
		const found = row('smart_failed', 'refuse', { disks: ['/dev/sda'] })

		expect(found.sentence.key).toMatch(/failing/)
		expect(found.sentence.params).toEqual({ names: '/dev/sda' })
	})
})

// [c28]: the battery sentence follows the status the core sends
describe('power', () => {
	it('says the machine runs on its battery only when it is discharging', () => {
		const found = row('power', 'refuse', { battery: 'BAT0', status: 'discharging', percent: 42 })

		expect(found.sentence.key).toMatch(/running on its battery/)
		expect(found.sentence.params).toEqual({ percent: '42' })
		expect(found.details).toEqual([{ name: 'battery', value: 'BAT0' }])
	})

	it.each(['charging', 'full', 'unknown', undefined])('does not say it runs on its battery when the status is %j, and says the charge is under what an upgrade needs', (status) => {
		const found = row('power', 'refuse', { battery: 'BAT0', status, percent: 40 })

		expect(found.sentence.key).not.toMatch(/running on its battery/)
		expect(found.sentence.key).toMatch(/50%/)
		expect(found.sentence.key).toMatch(/plugged in/)
		expect(found.sentence.params).toEqual({ percent: '40' })
	})

	// [c14] the sentence says whether it runs on its battery: the status as a raw word adds nothing to it
	it.each(['charging', 'full', 'unknown', 'discharging'])('lists the battery and never the status %s', (status) => {
		expect(row('power', 'refuse', { battery: 'BAT0', status, percent: 40 }).details).toEqual([{ name: 'battery', value: 'BAT0' }])
	})

	it('says the discharging sentence without a charge when the core sent none', () => {
		const found = row('power', 'refuse', { battery: 'BAT0', status: 'discharging' })

		expect(found.sentence.key).toMatch(/running on its battery/)
		expect(found.sentence.params).toEqual({})
	})

	it('says the plain sentence for a battery that says nothing', () => {
		const found = row('power', 'refuse', {})

		expect(found.sentence.key).not.toMatch(/running on its battery/)
		expect(found.sentence.params).toEqual({})
	})

	// [d8] a charge that is not a percentage is not printed as one
	it.each([250, 101, -1, 42.5, '40', null])('does not say a charge of %j', (percent) => {
		const found = row('power', 'refuse', { status: 'discharging', percent })

		expect(found.sentence.params).toEqual({})
	})

	it('says a charge of 100%', () => {
		expect(row('power', 'refuse', { status: 'discharging', percent: 100 }).sentence.params).toEqual({ percent: '100' })
	})
})

// [c29] [c42]: an action is said only where it fits the code
describe('the action of a code', () => {
	it.each(['foreign_arch', 'sources_third_party'])('says nothing of the package sources for %s, whatever the core says', (code) => {
		expect(row(code, 'refuse', {}, { action: 'review_sources' }).action).toBe('')
		expect(row(code, 'refuse', {}, { action: 'none' }).action).toBe('')
	})

	it.each(['sources_cdrom', 'sources_alias', 'sources_pin', 'sources_proposed', 'sources_format'])('says to review the package sources for %s', (code) => {
		expect(row(code, 'refuse', {}, { action: 'review_sources' }).action).toBe(READINESS_ACTIONS.review_sources)
	})

	it('says the other actions of foreign_arch', () => {
		expect(row('foreign_arch', 'refuse', {}, { action: 'restart_machine' }).action).toBe(READINESS_ACTIONS.restart_machine)
	})
})

// [c30]: the ways the boot loader is not as the upgrade needs, systemd-boot among them, each said
describe('bootloader', () => {
	const KINDS = ['not_grub', 'systemd_boot', 'esp_not_mounted', 'esp_full', 'install_devices_empty', 'install_device_missing']

	it('says a different sentence for each kind', () => {
		const keys = KINDS.map(kind => row('bootloader', 'refuse', { kind }).sentence.key)

		expect(new Set(keys).size).toBe(KINDS.length)
	})

	it('says what to run for the two kinds of a BIOS machine', () => {
		expect(row('bootloader', 'refuse', { kind: 'install_devices_empty' }).sentence.key).toMatch(/dpkg-reconfigure grub-pc/)
		expect(row('bootloader', 'refuse', { kind: 'install_device_missing' }).sentence.key).toMatch(/dpkg-reconfigure grub-pc/)
	})

	it('says systemd-boot by its name', () => {
		expect(row('bootloader', 'refuse', { kind: 'systemd_boot' }).sentence.key).toMatch(/systemd-boot/)
		expect(row('bootloader', 'refuse', { kind: 'not_grub' }).sentence.key).not.toMatch(/systemd-boot/)
	})

	it('says the room of the EFI partition, in the language asked', () => {
		const data = { kind: 'esp_full', free_mib: 4, needed_mib: 16 }

		expect(row('bootloader', 'refuse', data).sentence.params).toEqual({ free: '4 MiB', needed: '16 MiB' })
		expect(row('bootloader', 'refuse', data, {}, 'fr_fr').sentence.params).toEqual({ free: '4 Mio', needed: '16 Mio' })
		expect(row('bootloader', 'refuse', { kind: 'esp_full' }).sentence.params).toEqual({})
	})

	it('does not list the kind as a raw word, and keeps what the sentence does not use', () => {
		expect(row('bootloader', 'refuse', { kind: 'esp_not_mounted' }).details).toEqual([])
		expect(row('bootloader', 'refuse', { kind: 'install_device_missing', count: 2 }).details).toEqual([{ name: 'count', value: '2' }])
	})

	it.each([undefined, 'from_the_future', '', 3, null, 'constructor', '__proto__'])('says the one sentence of the code for the kind %j', (kind) => {
		const found = row('bootloader', 'refuse', { kind })

		expect(found.sentence).toEqual({ key: READINESS_CHECKS.bootloader.text, params: {} })
	})
})

// the new data of the final core
describe('a system the core calls a variant', () => {
	it.each([
		['raspberrypi', 'Raspberry Pi OS'],
		['armbian', 'Armbian'],
		['dietpi', 'DietPi'],
		['proxmox', 'Proxmox VE'],
		['proxmox_backup', 'Proxmox Backup Server'],
		['proxmox_mail', 'Proxmox Mail Gateway'],
		['openmediavault', 'OpenMediaVault'],
		['truenas', 'TrueNAS'],
	])('names %s as %s', (variant, name) => {
		const found = row('vendor_os', 'refuse', { variant })

		expect(found.sentence.params).toEqual({ variant: name })
		expect(found.sentence.key).toContain('{variant}')
		expect(found.details).toEqual([])
	})

	it.each(['from_the_future', '<b>x</b>', '', 3, null, 'constructor', '__proto__'])('says the plain sentence for the variant %j', (variant) => {
		const found = row('vendor_os', 'refuse', { variant })

		expect(found.sentence.params).toEqual({})
		expect(found.sentence.key).not.toContain('{variant}')
	})
})

describe('a date that is wrong', () => {
	it('says the date of the machine is wrong, and not that there is no upgrade from this release', () => {
		const found = row('unsupported_os', 'refuse', { unknown: true, reason: 'clock', id: 'debian', version_id: '11' }, { detail: 'The date of this machine is wrong: set it.' })

		expect(found.unknown).toBe(true)
		expect(found.sentence.key).toMatch(/date of this machine is wrong/)
		expect(found.sentence.key).not.toMatch(/could not finish/)
		expect(found.reason).toBe(null)
		expect(found.title).toEqual({ key: READINESS_CHECKS.unsupported_os.label })
	})

	it.each(['timeout', 'tool_missing', 'unreadable', 'failed', undefined, 'CLOCK'])('does not say the date is wrong for the reason %j', (reason) => {
		const found = row('unsupported_os', 'refuse', { unknown: true, reason }, { detail: 'the core says' })

		expect(found.sentence.key).toMatch(/could not finish this check/)
		expect(found.reason).not.toBe(null)
	})

	it('is a blocker', () => {
		const view = readinessView(report([check('unsupported_os', 'refuse', { unknown: true, reason: 'clock' })], { state: 'blocked' }))

		expect(view.blockers).toHaveLength(1)
		expect(view.summary).toEqual({ key: 'Not ready: 1 blocker', params: {} })
	})
})

// [c5] [c22]: a Docker that is there and not running is not asked (asking would start it): the three checks that need its
// answer say they did not look, as a note
describe('a Docker that is not running', () => {
	const CODES = ['docker_swarm', 'containers_policy', 'containers_ports']

	it.each(CODES)('says %s was not looked at, in a sentence of its own, and does not list the reason', (code) => {
		const found = row(code, 'info', { why: 'not_running' })

		expect(found.severity).toBe('info')
		expect(found.sentence.key).toMatch(/^Docker is not running, so /)
		expect(found.sentence.key).toMatch(/was not looked at/)
		expect(found.sentence.key).toMatch(/changes nothing/)
		expect(found.sentence.key).toMatch(/Start Docker/)
		expect(found.details).toEqual([])
		expect(found.unknown).toBe(false)
	})

	it('says what each of the three did not look at', () => {
		const said = CODES.map(code => row(code, 'info', { why: 'not_running' }).sentence.key)

		expect(new Set(said).size).toBe(3)
		expect(said[0]).toMatch(/swarm/)
		expect(said[1]).toMatch(/would not start again/)
		expect(said[2]).toMatch(/port 53, 80 or 443/)
	})

	it.each(CODES)('says the same of %s when the note comes without a reason this window knows', (code) => {
		for (const data of [{}, { why: 'from_the_future' }, { why: 3 }]) {
			const found = row(code, 'info', data)

			expect(found.sentence.key, JSON.stringify(data)).toBe(row(code, 'info', { why: 'not_running' }).sentence.key)
		}
	})

	it.each(CODES)('still says the refusal or the warning of %s as before', (code) => {
		const sentence = [].concat(READINESS_CHECKS[code].text).at(-1)

		expect(row(code, code === 'docker_swarm' ? 'refuse' : 'warn').sentence.key).toBe(sentence)
		expect(sentence).not.toMatch(/not running/)
	})

	it('is a note: the report stays ready for it, and Docker not running is the warning of docker_down', () => {
		const view = readinessView(report([check('docker_swarm', 'info', { why: 'not_running' }), check('containers_policy', 'info', { why: 'not_running' }), check('docker_down', 'warn')], { state: 'attention' }))

		expect(view.notes.map(r => r.code)).toEqual(['docker_swarm', 'containers_policy'])
		expect(view.warnings.map(r => r.code)).toEqual(['docker_down'])
		expect(view.state).toBe('attention')
	})
})

// [c14] where Docker comes from: the core names it, and the window says it in words
describe('docker_origin', () => {
	it.each([
		['distribution', /docker\.io package/],
		['snap', /from snap/],
		['unknown', /put there by hand/],
	])('says %s in words, and does not list it as a raw word', (origin, said) => {
		const found = row('docker_origin', 'refuse', { origin })

		expect(found.sentence.key).toMatch(said)
		expect(found.sentence.key).toMatch(/Docker's own repository \(docker-ce\)/)
		expect(found.details).toEqual([])
	})

	it('says a different thing for each origin', () => {
		const said = ['distribution', 'snap', 'unknown'].map(origin => row('docker_origin', 'refuse', { origin }).sentence.key)

		expect(new Set(said).size).toBe(3)
	})

	it.each(['from_the_future', '', 3, null, undefined, 'constructor', '__proto__'])('says the plain sentence of the code for the origin %j', (origin) => {
		expect(row('docker_origin', 'refuse', { origin }).sentence.key).toBe(READINESS_CHECKS.docker_origin.text)
	})
})

// [c11] a pending update of a Docker whose packages are on hold: what the sentence says of the window is true of the window
describe('the System packages window and a held Docker', () => {
	it('asks to confirm a hold before it updates Docker, as the sentence of the report says', () => {
		const modal = readFileSync('src/components/settings/SystemPackageUpdateModal.vue', 'utf8')

		expect(READINESS_CHECKS.docker_update_pending.variants.true).toMatch(/System packages window \(it asks you to confirm, because of the hold\)/)
		// the box of the confirmation, and the button that waits for it
		expect(modal).toContain('I know the packages are on hold and I want to update anyway')
		expect(modal).toContain('dockerHeldConfirmed')
		expect(modal).toContain('dockerAwaitsBox')
	})
})

describe('docker_update_pending', () => {
	const data = { package: 'docker-ce', installed: '5:28.0.4-1~debian.11~bullseye', candidate: '5:29.8.0-1~debian.11~bullseye' }

	it('tells him to update Docker first when its packages are not on hold', () => {
		const found = row('docker_update_pending', 'warn', data)

		expect(found.sentence.key).toMatch(/Update Docker first/)
		expect(found.details.map(detail => detail.name)).toEqual(['package', 'installed', 'candidate'])
	})

	it('says, when its packages are on hold, that a newer Docker exists, that the upgrade leaves it as it is, and where to update it', () => {
		const found = row('docker_update_pending', 'info', { ...data, held: true })

		expect(found.sentence.key).toMatch(/newer Docker exists/)
		expect(found.sentence.key).toMatch(/on hold/)
		expect(found.sentence.key).toMatch(/leaves Docker as it is/)
		expect(found.sentence.key).toMatch(/System packages window/)
		expect(found.sentence.key).toMatch(/before or after the upgrade/)
		expect(found.sentence.key).not.toMatch(/Update Docker first/)
		expect(found.details.map(detail => detail.name)).toEqual(['package', 'installed', 'candidate'])
	})

	it('is a note, not a blocker and not a warning', () => {
		const view = readinessView(report([check('docker_update_pending', 'info', { ...data, held: true })], { state: 'ready' }))

		expect(view.notes.map(r => r.code)).toEqual(['docker_update_pending'])
		expect(view.state).toBe('ready')
	})

	it('says the sentence of a warning for a held that is not true', () => {
		for (const held of [false, 'yes', 1, null])
			expect(row('docker_update_pending', 'warn', { ...data, held }).sentence.key).toMatch(/Update Docker first/)
	})
})

// [d8]: what the window cuts
describe('a core that says far too much', () => {
	const long = 'x'.repeat(10000)

	it('cuts the title and the detail of a code it does not know', () => {
		const found = row('from_the_future', 'warn', {}, { title: long, detail: long })

		expect(found.title.text.length).toBe(300)
		expect(found.sentence.text.length).toBe(300)
	})

	it('cuts the reason of a check that did not answer', () => {
		const found = row('broken_dpkg', 'refuse', { unknown: true }, { detail: long })

		expect(found.reason.text.length).toBe(300)
	})

	it('cuts a code that is far too long', () => {
		expect(row(long, 'warn').code.length).toBe(80)
	})
})

describe('the size, cut down to what is said', () => {
	it.each([
		['disk_root', { free_mib: 2047, needed_mib: 2048 }, { free: '1.9 GiB', needed: '2 GiB' }],
		['disk_archives', { free_mib: 1535, needed_mib: 1536 }, { free: '1.4 GiB', needed: '1.5 GiB' }],
		['disk_boot', { free_mib: 299, needed_mib: 300 }, { free: '299 MiB', needed: '300 MiB' }],
	])('never says the same number for what is lacking and what is needed (%s)', (code, data, params) => {
		const found = row(code, 'refuse', data)

		expect(found.sentence.params).toEqual(params)
		expect(found.sentence.params.free).not.toBe(found.sentence.params.needed)
	})

	it('says the memory that is just under the 2 GiB it warns under as under it', () => {
		expect(row('ram', 'warn', { total_mib: 2047 }).sentence.params).toEqual({ total: '1.9 GiB' })
	})

	it('says a size of exactly the threshold as the threshold', () => {
		expect(row('disk_root', 'refuse', { free_mib: 2048, needed_mib: 2048 }).sentence.params).toEqual({ free: '2 GiB', needed: '2 GiB' })
	})
})
