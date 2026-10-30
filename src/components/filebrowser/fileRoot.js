export function fileRootFrom(roots) {
	if (!Array.isArray(roots) || roots.length === 0) {
		return '/DATA'
	}
	return roots[0]
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
