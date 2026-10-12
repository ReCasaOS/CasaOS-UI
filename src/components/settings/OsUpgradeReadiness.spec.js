// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OsUpgradeReadiness from './OsUpgradeReadiness.vue'
import { READINESS_KEYS } from './osReadiness'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent: the real English and French tables, in the plugin's
// own setup (fallback to English, the language's name in lower case).
vi.mock('@/assets/lang', async () => ({
	default: {
		en_us: (await import('@/assets/lang/en_US.json')).default,
		fr_fr: (await import('@/assets/lang/fr_FR.json')).default,
	},
}))

const copy = vi.hoisted(() => vi.fn())
vi.mock('clipboard-copy', () => ({ default: copy }))

// From the project root: import.meta.url is not a file URL under happy-dom.
const source = readFileSync('src/components/settings/OsUpgradeReadiness.vue', 'utf8')

const TEXT = 'ReCasaOS readiness report\nstate: blocked\n'

// GET /v1/sys/os/readiness for the owner's machine, as the core answers it
function check(code, severity, data = {}, extra = {}) {
	return { code, severity, title: `title of ${code}`, detail: `detail of ${code}`, data: { unknown: false, ...data }, action: 'none', ...extra }
}

const REPORT = {
	checked_at: '2026-10-11T20:15:02Z',
	state: 'blocked',
	hop: {
		from: { id: 'debian', version_id: '11', codename: 'bullseye', pretty_name: 'Debian GNU/Linux 11 (bullseye)' },
		to: { id: 'debian', version_id: '12', codename: 'bookworm', pretty_name: 'Debian 12 (bookworm)' },
	},
	counts: { refuse: 2, warn: 1, ok: 2, info: 1 },
	checks: [
		check('held', 'refuse', { names: ['libc6', 'libssl3'] }, { action: 'release_holds' }),
		check('merged_usr', 'ok'),
		check('reboot_first', 'refuse', {}, { action: 'restart_machine' }),
		check('containers_policy', 'warn', { names: ['jellyfin'] }),
		check('snapshot_reminder', 'info'),
		check('ram', 'ok'),
	],
	text: TEXT,
}

const getOsReadiness = vi.fn()
let wrapper

function open(options = {}) {
	wrapper = mount(OsUpgradeReadiness, {
		props: { locale: 'en_us' },
		global: { plugins: [Buefy, i18n], mocks: { $api: { sys: { getOsReadiness } } } },
		...options,
	})
	return wrapper
}

function close() {
	wrapper?.unmount()
	wrapper = null
}

const answer = report => Promise.resolve({ data: { success: 200, message: 'ok', data: report } })
const failure = (error = {}) => Promise.reject(Object.assign(new Error('failed'), error))

// a call that is still out, and that the test answers when it chooses
function deferred() {
	const control = {}
	control.promise = new Promise((resolve, reject) => {
		control.resolve = resolve
		control.reject = reject
	})
	return control
}

// a window opened, the button pressed, the answer in
async function run(report = REPORT, options = {}) {
	close()
	getOsReadiness.mockReturnValueOnce(answer(report))
	open(options)
	await wrapper.find('.os-readiness-check').trigger('click')
	await flushPromises()
	return wrapper
}

const buttons = () => wrapper.findAll('button').map(button => button.text())

beforeEach(() => {
	i18n.global.locale = 'en_us'
	getOsReadiness.mockReset()
	copy.mockReset()
})

afterEach(() => {
	close()
})

describe('the readiness section, before it is asked', () => {
	it('says what it is for, that it changes nothing, and has one button', () => {
		open()

		expect(wrapper.find('.os-readiness-title').text()).toBe('Can this machine be upgraded?')
		expect(wrapper.find('.os-readonly').text()).toBe('This check changes nothing on the machine.')
		expect(buttons()).toEqual(['Check whether this machine can be upgraded'])
		expect(wrapper.find('section').attributes('aria-labelledby')).toBe('os-readiness-title')
		expect(wrapper.find('#os-readiness-title').exists()).toBe(true)
	})

	it('asks the core nothing until the button is pressed', () => {
		open()

		expect(getOsReadiness).not.toHaveBeenCalled()
		expect(wrapper.find('.os-readiness-report').exists()).toBe(false)
	})

	// the one place the window announces what happens to it: there before anything is in it
	it('has its announcing place from the start, and empty', () => {
		open()

		expect(wrapper.find('[role="status"]').text()).toBe('')
		expect(wrapper.find('[role="status"]').attributes('aria-live')).toBe('polite')
	})
})

describe('asking', () => {
	it('asks once, says it takes up to 20 seconds, and does not ask twice', async () => {
		const { promise, resolve } = deferred()
		getOsReadiness.mockReturnValue(promise)
		open()

		await wrapper.find('.os-readiness-check').trigger('click')
		await wrapper.find('.os-readiness-check').trigger('click')

		expect(getOsReadiness).toHaveBeenCalledTimes(1)
		expect(wrapper.find('[role="status"]').text()).toBe('This takes up to 20 seconds')
		expect(wrapper.find('.os-readiness-check').classes()).toContain('is-loading')
		// the button is still a button the focus can stay on
		expect(wrapper.find('.os-readiness-check').attributes('disabled')).toBeUndefined()

		resolve({ data: { data: REPORT } })
		await flushPromises()
		expect(wrapper.find('[role="status"]').text()).toBe('')
		expect(wrapper.find('.os-readiness-check').classes()).not.toContain('is-loading')
	})

	it('asks again for another answer, and shows nothing of the old one while it waits', async () => {
		await run()
		expect(buttons()[0]).toBe('Check again')

		const { promise, resolve } = deferred()
		getOsReadiness.mockReturnValue(promise)
		await wrapper.find('.os-readiness-check').trigger('click')
		expect(wrapper.find('.os-readiness-report').exists()).toBe(false)
		expect(getOsReadiness).toHaveBeenCalledTimes(2)

		resolve({ data: { data: { ...REPORT, state: 'latest', checks: [] } } })
		await flushPromises()
		expect(wrapper.find('.os-readiness-result').text()).toBe('Latest release')
		expect(wrapper.text()).not.toContain('libc6')
	})

	it('keeps nothing from one opening of the window to the next', async () => {
		await run()
		expect(wrapper.find('.os-readiness-report').exists()).toBe(true)
		close()

		open()
		expect(wrapper.find('.os-readiness-report').exists()).toBe(false)
		expect(getOsReadiness).toHaveBeenCalledTimes(1)
		expect(buttons()).toEqual(['Check whether this machine can be upgraded'])
	})
})

describe('the answer', () => {
	it('says the state, with the number of blockers, as a danger', async () => {
		await run()

		expect(wrapper.find('.os-readiness-result').text()).toBe('Not ready: 2 blockers')
		expect(wrapper.find('article.message').classes()).toContain('is-danger')
		expect(wrapper.find('.os-readiness-hop').text()).toBe('Checked for the upgrade from Debian GNU/Linux 11 (bullseye) to Debian 12 (bookworm).')
	})

	it('lists the blockers first, each with the sentence of its code, its data and what to do', async () => {
		await run()

		const blockers = wrapper.find('.os-readiness-group.is-blockers')
		expect(blockers.find('h5').text()).toBe('Blockers')
		const rows = blockers.findAll('.os-check')
		expect(rows).toHaveLength(2)
		expect(rows[0].find('.os-check-title').text()).toBe('Held packages')
		expect(rows[0].find('.os-check-sentence').text()).toBe('Some packages are on hold (libc6, libssl3). A hold is a deliberate choice, so ReCasaOS never lifts it for you, and the upgrade can fail halfway when it cannot update them.')
		expect(rows[0].find('.os-check-action').text()).toBe('Release the holds you no longer need (sudo apt-mark unhold, then the package name), then check again.')
		expect(rows[1].find('.os-check-title').text()).toBe('Pending restart')
		expect(rows[1].find('.os-check-action').text()).toBe('Restart the machine, then check again.')
		expect(rows[0].classes()).toContain('is-refuse')
	})

	it('puts the warnings after the blockers', async () => {
		await run()

		const groups = wrapper.findAll('.os-readiness-group').map(group => group.classes().find(name => name.startsWith('is-')))
		expect(groups).toEqual(['is-blockers', 'is-warnings', 'is-others'])
		const warnings = wrapper.find('.os-readiness-group.is-warnings')
		expect(warnings.find('h5').text()).toBe('Things to look at')
		expect(warnings.find('.os-check-sentence').text()).toContain('jellyfin')
		// an action of none says nothing
		expect(wrapper.findAll('.os-check-action')).toHaveLength(2)
	})

	it('folds the notes and the checks that passed into one closed list, with their counts', async () => {
		await run()

		const others = wrapper.find('details.os-readiness-group')
		expect(others.attributes('open')).toBeUndefined()
		expect(others.find('summary').text()).toBe('Other checks (passed: 2, notes: 1)')
		const rows = others.findAll('.os-check')
		// the note says what it is; what passed says only what was looked at
		expect(rows[0].find('.os-check-sentence').text()).toContain('take a snapshot of the machine')
		expect(rows[1].find('.os-check-title').text()).toBe('Passed Merged /usr layout')
		expect(rows[1].find('.os-check-sentence').exists()).toBe(false)
		expect(rows[2].find('.os-check-title').text()).toBe('Passed Memory')
	})

	it('says when it checked', async () => {
		await run()

		expect(wrapper.find('.os-readiness-when').text()).toMatch(/^Checked on .*2026/)
	})

	it('puts the focus on the result, to be read from its heading', async () => {
		await run(REPORT, { attachTo: document.body })

		expect(document.activeElement).toBe(wrapper.find('.os-readiness-result').element)
		expect(wrapper.find('.os-readiness-result').attributes('tabindex')).toBe('-1')
	})

	it('says Ready, Ready with things to look at, the latest release, and not supported', async () => {
		for (const [state, checks, sentence, tone] of [
			['ready', [check('merged_usr', 'ok')], 'Ready', 'is-success'],
			['attention', [check('uptime_long', 'warn', { days: 412 })], 'Ready, with things to look at', 'is-warning'],
			['latest', [], 'Latest release', 'is-info'],
			['unsupported', [check('vendor_os', 'refuse')], 'Not supported for an upgrade from here', 'is-warning'],
		]) {
			await run({ ...REPORT, state, checks })
			expect(wrapper.find('.os-readiness-result').text()).toBe(sentence)
			expect(wrapper.find('article.message').classes()).toContain(tone)
		}
	})

	it('never says Ready next to a blocker', async () => {
		await run({ ...REPORT, state: 'ready' })
		expect(wrapper.find('.os-readiness-result').text()).toBe('Not ready: 2 blockers')
	})

	it('says a check that did not answer as a blocker, with the core\'s reason as text', async () => {
		await run({ ...REPORT, checks: [check('broken_dpkg', 'refuse', { unknown: true }, { detail: 'timed out after 5s' })] })

		expect(wrapper.find('.os-readiness-result').text()).toBe('Not ready: 1 blocker')
		const row = wrapper.find('.os-check')
		expect(row.find('.os-check-title').text()).toBe('Package manager state')
		expect(row.find('.os-check-sentence').text()).toBe('ReCasaOS could not finish this check, so it counts it as a blocker until it can. Check again in a moment.')
		expect(row.find('.os-check-reason').text()).toBe('timed out after 5s')
	})

	// [c12] [c21]: the core's reason is a code, and the window says it in its own language
	it('says why a check did not answer by the code of its reason, in the language of the window, and not in the core\'s English words', async () => {
		const checks = [check('apps', 'refuse', { unknown: true, reason: 'tool_missing' }, { detail: 'This could not be checked: a tool it needs is not installed.' })]

		await run({ ...REPORT, checks })
		expect(wrapper.find('.os-check-sentence').text()).toBe('ReCasaOS could not finish this check, so it counts it as a blocker until it can. Check again in a moment.')
		expect(wrapper.find('.os-check-reason').text()).toBe('A tool this check needs is not installed on this machine.')

		i18n.global.locale = 'fr_fr'
		await run({ ...REPORT, checks }, { props: { locale: 'fr_fr' } })
		expect(wrapper.find('.os-check-sentence').text()).toBe('ReCasaOS n\'a pas pu terminer ce contrôle : il le compte comme bloquant tant qu\'il n\'a pas abouti. Relancez la vérification dans un instant.')
		expect(wrapper.find('.os-check-reason').text()).toBe('Un outil dont ce contrôle a besoin n\'est pas installé sur cette machine.')
		expect(wrapper.text()).not.toContain('This could not be checked')
	})

	it('shows the plain sentence of a code for a core that sent no data, and keeps what it did send', async () => {
		await run({ ...REPORT, checks: [check('held', 'refuse'), check('disk_boot', 'refuse', { free_mib: 120 })] })

		const rows = wrapper.findAll('.os-check')
		expect(rows[0].find('.os-check-sentence').text()).toMatch(/^Some packages are on hold\. A hold/)
		// the one number the core did send is not lost
		expect(rows[1].find('.os-check-details').text()).toBe('Free (MiB): 120')
	})

	it('lists the other fields of the core on one line, in its order', async () => {
		await run({ ...REPORT, checks: [check('sources_third_party', 'warn', { docker_files: ['docker.list'], files: ['docker.list', 'tailscale.list'], hosts: ['download.docker.com'], other_files: ['tailscale.list'] })] })

		expect(wrapper.find('.os-check-details').text()).toBe('Docker\'s files: docker.list · Hosts: download.docker.com')
	})

	it('shows the sizes in the sentence', async () => {
		await run({ ...REPORT, checks: [check('disk_boot', 'refuse', { free_mib: 120, needed_mib: 300 }, { action: 'free_disk_space' })] })

		expect(wrapper.find('.os-check-sentence').text()).toBe('The /boot partition has only 120 MiB free, and the upgrade needs at least 300 MiB. The new kernel could not be installed, and the machine might not start.')
		expect(wrapper.find('.os-check-details').exists()).toBe(false)
		expect(wrapper.find('.os-check-action').text()).toBe('Free some disk space, then check again.')
	})
})

describe('the fields of a check, in the owner\'s words', () => {
	it('names each field by its label, the name of one it has no label for as it is, and keeps the markup of a value as text', async () => {
		await run({ ...REPORT, checks: [check('from_the_future', 'warn', { count: 2, path: '/boot', other: '<b>x</b>' })] })

		expect(wrapper.find('.os-check-details').text()).toBe('Number: 2 · Path: /boot · other: <b>x</b>')
		expect(wrapper.find('.os-check-details b').exists()).toBe(false)
	})

	it('names them in French, with the space French sets before a colon', async () => {
		i18n.global.locale = 'fr_fr'
		await run({ ...REPORT, checks: [check('disk_boot', 'refuse', { path: '/boot', free_mib: 120 }), check('from_the_future', 'warn', { other: 'x' })] }, { props: { locale: 'fr_fr' } })
		const details = wrapper.findAll('.os-check-details').map(detail => detail.text())
		expect(details).toEqual(['Chemin : /boot · Libre (Mio) : 120', 'other : x'])
	})
})

// the icon is what backs the colour up: a blocker never has the check mark of a check that passed
describe('the icon of a row', () => {
	it.each([
		['refuse', 'mdi-alert-circle-outline'],
		['warn', 'mdi-alert-outline'],
		['info', 'mdi-information-outline'],
		['ok', 'mdi-check-circle-outline'],
	])('is %s for %s', async (severity, icon) => {
		await run({ state: 'blocked', checks: [check('held', 'refuse'), check('uptime_long', severity === 'refuse' ? 'refuse' : severity)] })

		const rows = wrapper.findAll(`.os-check.is-${severity}`)
		expect(rows.length).toBeGreaterThan(0)
		for (const row of rows) {
			expect(row.find('.os-check-icon').html()).toContain(icon)
			// the icon is for the eye: the sentence and the word Passed are for the ear
			expect(row.find('.os-check-icon').attributes('aria-hidden')).toBe('true')
		}
	})

	it('is not the check mark for a blocker', async () => {
		await run({ state: 'blocked', checks: [check('held', 'refuse')] })

		expect(wrapper.find('.os-check.is-refuse .os-check-icon').html()).not.toContain('check-circle')
	})
})

describe('rows of the final core', () => {
	it('says the date of the machine is wrong, as a blocker, and only that', async () => {
		await run({ state: 'blocked', checks: [check('unsupported_os', 'refuse', { unknown: true, reason: 'clock', id: 'debian', version_id: '11' }, { detail: 'The date of this machine is wrong: set it.' })] })

		expect(wrapper.find('.os-readiness-result').text()).toBe('Not ready: 1 blocker')
		expect(wrapper.find('.os-check-title').text()).toBe('Operating system version')
		expect(wrapper.find('.os-check-sentence').text()).toMatch(/^The date of this machine is wrong: it is before the day/)
		expect(wrapper.find('.os-check-reason').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('There is no upgrade')
	})

	// [c3]: a table of releases more than eighteen months old is a ReCasaOS to update, and not a release with no upgrade
	it('says this ReCasaOS is too old to know the releases, as a blocker, with the other checks beside it, in both languages', async () => {
		const report = { state: 'blocked', checks: [check('unsupported_os', 'refuse', { unknown: true, reason: 'stale', id: 'debian', version_id: '12' }, { detail: 'The table of the releases that this ReCasaOS carries was written on 2026-10-09, more than eighteen months ago.' }), check('merged_usr', 'ok')] }

		await run(report)
		expect(wrapper.find('.os-readiness-result').text()).toBe('Not ready: 1 blocker')
		expect(wrapper.find('.os-check-title').text()).toBe('Operating system version')
		expect(wrapper.find('.os-check-sentence').text()).toMatch(/^This ReCasaOS is too old to know the releases: .*Update ReCasaOS/)
		expect(wrapper.find('.os-check-reason').exists()).toBe(false)
		expect(wrapper.find('.os-check-details').exists()).toBe(false)
		expect(wrapper.find('.os-readiness-group.is-others summary').text()).toBe('Other checks (passed: 1, notes: 0)')
		expect(wrapper.text()).not.toContain('There is no upgrade')
		expect(wrapper.text()).not.toContain('eighteen months ago.')

		i18n.global.locale = 'fr_fr'
		await run(report, { props: { locale: 'fr_fr' } })
		expect(wrapper.find('.os-check-sentence').text()).toMatch(/^Cette version de ReCasaOS est trop ancienne pour connaître les versions : .*Mettez ReCasaOS à jour/)
		expect(wrapper.find('.os-check-reason').exists()).toBe(false)
	})

	// [c5] [c22]: Docker is there and not running, so the checks that need its answer say they did not look
	it('says the checks that did not ask Docker, as notes, and the warning of docker_down beside them', async () => {
		await run({ state: 'attention', checks: [check('docker_down', 'warn'), check('docker_swarm', 'info', { why: 'not_running' }), check('containers_policy', 'info', { why: 'not_running' }), check('containers_ports', 'info', { why: 'not_running' })] })

		expect(wrapper.find('.os-readiness-result').text()).toBe('Ready, with things to look at')
		const notes = wrapper.findAll('.os-readiness-group.is-others .os-check')
		expect(notes).toHaveLength(3)
		expect(notes[0].find('.os-check-title').text()).toBe('Docker Swarm')
		expect(notes[0].find('.os-check-sentence').text()).toMatch(/^Docker is not running, so whether this machine is part of a Docker swarm was not looked at/)
		expect(notes[2].find('.os-check-sentence').text()).toMatch(/port 53, 80 or 443/)
		// the reason is the sentence's, and not a raw word beside it
		expect(wrapper.findAll('.os-check-details')).toHaveLength(0)
		expect(wrapper.text()).not.toContain('not_running')
	})

	// [c3] [c4] [c5]: three sentences the owner reads of his own machine, true of every cause the core has for them
	it('says Docker not running or not answering, a Docker of an unknown origin and the merged /usr refusal, in both languages', async () => {
		const report = { state: 'blocked', checks: [check('docker_origin', 'refuse', { origin: 'unknown' }), check('merged_usr', 'refuse', { directories: ['/bin', '/lib'] }), check('docker_down', 'warn')] }

		await run(report)
		let rows = wrapper.findAll('.os-check-sentence').map(sentence => sentence.text())
		expect(rows[0]).toMatch(/^Docker is on this machine, but it does not come from Docker's own repository: .*a snap whose service is stopped/)
		expect(rows[1]).toMatch(/^Some of the system folders are not links to \/usr \(\/bin, \/lib\), as they are in the merged \/usr layout\. ReCasaOS refuses to upgrade such a system for now/)
		expect(rows[2]).toMatch(/^Docker is not running, or does not answer, so ReCasaOS cannot see your containers/)

		i18n.global.locale = 'fr_fr'
		await run(report, { props: { locale: 'fr_fr' } })
		rows = wrapper.findAll('.os-check-sentence').map(sentence => sentence.text())
		expect(rows[0]).toMatch(/^Docker est présent sur cette machine, mais il ne vient pas du dépôt de Docker lui-même : /)
		expect(rows[1]).toMatch(/^Certains dossiers du système ne sont pas des liens vers \/usr \(\/bin, \/lib\), comme ils le sont avec la fusion de \/usr\. Pour l'instant, ReCasaOS refuse/)
		expect(rows[2]).toMatch(/^Docker ne tourne pas, ou ne répond pas : ReCasaOS ne peut donc pas voir vos conteneurs/)
	})

	// [c14]: the values of the core's own words are never a raw token under a sentence that says them
	it('says no raw word of the source of the package work, the state of the battery or the origin of Docker', async () => {
		await run({ state: 'blocked', checks: [check('busy', 'refuse', { source: 'unit', unit: 'apt-daily.service' }), check('power', 'refuse', { battery: 'BAT0', status: 'charging', percent: 40 }), check('docker_origin', 'refuse', { origin: 'snap' })] })

		const rows = wrapper.findAll('.os-check')
		expect(rows[0].find('.os-check-sentence').text()).toBe('Something else is changing the system\'s packages right now (apt-daily.service).')
		expect(rows[0].find('.os-check-details').exists()).toBe(false)
		expect(rows[1].find('.os-check-details').text()).toBe('Battery: BAT0')
		expect(rows[2].find('.os-check-sentence').text()).toMatch(/^Docker comes from snap\./)
		expect(rows[2].find('.os-check-details').exists()).toBe(false)
		for (const word of ['unit', 'charging', 'snap'])
			expect(wrapper.findAll('.os-check-details').map(details => details.text()).join(' ')).not.toContain(word)
	})

	it('says a newer Docker whose packages are on hold as a note, with where it can be updated', async () => {
		await run({ state: 'ready', checks: [check('docker_update_pending', 'info', { package: 'docker-ce', installed: '5:28.0.4-1', candidate: '5:29.8.0-1', held: true })] })

		expect(wrapper.find('.os-readiness-result').text()).toBe('Ready')
		expect(wrapper.find('.os-readiness-group.is-warnings').exists()).toBe(false)
		expect(wrapper.find('.os-readiness-group.is-others summary').text()).toBe('Other checks (passed: 0, notes: 1)')
		expect(wrapper.find('.os-readiness-group.is-others .os-check-sentence').text()).toMatch(/^A newer Docker exists, but Docker's packages are on hold\./)
		expect(wrapper.find('.os-readiness-group.is-others .os-check-details').text()).toBe('Package: docker-ce · Installed: 5:28.0.4-1 · Version on offer: 5:29.8.0-1')
	})

	// the core's answers for the sources of a third party: Docker's alone is a note and the box is ready, another is a warning; each file is said once
	describe('and the package sources of a third party', () => {
		const DOCKER = check('sources_third_party', 'info', { docker_files: ['docker.list'], files: ['docker.list'], hosts: ['download.docker.com'] })
		const BOTH = check('sources_third_party', 'warn', { docker_files: ['docker.list'], files: ['docker.list', 'tailscale.list'], hosts: ['download.docker.com', 'pkgs.tailscale.com'], other_files: ['tailscale.list'] })

		it('says Docker\'s alone as a note, in a sentence of its own, and the box as ready', async () => {
			await run({ state: 'ready', checks: [DOCKER] })

			expect(wrapper.find('.os-readiness-result').text()).toBe('Ready')
			expect(wrapper.find('.os-readiness-group.is-warnings').exists()).toBe(false)
			const note = wrapper.find('.os-readiness-group.is-others .os-check')
			expect(note.find('.os-check-title').text()).toBe('Third-party package sources')
			expect(note.find('.os-check-sentence').text()).toBe('Docker\'s package source is not Debian\'s or Ubuntu\'s: the upgrade puts it aside, then rewrites it for the new release. Nothing to do.')
			expect(note.find('.os-check-details').text()).toBe('Hosts: download.docker.com')
			expect(note.find('.os-check-action').exists()).toBe(false)
		})

		it('says the others as a warning that names their files, then Docker\'s exception, then the mirrors, with the rest as details', async () => {
			await run({ state: 'attention', checks: [BOTH] })

			expect(wrapper.find('.os-readiness-result').text()).toBe('Ready, with things to look at')
			const warning = wrapper.find('.os-readiness-group.is-warnings .os-check')
			expect(warning.find('.os-check-sentence').text()).toBe('Package sources that do not come from Debian or Ubuntu are paused for the upgrade and stay paused afterwards, so the software they provide gets no updates until you switch them back on: tailscale.list. Docker\'s source is the exception: it is rewritten after the upgrade. A mirror of Debian or Ubuntu is listed here too when apt keeps no Release file for it: run apt update on the machine, then check again.')
			expect(warning.find('.os-check-details').text()).toBe('Docker\'s files: docker.list · Hosts: download.docker.com, pkgs.tailscale.com')
			expect(warning.find('.os-check-action').exists()).toBe(false)
		})

		it('says both in French, the file names once', async () => {
			i18n.global.locale = 'fr_fr'
			await run({ state: 'ready', checks: [DOCKER] }, { props: { locale: 'fr_fr' } })
			expect(wrapper.find('.os-check-sentence').text()).toBe('La source de paquets de Docker ne vient ni de Debian ni d\'Ubuntu : la mise à niveau la met de côté, puis la réécrit pour la nouvelle version. Il n\'y a rien à faire.')
			expect(wrapper.find('.os-check-details').text()).toBe('Serveurs : download.docker.com')

			await run({ state: 'attention', checks: [BOTH] }, { props: { locale: 'fr_fr' } })
			expect(wrapper.find('.os-check-sentence').text()).toBe('Les sources de paquets qui ne viennent ni de Debian ni d\'Ubuntu sont mises en pause pendant la mise à niveau et le restent ensuite, si bien que les logiciels qu\'elles fournissent ne reçoivent plus de mises à jour tant que vous ne les réactivez pas : tailscale.list. La source de Docker fait exception : elle est réécrite après la mise à niveau. Un miroir de Debian ou d\'Ubuntu figure aussi ici quand apt ne conserve aucun fichier Release pour ce miroir : lancez apt update sur la machine, puis relancez la vérification.')
			expect(wrapper.find('.os-check-details').text()).toBe('Fichiers de Docker : docker.list · Serveurs : download.docker.com, pkgs.tailscale.com')
			expect(wrapper.text().match(/tailscale\.list/g)).toHaveLength(1)
		})
	})

	it('names the mount point of a disk of fstab that is not there, and says nothing of the package sources for a foreign architecture', async () => {
		await run({ state: 'blocked', checks: [check('fstab_unresolved', 'refuse', { mounts: ['/data'], count: 1 }), check('foreign_arch', 'refuse', { architectures: ['i386'], packages: ['libc6'], count: 1 }, { action: 'review_sources' })] })

		const rows = wrapper.findAll('.os-check')
		expect(rows[0].find('.os-check-sentence').text()).toMatch(/^A disk or partition listed in \/etc\/fstab cannot be found.*\(\/data\)\./)
		expect(rows[0].find('.os-check-details').text()).toBe('Number: 1')
		expect(rows[1].find('.os-check-action').exists()).toBe(false)
	})

	it('says a /boot that is too small, with its sizes, and no action', async () => {
		await run({ state: 'blocked', checks: [check('disk_boot', 'refuse', { path: '/boot', total_mib: 512, needed_mib: 700 })] })

		expect(wrapper.find('.os-check-sentence').text()).toMatch(/too small for the upgrade to Debian 13: its filesystem is only 512 MiB.*at least 700 MiB/)
		expect(wrapper.find('.os-check-action').exists()).toBe(false)
	})
})

// a code the window has not heard of, a severity, a state, an action: none of them breaks the view
describe('what the window does not know', () => {
	const strange = {
		state: 'from-the-future',
		checks: [
			check('from_the_future', 'refuse', { packages: ['libc6'] }, { action: 'format_the_disk' }),
			check('also_new', 'critical'),
			check('held', 'ok'),
			{ code: 7, severity: {}, title: null, detail: [], data: 'x', action: ['restart_machine'] },
			null,
			'junk',
		],
	}

	it('shows the core\'s own title and detail, as text, and what it knows around them', async () => {
		await run(strange)

		expect(wrapper.find('.os-readiness-result').text()).toBe('Not ready: 1 blocker')
		const rows = wrapper.findAll('.os-readiness-group.is-blockers .os-check')
		expect(rows[0].find('.os-check-title').text()).toBe('title of from_the_future')
		expect(rows[0].find('.os-check-sentence').text()).toBe('detail of from_the_future')
		// a field this window has no word for is shown by its own name
		expect(rows[0].find('.os-check-details').text()).toBe('Packages: libc6')
		// an action it has no sentence for says nothing
		expect(rows[0].find('.os-check-action').exists()).toBe(false)
		// a severity it does not know is shown with the warnings, never hidden
		const warnings = wrapper.findAll('.os-readiness-group.is-warnings .os-check')
		expect(warnings.map(row => row.find('.os-check-title').text())).toEqual(['title of also_new', 'A check this window does not know'])
		// the one that passed is in the closed list
		expect(wrapper.find('details').text()).toContain('Held packages')
	})

	it('says it could not read an answer that is not a report, and never Ready', async () => {
		for (const report of [null, 'ready', [], 42, { checks: [] }, { state: 'from-the-future', checks: [] }]) {
			await run(report)

			expect(wrapper.find('.os-readiness-error').text()).toBe('The check could not be completed. Try again.')
			expect(wrapper.find('.os-readiness-report').exists()).toBe(false)
			expect(wrapper.text()).not.toContain('Ready')
		}
	})

	it('says it could not read an answer that has no envelope', async () => {
		close()
		getOsReadiness.mockReturnValueOnce(Promise.resolve(undefined))
		open()
		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()

		expect(wrapper.find('.os-readiness-error').exists()).toBe(true)
	})
})

describe('when the call fails', () => {
	it.each([
		['a core that has no such route', { response: { status: 404 } }, 'This version of ReCasaOS cannot run this check yet. Update ReCasaOS, then try again.'],
		['a call that took too long', { code: 'ECONNABORTED' }, 'The check took too long. Try again.'],
		['a connection that timed out', { code: 'ETIMEDOUT' }, 'The check took too long. Try again.'],
		['a server error', { response: { status: 500 } }, 'The check could not be completed. Try again.'],
		['no network', {}, 'The check could not be completed. Try again.'],
	])('says so for %s, in the announcing place, and lets the owner try again', async (_, error, sentence) => {
		getOsReadiness.mockReturnValueOnce(failure(error))
		open()
		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()

		expect(wrapper.find('[role="status"] .os-readiness-error').text()).toBe(sentence)
		expect(wrapper.find('.os-readiness-report').exists()).toBe(false)
		expect(buttons()).toEqual(['Check again'])

		getOsReadiness.mockReturnValueOnce(answer(REPORT))
		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()
		expect(wrapper.find('.os-readiness-error').exists()).toBe(false)
		expect(wrapper.find('.os-readiness-result').exists()).toBe(true)
	})

	it('has nobody to tell when the window was closed before the answer', async () => {
		const late = deferred()
		getOsReadiness.mockReturnValueOnce(late.promise)
		open()
		const vm = wrapper.vm
		await wrapper.find('.os-readiness-check').trigger('click')
		close()

		late.resolve({ data: { data: REPORT } })
		await flushPromises()
		expect(vm.view).toBe(null)

		const failing = deferred()
		getOsReadiness.mockReturnValueOnce(failing.promise)
		open()
		const other = wrapper.vm
		await wrapper.find('.os-readiness-check').trigger('click')
		close()

		failing.reject(new Error('late'))
		await flushPromises()
		expect(other.error).toBe('')
	})
})

describe('copying the report', () => {
	it('copies the core\'s own text, never one it builds, and says so', async () => {
		copy.mockResolvedValue(undefined)
		await run()
		const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		await wrapper.find('.os-readiness-copy').trigger('click')
		await flushPromises()

		expect(copy).toHaveBeenCalledWith(TEXT)
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Copied to clipboard', type: 'is-success' }))
		expect(wrapper.find('textarea').exists()).toBe(false)
	})

	it('shows the text selected, to copy by hand, when the browser refuses the clipboard', async () => {
		copy.mockRejectedValue(new Error('denied'))
		await run(REPORT, { attachTo: document.body })
		const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		await wrapper.find('.os-readiness-copy').trigger('click')
		await flushPromises()

		const area = wrapper.find('textarea')
		expect(area.element.value).toBe(TEXT)
		expect(area.attributes('readonly')).toBeDefined()
		expect(area.attributes('aria-label')).toBe('The report, as text')
		expect(document.activeElement).toBe(area.element)
		expect(area.element.selectionStart).toBe(0)
		expect(area.element.selectionEnd).toBe(TEXT.length)
		expect(wrapper.find('.os-readiness-text').text()).toContain('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.')
		expect(toast).not.toHaveBeenCalled()
	})

	it('shows the text selected when the clipboard throws at once', async () => {
		copy.mockImplementation(() => {
			throw new Error('no clipboard')
		})
		await run()

		await wrapper.find('.os-readiness-copy').trigger('click')
		await flushPromises()

		expect(wrapper.find('textarea').exists()).toBe(true)
	})

	it('takes the text away again once a copy has worked', async () => {
		copy.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
		await run()
		vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		await wrapper.find('.os-readiness-copy').trigger('click')
		await flushPromises()
		expect(wrapper.find('textarea').exists()).toBe(true)

		await wrapper.find('.os-readiness-copy').trigger('click')
		await flushPromises()
		expect(wrapper.find('textarea').exists()).toBe(false)
	})

	// the box that was open for the last answer is not the next answer's: it does not open by itself for it
	it('closes the box of the text when another check is asked, and does not open it again for the next answer', async () => {
		copy.mockRejectedValue(new Error('denied'))
		await run()
		await wrapper.find('.os-readiness-copy').trigger('click')
		await flushPromises()
		expect(wrapper.find('textarea').exists()).toBe(true)

		getOsReadiness.mockReturnValueOnce(answer(REPORT))
		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()

		expect(wrapper.find('.os-readiness-result').exists()).toBe(true)
		expect(wrapper.find('.os-readiness-text').exists()).toBe(false)
		expect(wrapper.find('textarea').exists()).toBe(false)
	})

	it('has no copy button for an answer that carries no text, and builds none of its own', async () => {
		await run({ ...REPORT, text: undefined })

		expect(wrapper.find('.os-readiness-copy').exists()).toBe(false)
		expect(buttons()).toEqual(['Check again'])
	})

	it('has no other button: nothing here acts on the machine', async () => {
		await run()

		expect(buttons()).toEqual(['Check again', 'Copy the report'])
	})
})

describe('what comes from the machine is text', () => {
	it('shows names, files, titles and the core\'s words as text, never as HTML', async () => {
		const hostile = '<img src=x onerror=alert(1)>'
		await run({
			state: 'blocked',
			hop: { from: { pretty_name: '<b>from</b>' }, to: { pretty_name: '<i>to</i>' } },
			checks: [
				check('held', 'refuse', { names: [hostile], other: '<script>alert(2)</script>' }),
				check('from_the_future', 'warn', {}, { title: '<svg onload=alert(3)>', detail: '<a href="javascript:alert(4)">x</a>' }),
				check('broken_dpkg', 'refuse', { unknown: true }, { detail: '<u>reason</u>' }),
			],
			text: '<b>text</b>',
		})

		for (const tag of ['img', 'b', 'i', 'script', 'svg', 'a', 'u'])
			// the icons are <i class="mdi ...">: the one with no class is the one that came from the machine
			expect(wrapper.find(`.os-readiness-report ${tag}:not([class])`).exists(), tag).toBe(false)
		expect(wrapper.text()).toContain(hostile)
		expect(wrapper.text()).toContain('other: <script>alert(2)</script>')
		expect(wrapper.text()).toContain('<svg onload=alert(3)>')
		expect(wrapper.text()).toContain('<a href="javascript:alert(4)">x</a>')
		expect(wrapper.text()).toContain('<u>reason</u>')
		expect(wrapper.text()).toContain('from <b>from</b> to <i>to</i>.')
		// the markup of a name is text: no link, no attribute came out of it
		expect(wrapper.find('[href]').exists()).toBe(false)
		expect(wrapper.find('[onerror], [onload]').exists()).toBe(false)
		expect(source).not.toMatch(/v-html|v-dompurify-html|innerHTML/)
	})

	// the message format's own syntax in a name is a name, not a placeholder or a link
	it('puts a name that looks like a placeholder in the sentence as it is', async () => {
		await run({ state: 'blocked', checks: [check('held', 'refuse', { names: ['{names} @:Operating system | x'] })] })

		expect(wrapper.find('.os-check-sentence').text()).toContain('on hold ({names} @:Operating system | x).')
	})
})

describe('in French', () => {
	beforeEach(() => {
		i18n.global.locale = 'fr_fr'
	})

	it('says it all in French, with the date in French', async () => {
		await run(REPORT, { props: { locale: 'fr_fr' } })

		expect(wrapper.find('.os-readiness-title').text()).toBe('Cette machine peut-elle être mise à niveau ?')
		expect(wrapper.find('.os-readonly').text()).toBe('Cette vérification ne modifie rien sur la machine.')
		expect(wrapper.find('.os-readiness-result').text()).toBe('Pas prêt : 2 points bloquants')
		expect(wrapper.find('.os-readiness-hop').text()).toBe('Vérifié pour la mise à niveau de Debian GNU/Linux 11 (bullseye) vers Debian 12 (bookworm).')
		const row = wrapper.find('.os-check')
		expect(row.find('.os-check-title').text()).toBe('Paquets retenus')
		expect(row.find('.os-check-sentence').text()).toBe('Des paquets sont retenus (hold) : libc6, libssl3. Une retenue est un choix délibéré : ReCasaOS ne la lève jamais à votre place, et la mise à niveau peut échouer en cours de route si elle ne peut pas les mettre à jour.')
		expect(row.find('.os-check-action').text()).toBe('Levez les retenues dont vous n\'avez plus besoin (sudo apt-mark unhold, suivi du nom du paquet), puis relancez la vérification.')
		expect(wrapper.find('.os-readiness-group.is-warnings h5').text()).toBe('Points à examiner')
		expect(wrapper.find('details summary').text()).toBe('Autres contrôles (réussis : 2, remarques : 1)')
		expect(wrapper.find('.os-readiness-when').text()).toMatch(/^Vérifié le .*oct.*2026/)
		expect(buttons()).toEqual(['Vérifier à nouveau', 'Copier le rapport'])
	})

	it('says the sizes and the date of a sentence in French', async () => {
		await run({ state: 'blocked', checks: [check('disk_boot', 'refuse', { free_mib: 120, needed_mib: 1536 }), check('hold_until', 'warn', { date: '2026-11-28' })] }, { props: { locale: 'fr_fr' } })

		const sentences = wrapper.findAll('.os-check-sentence').map(sentence => sentence.text())
		expect(sentences[0]).toContain('n\'a que 120 Mio de libre, et la mise à niveau en demande au moins 1,5 Gio.')
		expect(sentences[1]).toContain('avant le 28 novembre 2026 :')
	})

	it('says the failures in French', async () => {
		getOsReadiness.mockReturnValueOnce(failure({ response: { status: 404 } }))
		open({ props: { locale: 'fr_fr' } })
		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()

		expect(wrapper.find('.os-readiness-error').text()).toBe('Cette version de ReCasaOS ne sait pas encore faire cette vérification. Mettez ReCasaOS à jour, puis réessayez.')
	})
})

// A language without the sentences reads them in English, and so does its date.
describe('in a language that has no translation yet', () => {
	it('reads English', async () => {
		i18n.global.locale = 'de_de'
		await run(REPORT, { props: { locale: 'en_us' } })

		expect(wrapper.find('.os-readiness-result').text()).toBe('Not ready: 2 blockers')
		expect(wrapper.find('.os-check-title').text()).toBe('Held packages')
	})
})

describe('the language files', () => {
	// what the template and the script ask for directly, which the table of codes does not hold
	const own = [
		'Can this machine be upgraded?',
		'This check changes nothing on the machine.',
		'Check whether this machine can be upgraded',
		'Check again',
		'This takes up to 20 seconds',
		'Checked for the upgrade from {from} to {to}.',
		'Passed',
		'Blockers',
		'Things to look at',
		'Other checks (passed: {ok}, notes: {info})',
		'Checked on {date}',
		'Copy the report',
		'Your browser did not allow copying. The text is selected: copy it with Ctrl+C.',
		'The report, as text',
		'This version of ReCasaOS cannot run this check yet. Update ReCasaOS, then try again.',
		'The check took too long. Try again.',
		'The check could not be completed. Try again.',
		'Copied to clipboard',
	]
	const keys = [...new Set([...own, ...READINESS_KEYS])]

	it('has every key the component asks for in the list above', () => {
		const asked = [...source.matchAll(/\$t\(\s*'((?:[^'\\]|\\.)*)'/g)].map(match => match[1].replace(/\\'/g, '\''))
		const table = source.slice(source.indexOf('const ERRORS'), source.indexOf('function failureOf'))
		const errors = [...table.matchAll(/^\t\w+: '((?:[^'\\]|\\.)*)',\r?$/gm)].map(match => match[1].replace(/\\'/g, '\''))
		const either = [...source.matchAll(/\$t\(\w+ \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'\)/g)].flatMap(match => [match[1], match[2]])
		expect(asked.length + errors.length + either.length).toBeGreaterThanOrEqual(17)
		for (const key of [...asked, ...errors, ...either])
			expect(keys, key).toContain(key)
	})

	it.each(keys)('says "%s" in English and French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		// a word that is the same in both languages has nothing to translate
		if (/\s/.test(key))
			expect(fr[key]).not.toBe(key)
		for (const param of key.match(/\{\w+\}/g) || [])
			expect(fr[key]).toContain(param)
	})

	// French sets a space before : ? ! ; and a percent sign, and the English text has none to copy
	it.each(keys)('puts a space before a French colon, question or exclamation mark: %s', (key) => {
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(fr[key]).not.toMatch(/[^\s%]%/)
	})

	it.each(keys.filter(key => /\{\w+\}/.test(key)))('has the same placeholders in both languages: %s', (key) => {
		expect((fr[key].match(/\{\w+\}/g) || []).sort()).toEqual((key.match(/\{\w+\}/g) || []).sort())
	})
})
