import { describe, expect, it } from 'vitest'
import { READINESS_ACTIONS, READINESS_CHECKS, READINESS_KEYS, canCheckReadiness, formatSize, readinessView } from './osReadiness'

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
		for (const candidates of [entry.text, entry.refuse, entry.warn, entry.info].filter(Boolean).map(list => [].concat(list))) {
			// the last one is what is said when the core sent no data for it
			expect(candidates.at(-1)).not.toMatch(/\{\w+\}/)
			// and the ones before it use data the view knows how to read
			for (const key of candidates)
				expect(key.match(/\{(\w+)\}/g) || []).toSatisfy(found => found.every(p => ['names', 'arch', 'days', 'percent', 'date', 'free', 'needed', 'total'].includes(p.slice(1, -1))))
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
		['busy', { source: 'unit', unit: 'apt-daily.service' }, { names: 'apt-daily.service' }, [{ name: 'source', value: 'unit' }]],
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
		expect(row('vendor_os', 'refuse', { variant: 'raspberrypi' }).details).toEqual([{ name: 'variant', value: 'raspberrypi' }])
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
	it('is said as a blocker that could not be checked, with the core\'s reason as text', () => {
		const found = row('broken_dpkg', 'refuse', { unknown: true }, { detail: 'timed out after 5s' })
		expect(found.title).toEqual({ key: READINESS_CHECKS.broken_dpkg.label })
		expect(found.sentence).toEqual({ key: 'ReCasaOS could not finish this check, so it counts it as a blocker until it can. Check again in a moment.', params: {} })
		expect(found.reason).toBe('timed out after 5s')
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
		expect(row('broken_dpkg', 'refuse', { unknown: true }, { detail: '' }).reason).toBe('')
	})
})

describe('the action', () => {
	it.each(Object.keys(READINESS_ACTIONS))('says what to do for %s', (action) => {
		expect(row('busy', 'refuse', {}, { action }).action).toBe(READINESS_ACTIONS[action])
	})

	it.each(['none', 'format_disk', '', undefined, null, 3, ['restart_machine'], 'constructor', '__proto__'])('says nothing for the action %j', (action) => {
		expect(row('busy', 'refuse', {}, { action }).action).toBe('')
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
		[1073741823, 'en_us', '1,024 MiB'],
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
