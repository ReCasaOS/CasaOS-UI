import { describe, expect, it } from 'vitest'
import { EXTENDED_SENTENCES, SUPPORT_SENTENCES, extendedSentence, formatDate, osBadge, releaseLink, releaseName, supportSentence } from './osSupport'

// GET /v1/sys/os, as the core answers it
function view(support, fields = {}) {
	return {
		id: 'debian',
		version_id: '11',
		codename: 'bullseye',
		pretty_name: 'Debian GNU/Linux 11 (bullseye)',
		arch: 'amd64',
		known: true,
		support,
		...fields,
	}
}

describe('the badge', () => {
	it.each([
		['ending_soon', { tone: 'warning', label: 'System support ends soon' }],
		['security_ended', { tone: 'danger', label: 'System support ended' }],
	])('shows for %s', (state, expected) => {
		expect(osBadge(view({ state, ends: '2026-08-31', precision: 'day' }))).toEqual(expect.objectContaining(expected))
	})

	it.each(['debian', 'ubuntu'])('shows for %s', (id) => {
		expect(osBadge(view({ state: 'security_ended' }, { id }))).not.toBe(null)
	})

	// the keys of the badge's table are states; a state named like an Object method is not one
	it.each(['supported', 'unknown', '', undefined, null, 'constructor', '__proto__', 'toString', 'SECURITY_ENDED'])('shows nothing for the state %s', (state) => {
		expect(osBadge(view({ state }))).toBe(null)
	})

	it('shows nothing for a system the core does not know, whatever the state says', () => {
		expect(osBadge(view({ state: 'security_ended' }, { known: false }))).toBe(null)
	})

	// Raspberry Pi OS and its kind say debian: the core says known:false and a variant,
	// and the badge holds without the first
	it.each(['raspberrypi', 'armbian', 'dietpi', 'proxmox', 'openmediavault', 'something-new'])('shows nothing for the variant %s', (variant) => {
		expect(osBadge(view({ state: 'unknown' }, { known: false, variant }))).toBe(null)
		expect(osBadge(view({ state: 'security_ended' }, { variant }))).toBe(null)
		expect(osBadge(view({ state: 'ending_soon' }, { known: true, variant }))).toBe(null)
	})

	it('shows nothing for a distribution that has no sentence, and for ids that are not texts', () => {
		expect(osBadge(view({ state: 'security_ended' }, { id: 'linuxmint' }))).toBe(null)
		expect(osBadge(view({ state: 'security_ended' }, { id: 'constructor' }))).toBe(null)
		expect(osBadge(view({ state: 'security_ended' }, { id: undefined }))).toBe(null)
	})

	it.each([null, undefined, {}, [], 'security_ended', 42, { known: true }, { support: null }])('shows nothing for an answer that is not a view: %j', (answer) => {
		expect(osBadge(answer)).toBe(null)
	})
})

describe('the date', () => {
	it.each([
		['2026-08-31', 'day', 'en_us', 'August 31, 2026'],
		['2026-08-31', 'day', 'fr_fr', '31 août 2026'],
		['2027-06-01', 'month', 'en_us', 'June 2027'],
		['2027-06-01', 'month', 'fr_fr', 'juin 2027'],
		// anything but month is a day
		['2026-08-31', undefined, 'en_us', 'August 31, 2026'],
		['2026-08-31', 'week', 'en_us', 'August 31, 2026'],
		// the first and the last day of a year are the ones a time zone moves
		['2027-01-01', 'day', 'en_us', 'January 1, 2027'],
		['2026-12-31', 'day', 'en_us', 'December 31, 2026'],
		['2028-02-29', 'day', 'en_us', 'February 29, 2028'],
	])('writes %s (%s) in %s as "%s"', (ends, precision, locale, expected) => {
		expect(formatDate(ends, precision, locale)).toBe(expected)
	})

	it.each([undefined, null, '', 'soon', '2026-8-31', '2026-08-31T00:00:00Z', ' 2026-08-31', '31 August 2026', '2026-02-31', '2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', 20260831, {}])('writes nothing for %j', (ends) => {
		expect(formatDate(ends, 'day', 'en_us')).toBe('')
	})

	it('falls back to English for a language Intl does not know', () => {
		expect(formatDate('2026-08-31', 'day', 'not a locale')).toBe('August 31, 2026')
		expect(formatDate('2026-08-31', 'day', '')).toBe('August 31, 2026')
	})
})

describe('the sentence', () => {
	// state, ends, precision, date written, then what each distribution says
	it.each([
		['security_ended', '2026-08-31', 'day', 'August 31, 2026', 'Free security updates for {name} ended on {date}.', 'Standard security support for {name} ended on {date}.'],
		['security_ended', '2027-06-01', 'month', 'June 2027', 'Free security updates for {name} ended around {date}.', 'Standard security support for {name} ended around {date}.'],
		['ending_soon', '2027-06-01', 'day', 'June 1, 2027', 'Free security updates for {name} end on {date}.', 'Standard security support for {name} ends on {date}.'],
		['ending_soon', '2027-06-01', 'month', 'June 2027', 'Free security updates for {name} end around {date}.', 'Standard security support for {name} ends around {date}.'],
	])('for %s ending %s at precision %s', (state, ends, precision, date, debian, ubuntu) => {
		const support = { state, ends, precision }
		expect(supportSentence(support, 'en_us', 'debian')).toEqual({ key: debian, date })
		expect(supportSentence(support, 'en_us', 'ubuntu')).toEqual({ key: ubuntu, date })
	})

	it.each([
		['security_ended', 'Free security updates for {name} have ended.', 'Standard security support for {name} has ended.'],
		['ending_soon', 'Free security updates for {name} will end soon.', 'Standard security support for {name} will end soon.'],
	])('for %s without a date says it without one', (state, debian, ubuntu) => {
		for (const support of [{ state }, { state, ends: '2026-02-31', precision: 'day' }]) {
			expect(supportSentence(support, 'en_us', 'debian')).toEqual({ key: debian })
			expect(supportSentence(support, 'en_us', 'ubuntu')).toEqual({ key: ubuntu })
		}
	})

	it.each(['supported', 'unknown', '', undefined, 'constructor'])('says nothing for the state %s', (state) => {
		expect(supportSentence({ state, ends: '2026-08-31', precision: 'day' }, 'en_us', 'debian')).toBe(null)
	})

	it.each(['linuxmint', 'raspbian', '', undefined, null, 'constructor', '__proto__'])('says nothing for the distribution %s', (distro) => {
		expect(supportSentence({ state: 'security_ended', ends: '2026-08-31', precision: 'day' }, 'en_us', distro)).toBe(null)
	})

	it('says nothing without a support view', () => {
		expect(supportSentence(undefined, 'en_us', 'debian')).toBe(null)
		expect(supportSentence(null, 'en_us', 'debian')).toBe(null)
	})

	it('lists the twelve sentences, for the language files\' test', () => {
		expect(new Set(SUPPORT_SENTENCES).size).toBe(12)
		expect(SUPPORT_SENTENCES.every(key => key.includes('{name}'))).toBe(true)
	})

	// the vendor's free or standard security support is what ends: Ubuntu Pro and Debian
	// ELTS exist, so no sentence says that nothing arrives or that the system is dead
	it('claims only the free or standard security support, never that no update arrives', () => {
		for (const key of SUPPORT_SENTENCES) {
			expect(key).toMatch(/^(Free security updates|Standard security support) for \{name\} /)
			expect(key).not.toMatch(/out of support|no longer|no updates|unsupported|its distribution/i)
		}
	})
})

describe('the extended programme', () => {
	it.each([
		[{ name: 'Debian ELTS (Freexian)', ends: '2031-06-30', precision: 'day' }, 'Extended security maintenance is offered separately: {name}, until {date}.', 'June 30, 2031'],
		// an older core sends no precision: a day
		[{ name: 'Debian ELTS (Freexian)', ends: '2031-06-30' }, 'Extended security maintenance is offered separately: {name}, until {date}.', 'June 30, 2031'],
		[{ name: 'Ubuntu Pro (ESM)', ends: '2030-05-31', precision: 'month' }, 'Extended security maintenance is offered separately: {name}, until around {date}.', 'May 2030'],
		// anything but month is a day
		[{ name: 'Ubuntu Pro (ESM)', ends: '2032-04-21', precision: 'week' }, 'Extended security maintenance is offered separately: {name}, until {date}.', 'April 21, 2032'],
	])('says it is offered separately, with its name and its date, for %j', (extended, key, date) => {
		expect(extendedSentence(extended, 'en_us')).toEqual({ key, date })
	})

	it('writes the date in the language asked', () => {
		expect(extendedSentence({ name: 'x', ends: '2030-05-31', precision: 'month' }, 'fr_fr').date).toBe('mai 2030')
	})

	it.each([
		undefined,
		null,
		{},
		{ name: '', ends: '2031-06-30' },
		{ ends: '2031-06-30' },
		{ name: 'Debian ELTS (Freexian)' },
		{ name: 'Debian ELTS (Freexian)', ends: 'someday' },
		{ name: 'Debian ELTS (Freexian)', ends: '2031-02-31', precision: 'month' },
	])('says nothing for %j', (extended) => {
		expect(extendedSentence(extended, 'en_us')).toBe(null)
	})

	// no price, no "free", no word on whose programme it is: the name says it
	it('says nothing of its price, nor of whose it is', () => {
		expect(EXTENDED_SENTENCES).toHaveLength(2)
		for (const key of EXTENDED_SENTENCES) {
			expect(key).not.toMatch(/\b(paid|free|price|cost|buy|subscription|vendor|official)\b|[$€]/i)
			expect(key).toContain('{name}')
			expect(key).toContain('{date}')
		}
	})
})

describe('the name of a release', () => {
	it('is its pretty name', () => {
		expect(releaseName(view({ state: 'security_ended' }))).toBe('Debian GNU/Linux 11 (bullseye)')
	})

	it('is its id and version without one', () => {
		expect(releaseName({ id: 'ubuntu', version_id: '22.04' })).toBe('ubuntu 22.04')
		expect(releaseName({ id: 'ubuntu', pretty_name: '' })).toBe('ubuntu')
	})

	it.each([null, undefined, {}])('is empty for %j', (release) => {
		expect(releaseName(release)).toBe('')
	})
})

// The addresses below are the ones fetched on 2026-10-11, each answering 200 (the Ubuntu
// guide's old address, documentation.ubuntu.com, answers 301 to the one pinned here, and
// Debian's flat /releases/bookworm/release-notes/ answers 404). They are pinned as
// strings on purpose: when a vendor moves a page, this is where it is noticed.
describe('the official page', () => {
	it.each([
		['debian', '12', 'Release notes', 'https://www.debian.org/releases/bookworm/amd64/release-notes/ch-upgrading.en.html'],
		['debian', '13', 'Release notes', 'https://www.debian.org/releases/trixie/release-notes/upgrading.en.html'],
		['ubuntu', '24.04', 'Upgrade guide', 'https://ubuntu.com/server/docs/how-to/software/upgrade-your-release/'],
		['ubuntu', '26.04', 'Upgrade guide', 'https://ubuntu.com/server/docs/how-to/software/upgrade-your-release/'],
	])('for the upgrade to %s %s is %s: %s', (id, version_id, label, href) => {
		expect(releaseLink({ id, version_id })).toEqual({ label, href })
	})

	// the key is the next release's id and version: nothing else the core sends is read
	it('takes its address from the id and the version only', () => {
		const link = releaseLink({ id: 'debian', version_id: '12', codename: 'bookworm/../../evil', pretty_name: 'x', url: 'https://evil.example/', source: 'https://evil.example/', href: 'https://evil.example/' })
		expect(link.href).toBe('https://www.debian.org/releases/bookworm/amd64/release-notes/ch-upgrading.en.html')
		expect(releaseLink({ id: 'debian', codename: 'bookworm' })).toBe(null)
		expect(releaseLink({ id: 'debian', version_id: '13', codename: 'bookworm' }).href).toContain('/trixie/')
	})

	// a release that is not in the table has no link: the first one that goes in is a
	// page somebody fetched
	it.each([
		['debian', '11'],
		['debian', '14'],
		['debian', '12.1'],
		['debian', ' 12'],
		['debian', ''],
		['ubuntu', '22.04'],
		['ubuntu', '24.10'],
		['ubuntu', '26.10'],
		['ubuntu', '24.4'],
		['linuxmint', '22'],
		['raspbian', '12'],
		['Debian', '12'],
		['constructor', '12'],
		['__proto__', '12'],
	])('has no page for %s %s', (id, version_id) => {
		expect(releaseLink({ id, version_id })).toBe(null)
	})

	it.each([
		[{ id: ['debian'], version_id: ['12'] }],
		[{ id: 'debian', version_id: 12 }],
		[{ id: 'debian' }],
		[{ version_id: '12' }],
		[{}],
		[null],
		[undefined],
	])('has no page for %j', (next) => {
		expect(releaseLink(next)).toBe(null)
	})
})
