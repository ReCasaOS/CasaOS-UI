// Small helpers of the Files improvements of CasaOS#184 (path typed by hand, type badges).

/**
 * The folder a path typed in the path bar names: absolute, without repeated or trailing slashes.
 * A path that does not start with / is read from the folder shown. Null for an empty one.
 * @param {string} typed what was typed
 * @param {string} current the folder shown
 * @returns {string|null} the folder to open
 */
export function typedPath(typed, current = '/') {
	const text = (typed || '').trim()
	if (!text) {
		return null
	}
	const joined = text.startsWith('/') ? text : `${current.replace(/\/+$/, '')}/${text}`
	const parts = []
	for (const part of joined.split('/')) {
		if (part === '' || part === '.') {
			continue
		}
		if (part === '..') {
			parts.pop()
			continue
		}
		parts.push(part)
	}
	return `/${parts.join('/')}`
}

/**
 * The badge a file's icon carries: its extension, upper case, when short enough to read on
 * an icon. None for a folder, a file without extension, or a name that is all extension.
 * @param {{ name: string, is_dir: boolean }} item the file
 * @returns {string} the badge, or ''
 */
export function fileBadge(item) {
	if (!item || item.is_dir) {
		return ''
	}
	const name = item.name || ''
	const dot = name.lastIndexOf('.')
	if (dot <= 0 || dot === name.length - 1) {
		return ''
	}
	const ext = name.slice(dot + 1)
	return ext.length <= 4 && /^[a-z0-9]+$/i.test(ext) ? ext.toUpperCase() : ''
}
