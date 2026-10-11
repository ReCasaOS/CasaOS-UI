/**
 * What the dashboard makes of GET /v1/sys/os: whether the top bar shows a badge, the
 * words and the date of the support sentence, and the one official page of a
 * distribution.
 *
 * Texts are language-file keys. Every value that comes from the core is shown as a
 * text node, never as HTML, and the links are built here from the release's id and
 * version: the `source` URL the core sends is not used.
 *
 * What the states say is what the vendor's free or standard security support covers:
 * Ubuntu Pro (ESM) and Debian ELTS exist after it, so "ended" is never "no updates at
 * all".
 */

// One sentence per distribution, per state and per precision of the date, and one for a
// date that is missing. The date's own words ("on", "until", "around") are in the
// sentence because they do not carry over from one language to the next as a piece to
// glue in. A distribution that is not here has no sentence, and no badge.
const ENDED = 'ended'
const ENDING = 'ending'
const SENTENCES = new Map([
	['debian', {
		[ENDED]: {
			day: 'Free security updates for {name} ended on {date}.',
			month: 'Free security updates for {name} ended around {date}.',
			none: 'Free security updates for {name} have ended.',
		},
		[ENDING]: {
			day: 'Free security updates for {name} end on {date}.',
			month: 'Free security updates for {name} end around {date}.',
			none: 'Free security updates for {name} will end soon.',
		},
	}],
	['ubuntu', {
		[ENDED]: {
			day: 'Standard security support for {name} ended on {date}.',
			month: 'Standard security support for {name} ended around {date}.',
			none: 'Standard security support for {name} has ended.',
		},
		[ENDING]: {
			day: 'Standard security support for {name} ends on {date}.',
			month: 'Standard security support for {name} ends around {date}.',
			none: 'Standard security support for {name} will end soon.',
		},
	}],
])
const KINDS = new Map([['security_ended', ENDED], ['ending_soon', ENDING]])

// Every key of the sentences above, for the language files' test.
export const SUPPORT_SENTENCES = [...SENTENCES.values()].flatMap(kinds => Object.values(kinds).flatMap(Object.values))

// The later programme is Canonical's for Ubuntu and Freexian's for Debian: the sentence
// says that it is offered separately, and whose it is only through the name the core sends.
const EXTENDED = {
	day: 'Extended security maintenance is offered separately: {name}, until {date}.',
	month: 'Extended security maintenance is offered separately: {name}, until around {date}.',
}
export const EXTENDED_SENTENCES = Object.values(EXTENDED)

// The two states that call for a badge. `supported` and `unknown` show nothing.
const BADGES = new Map([
	['ending_soon', { tone: 'warning', label: 'System support ends soon', icon: 'alert-outline' }],
	['security_ended', { tone: 'danger', label: 'System support ended', icon: 'alert-circle-outline' }],
])

/**
 * The badge for what the core answered, or null: nothing for a supported or an unknown
 * system, for one the core does not know or knows as a variant (Raspberry Pi OS,
 * Armbian... say debian and are not Debian), for a distribution that has no sentence, or
 * for an answer that is not a view.
 */
export function osBadge(os) {
	if (!os || os.known === false || os.variant || !SENTENCES.has(os.id))
		return null
	return BADGES.get(os.support?.state) ?? null
}

/**
 * The key of the sentence for a distribution's support view and the date to put in it,
 * or null when the state is not one that has a sentence. `locale` is the language of
 * the sentence (an Intl tag or a language-file name such as fr_fr).
 */
export function supportSentence(support, locale, distro) {
	const sentences = SENTENCES.get(distro)?.[KINDS.get(support?.state)]
	if (!sentences)
		return null
	const date = formatDate(support.ends, support.precision, locale)
	if (!date)
		return { key: sentences.none }
	return { key: sentences[support.precision === 'month' ? 'month' : 'day'], date }
}

/**
 * The key of the sentence for the extended programme and the date to put in it, or null
 * without a name or a real date. The core's `extended.precision` is absent from an older
 * core: that date is a day.
 */
export function extendedSentence(extended, locale) {
	const date = formatDate(extended?.ends, extended?.precision, locale)
	if (!extended?.name || !date)
		return null
	return { key: EXTENDED[extended.precision === 'month' ? 'month' : 'day'], date }
}

/**
 * 'YYYY-MM-DD' written for a language: "31 August 2026", or "June 2027" for a date the
 * sources only give to the month. '' for anything that is not a real calendar day.
 * Read as UTC, so that no time zone moves it to the day before.
 */
export function formatDate(ends, precision, locale = 'en') {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ends)
	if (!match)
		return ''
	const [year, month, day] = match.slice(1).map(Number)
	const date = new Date(Date.UTC(year, month - 1, day))
	// 2026-02-31 would roll over to March: not a date
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
		return ''
	const options = precision === 'month'
		? { year: 'numeric', month: 'long', timeZone: 'UTC' }
		: { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
	try {
		return new Intl.DateTimeFormat(String(locale).replace('_', '-'), options).format(date)
	} catch {
		// a language-file name that is not an Intl tag
		return new Intl.DateTimeFormat('en', options).format(date)
	}
}

/**
 * The name to show for a release: its pretty name, or its id and version when the core
 * sent none.
 */
export function releaseName(release) {
	if (!release)
		return ''
	return release.pretty_name || [release.id, release.version_id].filter(Boolean).join(' ')
}

// The official page to read before upgrading TO a release, keyed by that release's id and
// version. Each address was fetched on 2026-10-11 and answered 200 (the flat
// /releases/<codename>/release-notes/ of Debian is a 404 for bookworm, and
// documentation.ubuntu.com redirects to ubuntu.com): when Debian or Canonical move a
// page, change it here and in the spec that pins it. A release that is not here has no link.
const DEBIAN_NOTES = 'Release notes'
const UBUNTU_GUIDE = { label: 'Upgrade guide', href: 'https://ubuntu.com/server/docs/how-to/software/upgrade-your-release/' }
const RELEASE_LINKS = new Map([
	['debian-12', { label: DEBIAN_NOTES, href: 'https://www.debian.org/releases/bookworm/amd64/release-notes/ch-upgrading.en.html' }],
	['debian-13', { label: DEBIAN_NOTES, href: 'https://www.debian.org/releases/trixie/release-notes/upgrading.en.html' }],
	['ubuntu-24.04', UBUNTU_GUIDE],
	['ubuntu-26.04', UBUNTU_GUIDE],
])

/**
 * The official page for the upgrade to `next`, or null. Only an id and a version, both
 * texts, go into the key: the codename, the pretty name and every address the core might
 * send are not read.
 */
export function releaseLink(next) {
	if (typeof next?.id !== 'string' || typeof next.version_id !== 'string')
		return null
	return RELEASE_LINKS.get(`${next.id}-${next.version_id}`) ?? null
}
