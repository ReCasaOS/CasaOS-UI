// What app:update-blocked carries, read defensively: the images are a JSON string
// built on the box, and a window that cannot read them still says the update was
// blocked, from the sentence alone.
export function parseBlockedImages(raw) {
	let list
	try {
		list = JSON.parse(raw)
	} catch {
		return []
	}
	if (!Array.isArray(list))
		return []
	return list
		.filter(image => image && typeof image === 'object' && !Array.isArray(image))
		.map(image => ({ ...image, added: Array.isArray(image.added) ? image.added : [] }))
}

// How many more critical vulnerabilities the new version carries, image by image:
// an image that lost some does not make up for one that gained some.
export function moreCritical(images) {
	return images.reduce((sum, image) => {
		const more = Number(image.candidate) - Number(image.current)
		return more > 0 ? sum + more : sum
	}, 0)
}

// A link out of the dashboard only to an https page, never javascript: or data:
export function safeUrl(url) {
	return typeof url === 'string' && url.startsWith('https://') ? url : ''
}
