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
 * What the card says: one line, the image and the smallest change found (bug fixes,
 * else a minor version), or null. A major version alone is not put on the card: it can
 * change how the app works, and is said in the settings, beside the Tag list.
 *
 * @param {object[]} newerTags `newer_tags` of the app, possibly absent
 * @returns {{image: string, current: string, tag: string, level: string}|null}
 */
export function newerBadgeOf(newerTags) {
	for (const level of LEVELS.filter(candidate => candidate.key !== 'major')) {
		const entry = (newerTags || []).find(candidate => candidate[level.key])
		if (entry)
			return { image: entry.image, current: entry.current, tag: entry[level.key], level: level.key }
	}

	return null
}

/**
 * The repository of an image, without its tag: the last `:` after the last `/`, so a
 * registry port (`registry:5000/app:1.2`) is kept.
 *
 * @param {string} image an image reference
 * @returns {string}
 */
export function repoOf(image) {
	const colon = image.lastIndexOf(':')

	return colon > image.lastIndexOf('/') ? image.slice(0, colon) : image
}
