/**
 * The newer versions the box found for an app's images pinned to a version
 * (`newer_tags` of the app grid). Said only: nothing is applied, and a change of
 * tag is made in the app's settings.
 */

// the levels, the biggest change last
export const LEVELS = [
	{ key: 'patch', label: 'Bug fixes' },
	{ key: 'minor', label: 'Minor version' },
	{ key: 'major', label: 'Major version' },
]

/**
 * The versions found for one service, smallest change first.
 *
 * @param {object[]} newerTags `newer_tags` of the app, possibly absent
 * @param {string} service the service name
 * @returns {{level: string, label: string, tag: string}[]}
 */
export function newerVersionsOf(newerTags, service) {
	const entry = (newerTags || []).find(candidate => candidate.service === service)
	if (!entry)
		return []

	return LEVELS.filter(level => entry[level.key]).map(level => ({ level: level.key, label: level.label, tag: entry[level.key] }))
}

/**
 * What the card says: one line, the image and the biggest change found, or null.
 *
 * @param {object[]} newerTags `newer_tags` of the app, possibly absent
 * @returns {{image: string, current: string, tag: string, level: string}|null}
 */
export function newerBadgeOf(newerTags) {
	let best = null
	for (const entry of newerTags || []) {
		for (const [rank, level] of LEVELS.entries()) {
			if (entry[level.key] && (!best || rank > best.rank))
				best = { rank, image: entry.image, current: entry.current, tag: entry[level.key], level: level.key }
		}
	}
	if (!best)
		return null
	const { rank: _rank, ...badge } = best

	return badge
}
