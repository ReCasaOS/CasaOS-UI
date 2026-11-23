/**
 * @description: Format size output
 * @param {int} bytes size value
 * @return {string}
 */
export function renderSize(bytes) {
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']
	if (bytes === 0)
		return '0 Bytes'
	const i = Number.parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10)
	if (i === 0)
		return `${bytes} ${sizes[i]}`
	return `${Number.parseFloat((bytes / (1024 ** i)).toFixed(2))} ${sizes[i]}`
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
const ext = file => (file.is_dir || !file.name.includes('.') ? '' : file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase())
const keys = {
	name: (a, b) => byName(a.name, b.name),
	date: (a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0),
	size: (a, b) => (a.is_dir || b.is_dir ? 0 : (a.size || 0) - (b.size || 0)),
	format: (a, b) => byName(ext(a), ext(b)),
}

/**
 * Folders first, then by `sort` (name, date, size or format) in `order` (asc or desc); ties go by name.
 * @param {Array} files
 * @param {string} sort
 * @param {string} order
 * @return {Array} a new array
 */
export function sortFiles(files, sort, order) {
	const compare = keys[sort] || keys.name
	const sign = order === 'desc' ? -1 : 1
	return [...files].sort((a, b) => (b.is_dir - a.is_dir) || sign * compare(a, b) || byName(a.name, b.name))
}

/**
 * Filter dot-prefixed files and folders unless hidden entries are enabled.
 * @param {Array} files
 * @param {boolean} showHiddenFiles
 * @return {Array}
 */
export function filterHiddenFiles(files, showHiddenFiles) {
	if (showHiddenFiles)
		return files

	return files.filter(file => !file.name.startsWith('.'))
}
