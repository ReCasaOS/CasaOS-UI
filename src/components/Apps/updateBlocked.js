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
		.filter(isObject)
		.map(image => ({ ...image, added: Array.isArray(image.added) ? image.added.filter(isObject) : [] }))
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// How many more critical vulnerabilities the new version carries, image by image:
// an image that lost some does not make up for one that gained some. Counts are
// read with Number(), so "3" counts; anything that is then not a whole number
// (Infinity, "1e999", 1.5, garbage) is ignored.
export function moreCritical(images) {
	return images.reduce((sum, image) => {
		const candidate = Number(image.candidate)
		const current = Number(image.current)
		if (!Number.isInteger(candidate) || !Number.isInteger(current))
			return sum
		const more = candidate - current
		return more > 0 ? sum + more : sum
	}, 0)
}

// A link out of the dashboard only to an https page, never javascript: or data:
export function safeUrl(url) {
	return typeof url === 'string' && url.startsWith('https://') ? url : ''
}
