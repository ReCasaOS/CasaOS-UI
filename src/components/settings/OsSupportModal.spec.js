// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OsSupportModal from './OsSupportModal.vue'
import OsUpgradePlan from './OsUpgradePlan.vue'
import OsUpgradeReadiness from './OsUpgradeReadiness.vue'
import { EXTENDED_SENTENCES, SUPPORT_SENTENCES } from './osSupport'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent: the real English and French tables, so
// that what is read below is the sentence the reader gets, in the plugin's own setup
// (fallback to English, the language's name in lower case).
vi.mock('@/assets/lang', async () => ({
	default: {
		en_us: (await import('@/assets/lang/en_US.json')).default,
		fr_fr: (await import('@/assets/lang/fr_FR.json')).default,
	},
}))

// From the project root: import.meta.url is not a file URL under happy-dom.
const source = readFileSync('src/components/settings/OsSupportModal.vue', 'utf8')

// GET /v1/sys/os for the owner's machine, as the core answers it
const BULLSEYE = {
	id: 'debian',
	version_id: '11',
	codename: 'bullseye',
	pretty_name: 'Debian GNU/Linux 11 (bullseye)',
	arch: 'amd64',
	known: true,
	support: {
		state: 'security_ended',
		ends: '2026-08-31',
		precision: 'day',
		extended: { name: 'Debian ELTS (Freexian)', ends: '2031-06-30' },
		source: 'https://www.debian.org/News/2026/20260831',
	},
	next: { id: 'debian', version_id: '12', codename: 'bookworm', pretty_name: 'Debian 12 (bookworm)', state: 'report' },
}

// Ubuntu 22.04 at its standard end, which Canonical gives to the month, and an ESM end it gives to the month too
const JAMMY = {
	id: 'ubuntu',
	version_id: '22.04',
	codename: 'jammy',
	pretty_name: 'Ubuntu 22.04.5 LTS',
	arch: 'amd64',
	known: true,
	support: {
		state: 'ending_soon',
		ends: '2027-06-01',
		precision: 'month',
		extended: { name: 'Ubuntu Pro (ESM)', ends: '2032-04-21', precision: 'month' },
		source: 'https://ubuntu.com/about/release-cycle',
	},
	next: { id: 'ubuntu', version_id: '24.04', codename: 'noble', pretty_name: 'Ubuntu 24.04 LTS', state: 'report' },
}

let wrapper

function open(os, options = {}) {
	wrapper = mount(OsSupportModal, {
		props: { os },
		global: { plugins: [Buefy, i18n] },
		...options,
	})
	return wrapper
}

beforeEach(() => {
	i18n.global.locale = 'en_us'
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
})

describe('the operating system window', () => {
	it('names the system and its architecture', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-title').text()).toBe('Operating system')
		expect(wrapper.find('.os-name').text()).toBe('Debian GNU/Linux 11 (bullseye)')
		expect(wrapper.find('.os-arch').text()).toBe('amd64')
	})

	// the vendor's free (Debian) or standard (Ubuntu) security support is what the window says ended:
	// Ubuntu Pro and Debian ELTS exist, so it never says that nothing arrives
	it('says the free security updates of an ended Debian ended on the day, as a danger', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-status').text()).toBe('Free security updates for Debian GNU/Linux 11 (bullseye) ended on August 31, 2026.')
		expect(wrapper.find('article.message').classes()).toContain('is-danger')
	})

	it('says the standard security support of an ended Ubuntu ended, with the month as around', () => {
		open({ ...JAMMY, support: { ...JAMMY.support, state: 'security_ended' } })

		expect(wrapper.find('.os-status').text()).toBe('Standard security support for Ubuntu 22.04.5 LTS ended around June 2027.')
		expect(wrapper.find('article.message').classes()).toContain('is-danger')
	})

	it('says the standard security support of an Ubuntu that ends soon ends around the month, as a warning', () => {
		open(JAMMY)

		expect(wrapper.find('.os-status').text()).toBe('Standard security support for Ubuntu 22.04.5 LTS ends around June 2027.')
		expect(wrapper.find('article.message').classes()).toContain('is-warning')
		expect(wrapper.find('article.message').classes()).not.toContain('is-danger')
	})

	it('says a day-precision date that is still to come as a date', () => {
		open({ ...JAMMY, support: { ...JAMMY.support, precision: 'day', ends: '2027-06-01' } })

		expect(wrapper.find('.os-status').text()).toBe('Standard security support for Ubuntu 22.04.5 LTS ends on June 1, 2027.')
	})

	it('says one neutral sentence on the extended programme, offered separately, with its name and date and no price', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-extended').text()).toBe('Extended security maintenance is offered separately: Debian ELTS (Freexian), until June 30, 2031.')
		expect(wrapper.find('.os-extended').text()).not.toMatch(/\b(paid|free|price|cost|buy|subscription|vendor|official)\b|[$€]/i)
	})

	it('writes the extended programme\'s date to the month when the core says so', () => {
		open(JAMMY)

		expect(wrapper.find('.os-extended').text()).toBe('Extended security maintenance is offered separately: Ubuntu Pro (ESM), until around April 2032.')
	})

	it('names the next release and says ReCasaOS cannot upgrade yet', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-next').text()).toBe('Debian 12 (bookworm) is the next release.')
		expect(wrapper.find('.os-cannot').text()).toBe('ReCasaOS cannot upgrade the operating system for you yet.')
	})

	// no automatic way back: the snapshot is what goes back, the console is for a machine that does not start
	it('says there is no automatic way back, that a snapshot is what goes back and the console is for a machine that does not start', () => {
		open(BULLSEYE)

		const text = wrapper.find('.os-snapshot').text()
		expect(text).toBe('There is no automatic way back from an upgrade: a snapshot of the machine is what lets you go back, and console access is for when the machine does not start. Take a snapshot before any upgrade.')
		expect(text).not.toMatch(/snapshot of the machine or/i)
	})

	// the exact addresses are pinned in osSupport.spec.js, with the date they were fetched
	it('links the upgrade chapter of the Debian 12 release notes for a Debian 11, from the next release\'s version', () => {
		open(BULLSEYE)

		const link = wrapper.find('.os-link a')
		expect(link.text()).toBe('Release notes')
		expect(link.attributes('href')).toBe('https://www.debian.org/releases/bookworm/amd64/release-notes/ch-upgrading.en.html')
		expect(link.attributes('target')).toBe('_blank')
		expect(link.attributes('rel')).toBe('noopener noreferrer')
	})

	it('links the upgrade guide of Ubuntu', () => {
		open(JAMMY)

		const link = wrapper.find('.os-link a')
		expect(link.text()).toBe('Upgrade guide')
		expect(link.attributes('href')).toBe('https://ubuntu.com/server/docs/how-to/software/upgrade-your-release/')
	})

	it('takes no link from the core: only the links it builds are on the page', () => {
		open({ ...BULLSEYE, support: { ...BULLSEYE.support, source: 'https://evil.example/support' }, next: { ...BULLSEYE.next, url: 'https://evil.example/next', source: 'https://evil.example/next' } })

		expect(wrapper.findAll('a').map(a => a.attributes('href'))).toEqual(['https://www.debian.org/releases/bookworm/amd64/release-notes/ch-upgrading.en.html'])
		expect(wrapper.html()).not.toContain('evil.example')
	})

	it('has no link for a next release that is not in the table', () => {
		open({ ...BULLSEYE, next: { ...BULLSEYE.next, version_id: '99' } })

		expect(wrapper.find('a').exists()).toBe(false)
		expect(wrapper.find('.os-next').exists()).toBe(true)
	})

	it('has no next release, no link and no promise when the core names none', () => {
		const { next, ...withoutNext } = BULLSEYE
		open(withoutNext)

		expect(wrapper.find('.os-next').exists()).toBe(false)
		expect(wrapper.find('.os-cannot').exists()).toBe(false)
		expect(wrapper.find('.os-snapshot').exists()).toBe(false)
		expect(wrapper.find('a').exists()).toBe(false)
		expect(wrapper.find('.os-status').exists()).toBe(true)
	})

	it('has no extended line without the programme\'s name or a real date', () => {
		open({ ...BULLSEYE, support: { ...BULLSEYE.support, extended: { name: 'Debian ELTS (Freexian)', ends: 'someday' } } })
		expect(wrapper.find('.os-extended').exists()).toBe(false)
		wrapper.unmount()

		open({ ...BULLSEYE, support: { ...BULLSEYE.support, extended: { name: '', ends: '2031-06-30' } } })
		expect(wrapper.find('.os-extended').exists()).toBe(false)
		wrapper.unmount()

		const { extended, ...support } = BULLSEYE.support
		open({ ...BULLSEYE, support })
		expect(wrapper.find('.os-extended').exists()).toBe(false)
	})

	it('still says what it knows when the date is missing, and when the architecture is', () => {
		const { arch, ...withoutArch } = BULLSEYE
		open({ ...withoutArch, support: { state: 'security_ended' } })

		expect(wrapper.find('.os-status').text()).toBe('Free security updates for Debian GNU/Linux 11 (bullseye) have ended.')
		expect(wrapper.find('.os-arch').exists()).toBe(false)
	})

	it('names a release by its id and version when it has no pretty name', () => {
		open({ ...BULLSEYE, pretty_name: undefined, next: { ...BULLSEYE.next, pretty_name: '' } })

		expect(wrapper.find('.os-name').text()).toBe('debian 11')
		expect(wrapper.find('.os-next').text()).toBe('debian 12 is the next release.')
	})

	it('says nothing of a support state that has no sentence', () => {
		open({ ...BULLSEYE, support: { state: 'supported', ends: '2028-06-30', precision: 'day' } })

		expect(wrapper.find('.os-status').exists()).toBe(false)
	})

	it('closes from its button', async () => {
		open(BULLSEYE)

		await wrapper.findAll('button').find(b => b.text() === 'Close').trigger('click')

		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	// Buefy's trap keeps the focus in the window but does not put it there, and the
	// window is opened with autoFocus off: the heading takes it, to be read first.
	it('puts the focus on its heading when it opens', async () => {
		open(BULLSEYE, { attachTo: document.body })
		await wrapper.vm.$nextTick()

		expect(document.activeElement).toBe(wrapper.find('.os-title').element)
		expect(wrapper.find('.os-title').attributes('tabindex')).toBe('-1')
	})

	it('shows every value as text, never as HTML', () => {
		const hostile = '<img src=x onerror=alert(1)>'
		open({
			...BULLSEYE,
			pretty_name: hostile,
			arch: '<b>amd64</b>',
			support: { ...BULLSEYE.support, extended: { name: '<script>alert(2)</script>', ends: '2031-06-30' }, source: '<a href="javascript:alert(3)">x</a>' },
			next: { ...BULLSEYE.next, pretty_name: '<svg onload=alert(4)>' },
		})

		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.find('b').exists()).toBe(false)
		expect(wrapper.find('script').exists()).toBe(false)
		expect(wrapper.find('svg').exists()).toBe(false)
		expect(wrapper.text()).toContain(hostile)
		expect(wrapper.text()).toContain('<b>amd64</b>')
		expect(wrapper.text()).toContain('<script>alert(2)</script>')
		expect(wrapper.text()).toContain('<svg onload=alert(4)> is the next release.')
		expect(wrapper.html()).not.toContain('javascript:')
		expect(source).not.toMatch(/v-html|v-dompurify-html|innerHTML/)
	})

	// the message format's own syntax in a name is a name, not a placeholder or a link
	it('puts a name that looks like a placeholder in the sentence as it is', () => {
		open({ ...BULLSEYE, pretty_name: '{date} @:Operating system | x', support: { ...BULLSEYE.support, extended: undefined } })

		expect(wrapper.find('.os-status').text()).toBe('Free security updates for {date} @:Operating system | x ended on August 31, 2026.')
	})
})

// The report of whether the machine could be upgraded: read-only, and asked for by a button
describe('the readiness section of the operating system window', () => {
	const section = () => wrapper.findComponent(OsUpgradeReadiness)

	it('is in the window of a known Debian or Ubuntu that has a next release, and asks nothing on its own', () => {
		const getOsReadiness = vi.fn()
		open(BULLSEYE, { global: { plugins: [Buefy, i18n], mocks: { $api: { sys: { getOsReadiness } } } } })

		expect(section().exists()).toBe(true)
		expect(section().props('locale')).toBe('en_us')
		expect(wrapper.find('.os-readiness-title').text()).toBe('Can this machine be upgraded?')
		expect(wrapper.find('.os-readonly').text()).toBe('This check changes nothing on the machine.')
		expect(getOsReadiness).not.toHaveBeenCalled()
		wrapper.unmount()

		open(JAMMY)
		expect(section().exists()).toBe(true)
	})

	it('asks in the language of the window', () => {
		i18n.global.locale = 'fr_fr'
		open(BULLSEYE)
		expect(section().props('locale')).toBe('fr_fr')

		i18n.global.locale = 'de_de'
		wrapper.unmount()
		open(BULLSEYE)
		expect(section().props('locale')).toBe('en_us')
	})

	it.each([
		['no next release', { next: undefined }],
		['a next release with no name', { next: {} }],
		['a system the core does not know', { known: false }],
		['a variant', { variant: 'raspberrypi' }],
		['a variant that says debian', { known: true, variant: 'armbian' }],
		['a distribution it has no sentences for', { id: 'linuxmint' }],
	])('is not in the window for %s', (_, change) => {
		open({ ...BULLSEYE, ...change })

		expect(section().exists()).toBe(false)
		expect(wrapper.find('.os-readiness').exists()).toBe(false)
		// the rest of the window is as it was
		expect(wrapper.find('.os-name').exists()).toBe(true)
	})

	it('has no button that acts on the machine: the check, and Close', () => {
		open(BULLSEYE)

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Check whether this machine can be upgraded', 'Close'])
	})
})

// What apt would do, and the text to do it by hand: asked of the core when the window opens, and shown only for a machine that can be planned
describe('the plan section of the operating system window', () => {
	const section = () => wrapper.findComponent(OsUpgradePlan)
	const answer = data => Promise.resolve({ data: { success: 200, message: 'ok', data } })
	const report = state => ({ checked_at: '2026-10-12T09:30:00Z', state, hop: { from: BULLSEYE, to: BULLSEYE.next }, counts: {}, checks: [], text: 'report' })

	// the window opened on a machine that the core says can be planned, with the answers of the calls it makes
	async function openPlannable(os = BULLSEYE, readiness = report('ready')) {
		const api = {
			getOsPlan: vi.fn().mockReturnValue(answer({ plannable: true, state: 'idle' })),
			getOsReadiness: vi.fn().mockReturnValue(answer(readiness)),
			startOsPlan: vi.fn(),
			getOsRunbook: vi.fn(),
		}
		open(os, { global: { plugins: [Buefy, i18n], mocks: { $api: { sys: api } } } })
		await flushPromises()
		return api
	}

	it('is in the window under the readiness section, asks the core once, and starts nothing on its own', async () => {
		const api = await openPlannable()

		expect(section().exists()).toBe(true)
		expect(wrapper.find('.os-plan-title').text()).toBe('What would the upgrade do?')
		expect(api.getOsPlan).toHaveBeenCalledTimes(1)
		expect(api.startOsPlan).not.toHaveBeenCalled()
		expect(api.getOsRunbook).not.toHaveBeenCalled()
		expect(api.getOsReadiness).not.toHaveBeenCalled()
		const html = wrapper.html()
		expect(html.indexOf('os-readiness-title')).toBeGreaterThan(-1)
		expect(html.indexOf('os-readiness-title')).toBeLessThan(html.indexOf('os-plan-title'))
		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Check whether this machine can be upgraded', 'See what the upgrade would do', 'Close'])
	})

	it('is in the window of an Ubuntu too, and asks in the language of the window', async () => {
		i18n.global.locale = 'fr_fr'
		await openPlannable(JAMMY)

		expect(section().props('locale')).toBe('fr_fr')
		expect(wrapper.find('.os-plan-title').text()).toBe('Que ferait la mise à niveau ?')
	})

	it('is not in the window when the core says the machine cannot be planned', async () => {
		const api = {
			getOsPlan: vi.fn().mockReturnValue(answer({ plannable: false, reason: 'identity_unsupported', state: 'idle' })),
			getOsReadiness: vi.fn(),
		}
		open(BULLSEYE, { global: { plugins: [Buefy, i18n], mocks: { $api: { sys: api } } } })
		await flushPromises()

		expect(section().exists()).toBe(true)
		expect(wrapper.find('.os-plan').exists()).toBe(false)
		// the readiness section is none the worse
		expect(wrapper.find('.os-readiness-title').exists()).toBe(true)
	})

	it.each([
		['no next release', { next: undefined }],
		['a next release with no name', { next: {} }],
		['a system the core does not know', { known: false }],
		['a variant', { variant: 'raspberrypi' }],
		['a distribution it has no sentences for', { id: 'linuxmint' }],
	])('is not in the window for %s, and asks the core nothing', async (_, change) => {
		const getOsPlan = vi.fn()
		open({ ...BULLSEYE, ...change }, { global: { plugins: [Buefy, i18n], mocks: { $api: { sys: { getOsPlan } } } } })
		await flushPromises()

		expect(section().exists()).toBe(false)
		expect(getOsPlan).not.toHaveBeenCalled()
	})

	// the report says the system is not one to upgrade from: there is no plan to offer; asked again, it comes back
	it.each([
		['unsupported', false],
		['latest', false],
		['ready', true],
		['attention', true],
		['blocked', true],
	])('is shown after a readiness report that says "%s": %s', async (state, shown) => {
		await openPlannable(BULLSEYE, report(state))
		expect(wrapper.find('.os-plan').exists()).toBe(true)

		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()

		expect(wrapper.find('.os-readiness-report').exists()).toBe(true)
		expect(wrapper.find('.os-plan').exists()).toBe(shown)
	})

	it('comes back when the report is asked again and has not answered yet', async () => {
		const api = await openPlannable(BULLSEYE, report('latest'))
		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()
		expect(wrapper.find('.os-plan').exists()).toBe(false)

		api.getOsReadiness.mockReturnValueOnce(new Promise(() => {}))
		await wrapper.find('.os-readiness-check').trigger('click')
		await flushPromises()

		expect(wrapper.find('.os-plan').exists()).toBe(true)
	})
})

describe('the operating system window in French', () => {
	beforeEach(() => {
		i18n.global.locale = 'fr_fr'
	})

	it('says it all in French, with the dates in French', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-title').text()).toBe('Système d\'exploitation')
		expect(wrapper.find('.os-status').text()).toBe('Les mises à jour de sécurité gratuites pour Debian GNU/Linux 11 (bullseye) ont pris fin le 31 août 2026.')
		expect(wrapper.find('.os-extended').text()).toBe('Une maintenance de sécurité étendue est proposée séparément : Debian ELTS (Freexian), jusqu\'au 30 juin 2031.')
		expect(wrapper.find('.os-next').text()).toBe('Debian 12 (bookworm) est la prochaine version.')
		expect(wrapper.find('.os-cannot').text()).toBe('ReCasaOS ne peut pas encore mettre à niveau le système d\'exploitation à votre place.')
		expect(wrapper.find('.os-snapshot').text()).toBe('Une mise à niveau n\'a pas de retour arrière automatique : un instantané (snapshot) de la machine est ce qui permet de revenir en arrière, et l\'accès console sert quand la machine ne démarre plus. Faites un instantané avant toute mise à niveau.')
		expect(wrapper.find('.os-link a').text()).toBe('Notes de version')
		expect(wrapper.findAll('button').map(b => b.text())).toContain('Fermer')
	})

	it('says a month as "vers", the extended programme\'s as "environ", and the upgrade guide in French', () => {
		open(JAMMY)

		expect(wrapper.find('.os-status').text()).toBe('Le support de sécurité standard pour Ubuntu 22.04.5 LTS prend fin vers juin 2027.')
		expect(wrapper.find('.os-extended').text()).toBe('Une maintenance de sécurité étendue est proposée séparément : Ubuntu Pro (ESM), jusqu\'à environ avril 2032.')
		expect(wrapper.find('.os-link a').text()).toBe('Guide de mise à niveau')
	})
})

// A language without the sentences reads them in English, and so does its date.
describe('the operating system window in a language that has no translation yet', () => {
	it('reads English, with an English date', () => {
		i18n.global.locale = 'de_de'
		open(BULLSEYE)

		expect(wrapper.find('.os-status').text()).toBe('Free security updates for Debian GNU/Linux 11 (bullseye) ended on August 31, 2026.')
	})
})

describe('the language files', () => {
	const keys = [
		'Operating system',
		'System support ended',
		'System support ends soon',
		...SUPPORT_SENTENCES,
		...EXTENDED_SENTENCES,
		'{name} is the next release.',
		'ReCasaOS cannot upgrade the operating system for you yet.',
		'There is no automatic way back from an upgrade: a snapshot of the machine is what lets you go back, and console access is for when the machine does not start. Take a snapshot before any upgrade.',
		'Release notes',
		'Upgrade guide',
		'Close',
	]

	it.each(keys)('says "%s" in English and French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		for (const param of key.match(/\{\w+\}/g) || [])
			expect(fr[key]).toContain(param)
	})

	// French sets a space before : ? ! ; and the English text has none to copy
	it.each(Object.entries(fr).filter(([key]) => keys.includes(key)))('puts a space before a French colon, question or exclamation mark: %s', (key, text) => {
		expect(text).not.toMatch(/\S[:?!;]/)
	})
})
