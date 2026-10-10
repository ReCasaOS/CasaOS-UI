// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OsSupportModal from './OsSupportModal.vue'
import { SUPPORT_SENTENCES } from './osSupport'
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
		extended: { name: 'Ubuntu Pro (ESM)', ends: '2032-04-21' },
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

	it('says an ended system has not had security updates since the day, as a danger', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-status').text()).toBe('Debian GNU/Linux 11 (bullseye) has not received security updates from its distribution since August 31, 2026.')
		expect(wrapper.find('article.message').classes()).toContain('is-danger')
	})

	it('says a system that ends soon is supported until about the month, as a warning', () => {
		open(JAMMY)

		expect(wrapper.find('.os-status').text()).toBe('Ubuntu 22.04.5 LTS receives security updates from its distribution until about June 2027.')
		expect(wrapper.find('article.message').classes()).toContain('is-warning')
		expect(wrapper.find('article.message').classes()).not.toContain('is-danger')
	})

	it('says a day-precision date that is still to come as a date', () => {
		open({ ...JAMMY, support: { ...JAMMY.support, precision: 'day', ends: '2027-06-01' } })

		expect(wrapper.find('.os-status').text()).toBe('Ubuntu 22.04.5 LTS receives security updates from its distribution until June 1, 2027.')
	})

	it('says one neutral sentence on the vendor\'s extended programme, with its name and date and no price', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-extended').text()).toBe('Extended security maintenance exists from the vendor: Debian ELTS (Freexian) until June 30, 2031.')
		expect(wrapper.find('.os-extended').text()).not.toMatch(/\b(paid|free|price|cost|buy|subscription)\b|[$€]/i)
	})

	it('names the next release, says ReCasaOS cannot upgrade yet and asks for a snapshot or console access', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-next').text()).toBe('Debian 12 (bookworm) is the next release.')
		expect(wrapper.find('.os-cannot').text()).toBe('ReCasaOS cannot upgrade the operating system for you yet. Before any upgrade, take a snapshot of the machine or make sure you have console access.')
	})

	it('links the release notes of the next Debian, built from its codename', () => {
		open(BULLSEYE)

		const link = wrapper.find('.os-link a')
		expect(link.text()).toBe('Release notes')
		expect(link.attributes('href')).toBe('https://www.debian.org/releases/bookworm/release-notes/')
		expect(link.attributes('target')).toBe('_blank')
		expect(link.attributes('rel')).toBe('noopener noreferrer')
	})

	it('links the upgrade guide of Ubuntu', () => {
		open(JAMMY)

		const link = wrapper.find('.os-link a')
		expect(link.text()).toBe('Upgrade guide')
		expect(link.attributes('href')).toBe('https://documentation.ubuntu.com/server/how-to/software/upgrade-your-release/')
	})

	it('takes no link from the core: only the links it builds are on the page', () => {
		open({ ...BULLSEYE, support: { ...BULLSEYE.support, source: 'https://evil.example/support' }, next: { ...BULLSEYE.next, url: 'https://evil.example/next', source: 'https://evil.example/next' } })

		expect(wrapper.findAll('a').map(a => a.attributes('href'))).toEqual(['https://www.debian.org/releases/bookworm/release-notes/'])
		expect(wrapper.html()).not.toContain('evil.example')
	})

	it('has no link for a codename that is not one', () => {
		open({ ...BULLSEYE, next: { ...BULLSEYE.next, codename: 'bookworm/../../evil' } })

		expect(wrapper.find('a').exists()).toBe(false)
		expect(wrapper.find('.os-next').exists()).toBe(true)
	})

	it('has no next release, no link and no promise when the core names none', () => {
		const { next, ...withoutNext } = BULLSEYE
		open(withoutNext)

		expect(wrapper.find('.os-next').exists()).toBe(false)
		expect(wrapper.find('.os-cannot').exists()).toBe(false)
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

		expect(wrapper.find('.os-status').text()).toBe('Debian GNU/Linux 11 (bullseye) no longer receives security updates from its distribution.')
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

		expect(wrapper.find('.os-status').text()).toBe('{date} @:Operating system | x has not received security updates from its distribution since August 31, 2026.')
	})
})

describe('the operating system window in French', () => {
	beforeEach(() => {
		i18n.global.locale = 'fr_fr'
	})

	it('says it all in French, with the dates in French', () => {
		open(BULLSEYE)

		expect(wrapper.find('.os-title').text()).toBe('Système d\'exploitation')
		expect(wrapper.find('.os-status').text()).toBe('Debian GNU/Linux 11 (bullseye) ne reçoit plus de mises à jour de sécurité de sa distribution depuis le 31 août 2026.')
		expect(wrapper.find('.os-extended').text()).toBe('Une maintenance de sécurité étendue existe auprès de l\'éditeur : Debian ELTS (Freexian) jusqu\'au 30 juin 2031.')
		expect(wrapper.find('.os-next').text()).toBe('Debian 12 (bookworm) est la prochaine version.')
		expect(wrapper.find('.os-cannot').text()).toBe('ReCasaOS ne peut pas encore mettre à niveau le système d\'exploitation à votre place. Avant toute mise à niveau, faites un instantané (snapshot) de la machine ou assurez-vous d\'avoir un accès console.')
		expect(wrapper.find('.os-link a').text()).toBe('Notes de version')
		expect(wrapper.findAll('button').map(b => b.text())).toContain('Fermer')
	})

	it('says a month as "environ", and the upgrade guide in French', () => {
		open(JAMMY)

		expect(wrapper.find('.os-status').text()).toBe('Ubuntu 22.04.5 LTS reçoit les mises à jour de sécurité de sa distribution jusqu\'à environ juin 2027.')
		expect(wrapper.find('.os-link a').text()).toBe('Guide de mise à niveau')
	})
})

// A language without the sentences reads them in English, and so does its date.
describe('the operating system window in a language that has no translation yet', () => {
	it('reads English, with an English date', () => {
		i18n.global.locale = 'de_de'
		open(BULLSEYE)

		expect(wrapper.find('.os-status').text()).toBe('Debian GNU/Linux 11 (bullseye) has not received security updates from its distribution since August 31, 2026.')
	})
})

describe('the language files', () => {
	const keys = [
		'Operating system',
		'System out of support',
		'System support ends soon',
		...SUPPORT_SENTENCES,
		'Extended security maintenance exists from the vendor: {name} until {date}.',
		'{name} is the next release.',
		'ReCasaOS cannot upgrade the operating system for you yet. Before any upgrade, take a snapshot of the machine or make sure you have console access.',
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
