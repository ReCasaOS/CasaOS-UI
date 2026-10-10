import { describe, expect, it } from 'vitest'
import { SUPPORT_SENTENCES, formatDate, osBadge, releaseLink, releaseName, supportSentence } from './osSupport'

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
		['security_ended', { tone: 'danger', label: 'System out of support' }],
	])('shows for %s', (state, expected) => {
		expect(osBadge(view({ state, ends: '2026-08-31', precision: 'day' }))).toEqual(expect.objectContaining(expected))
	})

	// the keys of the badge's table are states; a state named like an Object method is not one
	it.each(['supported', 'unknown', '', undefined, null, 'constructor', '__proto__', 'toString', 'SECURITY_ENDED'])('shows nothing for the state %s', (state) => {
		expect(osBadge(view({ state }))).toBe(null)
	})

	it('shows nothing for a system the core does not know, whatever the state says', () => {
		expect(osBadge(view({ state: 'security_ended' }, { known: false }))).toBe(null)
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
	it.each([
		['security_ended', '2026-08-31', 'day', '{name} has not received security updates from its distribution since {date}.', 'August 31, 2026'],
		['security_ended', '2027-06-01', 'month', '{name} has not received security updates from its distribution since about {date}.', 'June 2027'],
		['ending_soon', '2027-06-01', 'day', '{name} receives security updates from its distribution until {date}.', 'June 1, 2027'],
		['ending_soon', '2027-06-01', 'month', '{name} receives security updates from its distribution until about {date}.', 'June 2027'],
	])('for %s ending %s at precision %s', (state, ends, precision, key, date) => {
		expect(supportSentence({ state, ends, precision }, 'en_us')).toEqual({ key, date })
	})

	it.each([
		['security_ended', '{name} no longer receives security updates from its distribution.'],
		['ending_soon', '{name} will soon stop receiving security updates from its distribution.'],
	])('for %s without a date says it without one', (state, key) => {
		expect(supportSentence({ state }, 'en_us')).toEqual({ key })
		expect(supportSentence({ state, ends: '2026-02-31', precision: 'day' }, 'en_us')).toEqual({ key })
	})

	it.each(['supported', 'unknown', '', undefined, 'constructor'])('says nothing for the state %s', (state) => {
		expect(supportSentence({ state, ends: '2026-08-31', precision: 'day' }, 'en_us')).toBe(null)
	})

	it('says nothing without a support view', () => {
		expect(supportSentence(undefined, 'en_us')).toBe(null)
		expect(supportSentence(null, 'en_us')).toBe(null)
	})

	it('lists the six sentences, for the language files\' test', () => {
		expect(new Set(SUPPORT_SENTENCES).size).toBe(6)
		expect(SUPPORT_SENTENCES.every(key => key.includes('{name}'))).toBe(true)
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

describe('the official page', () => {
	it('is the release notes of the next Debian', () => {
		expect(releaseLink({ id: 'debian', codename: 'bookworm' })).toEqual({
			label: 'Release notes',
			href: 'https://www.debian.org/releases/bookworm/release-notes/',
		})
		expect(releaseLink({ id: 'debian', codename: 'trixie' }).href).toBe('https://www.debian.org/releases/trixie/release-notes/')
	})

	it('is the upgrade guide of Ubuntu, whatever the release', () => {
		for (const codename of ['noble', 'resolute', undefined]) {
			expect(releaseLink({ id: 'ubuntu', codename })).toEqual({
				label: 'Upgrade guide',
				href: 'https://documentation.ubuntu.com/server/how-to/software/upgrade-your-release/',
			})
		}
	})

	// the codename goes into an address: nothing but a codename gets there
	it.each([undefined, null, '', 'a', 'Bookworm', 'book worm', 'bookworm/../../evil', 'bookworm?x=1', 'bookworm#x', '..', 'a'.repeat(21), 12, ['bookworm'], 'bookworm\n'])('has no page for the Debian codename %j', (codename) => {
		expect(releaseLink({ id: 'debian', codename })).toBe(null)
	})

	it('has no page for another distribution, and takes no address from the core', () => {
		expect(releaseLink({ id: 'linuxmint', codename: 'wilma' })).toBe(null)
		expect(releaseLink({ id: 'raspbian', codename: 'bookworm' })).toBe(null)
		expect(releaseLink(null)).toBe(null)
		expect(releaseLink(undefined)).toBe(null)
		expect(releaseLink({ id: 'ubuntu', url: 'https://evil.example/', source: 'https://evil.example/', href: 'https://evil.example/' }).href).not.toContain('evil')
	})
})
