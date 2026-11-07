// The built-in pages have addresses of their own (#/files, #/vms, #/logs…):
// a link or a bookmark opens one alone on a tab, at a place given by its query.
export function pageAddress(page, params = {}) {
	const query = Object.entries(params)
		.filter(([, value]) => value)
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join('&')
	return `${window.location.pathname}#/${page}${query ? `?${query}` : ''}`
}

export function openPage(page, params) {
	window.open(pageAddress(page, params), '_blank')
}
