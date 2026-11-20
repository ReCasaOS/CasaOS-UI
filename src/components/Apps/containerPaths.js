// Paths inside a container, always absolute, `/` the top.

/**
 * The folders from the top down to path, each with the path that opens it.
 *
 * @param {string} path an absolute path
 * @returns {{name: string, path: string}[]} the crumbs, `/` first
 */
export function crumbsOf(path) {
	const crumbs = [{ name: '/', path: '/' }]
	let at = ''
	for (const part of path.split('/').filter(Boolean)) {
		at += `/${part}`
		crumbs.push({ name: part, path: at })
	}

	return crumbs
}

/**
 * The path of a name in a folder.
 *
 * @param {string} dir an absolute folder
 * @param {string} name a name in it
 * @returns {string} the absolute path
 */
export function join(dir, name) {
	return dir === '/' ? `/${name}` : `${dir}/${name}`
}

/**
 * The folder that holds path; `/` holds itself.
 *
 * @param {string} path an absolute path
 * @returns {string} its parent folder
 */
export function parentOf(path) {
	const cut = path.lastIndexOf('/')

	return cut <= 0 ? '/' : path.slice(0, cut)
}
