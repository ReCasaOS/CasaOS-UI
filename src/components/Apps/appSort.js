// The orders of the compact grid's apps (CasaOS#183). `custom` is the order the owner
// drags, saved for the box; the others are views of it, and ties keep it.

export const SORTS = ['custom', 'name', 'name-desc', 'memory', 'status']

export const SORT_LABELS = {
	'custom': 'Custom order',
	'name': 'Name (A to Z)',
	'name-desc': 'Name (Z to A)',
	'memory': 'Memory used',
	'status': 'Running first',
}

const STORAGE_KEY = 'casaos-app-sort'

// the browser's choice, `custom` when there is none or it cannot be read
export function savedSort() {
	try {
		const sort = localStorage.getItem(STORAGE_KEY)
		return SORTS.includes(sort) ? sort : 'custom'
	} catch {
		return 'custom'
	}
}

export function saveSort(sort) {
	try {
		localStorage.setItem(STORAGE_KEY, sort)
	} catch {
		// a private window: the choice lasts until the page is left
	}
}

/**
 * apps in the order `sort` asks for; a new array, ties left in their given order.
 * @param {Array} apps the apps, in the custom order
 * @param {string} sort one of SORTS
 * @param {{ title: (app) => string, memory: Record<string, number> }} by how an app is named, and the bytes each uses
 * @returns {Array} the apps sorted
 */
export function sortApps(apps, sort, { title, memory = {} }) {
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
	const compare = {
		'name': (a, b) => collator.compare(title(a), title(b)),
		'name-desc': (a, b) => collator.compare(title(b), title(a)),
		'memory': (a, b) => (memory[b.name] || 0) - (memory[a.name] || 0),
		'status': (a, b) => Number(b.status === 'running') - Number(a.status === 'running'),
	}[sort]
	// Array.prototype.sort is stable: equal apps keep the custom order
	return compare ? [...apps].sort(compare) : apps
}
