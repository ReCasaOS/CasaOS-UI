/**
 * What the dashboard makes of GET /v1/sys/os: whether the top bar shows a badge, the
 * words and the date of the support sentence, and the one official page of a
 * distribution.
 *
 * Texts are language-file keys. Every value that comes from the core is shown as a
 * text node, never as HTML, and the links are built here from the release's id: the
 * `source` URL the core sends is not used.
 */

// The two states that call for a badge. `supported` and `unknown` show nothing.
const BADGES = new Map([
	['ending_soon', { tone: 'warning', label: 'System support ends soon', icon: 'alert-outline' }],
	['security_ended', { tone: 'danger', label: 'System out of support', icon: 'alert-circle-outline' }],
])

/**
 * The badge for what the core answered, or null: nothing for a supported or an unknown
 * system, for one the core does not know, or for an answer that is not a view.
 */
export function osBadge(os) {
	if (!os || os.known === false)
		return null
	return BADGES.get(os.support?.state) ?? null
}

// One sentence per state and per precision of the date, and one for a date that is
// missing. The date's own words ("on", "until", "about") are in the sentence because
// they do not carry over from one language to the next as a piece to glue in.
const ENDED = 'ended'
const ENDING = 'ending'
const SENTENCES = {
	[ENDED]: {
		day: '{name} has not received security updates from its distribution since {date}.',
		month: '{name} has not received security updates from its distribution since about {date}.',
		none: '{name} no longer receives security updates from its distribution.',
	},
	[ENDING]: {
		day: '{name} receives security updates from its distribution until {date}.',
		month: '{name} receives security updates from its distribution until about {date}.',
		none: '{name} will soon stop receiving security updates from its distribution.',
	},
}

// Every key of the sentences above, for the language files' test.
export const SUPPORT_SENTENCES = Object.values(SENTENCES).flatMap(Object.values)

/**
 * The key of the sentence for a support view and the date to put in it, or null when
 * the state is not one that has a sentence. `locale` is the language of the sentence
 * (an Intl tag or a language-file name such as fr_fr).
 */
export function supportSentence(support, locale) {
	const kind = support?.state === 'security_ended' ? ENDED : support?.state === 'ending_soon' ? ENDING : null
	if (!kind)
		return null
	const date = formatDate(support.ends, support.precision, locale)
	if (!date)
		return { key: SENTENCES[kind].none }
	return { key: SENTENCES[kind][support.precision === 'month' ? 'month' : 'day'], date }
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
