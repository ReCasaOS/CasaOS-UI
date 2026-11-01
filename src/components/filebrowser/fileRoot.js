export const FILE_ROOTS_TIMEOUT_MS = 3000

export function fileRootFrom(roots) {
	if (!Array.isArray(roots) || roots.length === 0) {
		return '/DATA'
	}
	// Only the first [file] ManagementRoots entry. Later roots are not
	// listed in the sidebar.
	return roots[0]
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
