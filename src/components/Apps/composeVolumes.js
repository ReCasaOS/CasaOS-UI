/**
 * One entry of a service's `volumes:`, turned into what the editor's two fields
 * need: `{type, source, target}`.
 *
 * Compose accepts two shapes for the same thing. The long one is already an
 * object and says what it is; the short one is a string that has to be read, and
 * reading it wrong is how a named volume ends up presented as a folder on the
 * host.
 */

/**
 * Whether the left-hand side of a short volume entry names a VOLUME rather than a
 * path on the host.
 *
 * Docker's rule, and the one thing that separates `backend-storage:/var/www` from
 * `./backend:/var/www`: a source carrying no path separator, and not written as a
 * relative or home path, is a volume name.
 *
 * A source with a `$` in it is left to the bind side whatever it looks like: it
 * has not been resolved yet, and `${VOLUME_PATH}` carries no slash while being a
 * path in every case that matters.
 *
 * @param {string} source the part before the first colon
 * @returns {boolean} true when this names a volume
 */
export function isNamedVolumeSource(source) {
	if (!source || source.includes('$'))
		return false

	return !source.includes('/') && !source.includes('\\') && !source.startsWith('.') && !source.startsWith('~')
}

/**
 * A host path with the App Store's `$AppID` / `${AppID}` written out as the app's
 * name, which is what the runtime puts there when it starts the app. `$$AppID` is
 * compose's escape for a literal dollar and stays as it is.
 *
 * @param {string} path a host path from the compose file
 * @param {string} appID the compose project name
 * @returns {string} the path as it is on disk
 */
export function resolveAppID(path, appID) {
	if (typeof path !== 'string' || !appID)
		return path
	return path.replace(/(?<!\$)\$(?:\{AppID\}|AppID\b)/g, () => appID)
}

/**
 * @param {object|string} entry one item of a service's `volumes:`
 * @param {(containerPath: string, hostPath: string) => string} suggestHostPath
 *   what CasaOS would put on the host side of a bind the compose file leaves open
 * @returns {object|undefined} `{type, source, target}`, or nothing for an entry
 *   that says nothing
 */
export function normalizeVolume(entry, suggestHostPath) {
	// The long syntax already IS the editor's shape. It used to be run through a
	// substitution against the compose file's top-level `volumes:` block, which maps
	// a volume NAME to its definition -- so `source.replace(name, definition)` handed
	// String.replace an object and wrote `[object Object]` into the field, or, for a
	// volume declared with nothing under it, replaced the name with an empty string
	// and lost it silently.
	if (entry && typeof entry === 'object')
		return entry

	if (typeof entry !== 'string' || entry.trim() === '')
		return undefined

	// `name:/container:ro` -- the access mode is a third part the editor does not
	// show, and splitting on every colon would take the target apart
	const parts = entry.split(':')

	if (parts.length === 1) {
		return {
			type: 'bind',
			target: parts[0],
			source: suggestHostPath(parts[0], ''),
		}
	}

	const [source, target] = parts

	// A named volume is not a folder somebody forgot to choose: it has no host path
	// to suggest, and suggesting one would turn it into a bind on save.
	if (isNamedVolumeSource(source))
		return { type: 'volume', source, target }

	return {
		type: 'bind',
		target,
		source: suggestHostPath(target, source),
	}
}
