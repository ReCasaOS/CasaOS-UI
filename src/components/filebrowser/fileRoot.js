export const FILE_ROOTS_TIMEOUT_MS = 3000

export function fileRootFrom(roots) {
	if (!Array.isArray(roots) || roots.length === 0) {
		return '/DATA'
	}
	// Only the first [file] ManagementRoots entry. Later roots are not
	// listed in the sidebar.
	return roots[0]
}

/**
 * The folders of Files given to an account (CasaOS#168), as /v1/file/roots answers them to
 * it: the roots, with the ones it may write. Null for the owner, whose answer has no
 * `writable`.
 *
 * @param {object} data the data of /v1/file/roots
 * @returns {{folders: string[], writable: string[]}|null} the account's folders
 */
export function accountFoldersFrom(data) {
	if (!data || !Array.isArray(data.writable))
		return null

	return { folders: Array.isArray(data.roots) ? data.roots : [], writable: data.writable }
}

/**
 * Whether what is in path may be changed: by the owner anywhere, by an account only in a
 * folder it may write.
 *
 * @param {string} path the folder shown
 * @param {{writable: string[]}|null} account the account's folders, null for the owner
 * @returns {boolean} whether path may be changed
 */
export function canChangeIn(path, account) {
	if (!account)
		return true

	return account.writable.some(folder => path === folder || (path || '').startsWith(`${folder}/`))
}

/**
 * The account's folders as the sidebar shows them, in place of Root and the home folders.
 *
 * @param {string[]} folders the account's folders
 * @returns {object[]} the sidebar's items
 */
export function accountFolderItems(folders) {
	return folders.map(path => ({ name: path.split('/').filter(Boolean).pop() || path, icon: 'folder-outline', pack: 'casa', path, visible: true, selected: true, extensions: null }))
}

export function withTimeout(promise, ms) {
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			setTimeout(() => reject(new Error('timeout')), ms)
		}),
	])
}

export function homeFolders(root) {
	const name = root === '/DATA' ? 'DATA' : root.split('/').filter(Boolean).pop() || root
	return [
		{ name, icon: 'data-outline', pack: 'casa', path: root, visible: true, selected: true, extensions: null },
		{ name: 'Documents', icon: 'files-outline', pack: 'casa', path: `${root}/Documents`, visible: true, selected: true, extensions: null },
		{ name: 'Downloads', icon: 'downloads-outline', pack: 'casa', path: `${root}/Downloads`, visible: true, selected: true, extensions: null },
		{ name: 'Gallery', icon: 'gallery-outline', pack: 'casa', path: `${root}/Gallery`, visible: true, selected: true, extensions: null },
		{ name: 'Media', icon: 'media-outline', pack: 'casa', path: `${root}/Media`, visible: true, selected: true, extensions: null },
	]
}
