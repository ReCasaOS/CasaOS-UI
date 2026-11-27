// The API widgets of the core (/v1/sys/widgets), for the dev server: two widgets, one of figures with a bar and one list with levels and
// rows left out. Nothing is read anywhere: what a test "reads" is always TEST_ANSWER, and the card of a test, of a preview or of a widget
// made here is a sample made of the recipe (its rows with their labels, "sample" for every value). An address that holds "fail" cannot be
// read. A secret is never kept: only that it was given.

const ONE_WIDGET = /^\/v1\/sys\/widgets\/([a-z0-9]{8})(\/card)?$/

// deeper than two levels, a list of more than 50 items, a text that would be markup, a date
const TEST_ANSWER = {
	name: 'nas',
	up: true,
	checked_at: '2026-11-27T10:15:00Z',
	note: '<script>alert(1)</script>',
	photos: 48213,
	system: { uptime_seconds: 931234, disk: { root: { used_percent: 72.4, used_bytes: 412316860416 }, data: { used_percent: 31 } } },
	servers: Array.from({ length: 60 }, (_, n) => ({ name: `server-${n + 1}`, state: n % 5 === 1 ? 'down' : 'up', since: '2026-11-20T08:00:00Z' })),
	tags: ['home', 'backup'],
}

// the cards of the two widgets, as the core shapes a card: bare numbers, a level, a bar
const CARDS = {
	immich01: {
		title: 'Immich',
		icon: 'storage-outline',
		layout: 'figures',
		rows: [
			{ label: 'Photos', value: { kind: 'number', number: 48213 } },
			{ label: 'Videos', value: { kind: 'number', number: 1920 } },
			{ label: 'Storage', value: { kind: 'bytes', number: 412316860416 } },
			{ label: 'Disk', value: { kind: 'percent', number: 72.4 }, level: 'warning', bar: 72.4 },
		],
		more: 0,
		link: 'http://192.168.1.10:2283',
		refresh: 3600,
	},
	servers1: {
		title: 'Servers',
		icon: 'network-outline',
		layout: 'rows',
		status: { value: { kind: 'text', text: '12 down' }, level: 'danger' },
		rows: [
			{ label: 'server-1', value: { kind: 'text', text: 'up' }, level: 'ok' },
			{ label: 'server-2', value: { kind: 'text', text: 'DOWN' }, level: 'danger' },
			{ label: 'server-3', value: { kind: 'text', text: 'up' }, level: 'ok' },
		],
		more: 57,
		link: 'https://status.example.org',
		refresh: 300,
	},
}

export function newWidgets() {
	return [
		{
			id: 'immich01',
			base: 'http://192.168.1.10:2283',
			insecure_tls: false,
			recipe: {
				recasaos_widget: 1,
				name: 'Immich',
				icon: 'storage-outline',
				path: '/api/server/statistics',
				headers: { 'x-api-key': { input: 'api_key' } },
				inputs: [{ id: 'api_key', label: 'API key' }],
				base_hint: 'http://IP:2283',
				layout: 'figures',
				rows: [
					{ label: 'Photos', value: '/photos', format: 'number' },
					{ label: 'Videos', value: '/videos', format: 'number' },
					{ label: 'Storage', value: '/usage', format: 'bytes' },
					{ label: 'Disk', value: '/disk/used_percent', format: 'percent', bar: true, rules: [{ op: 'gt', to: 90, level: 'danger' }, { op: 'gt', to: 70, level: 'warning' }] },
				],
				refresh: 3600,
			},
			inputs_set: { api_key: true },
			error: '',
		},
		{
			id: 'servers1',
			base: 'https://status.example.org',
			insecure_tls: false,
			recipe: {
				recasaos_widget: 1,
				name: 'Servers',
				icon: 'network-outline',
				path: '/api/servers',
				query: { site: 'home' },
				layout: 'rows',
				rows: [{ each: '/servers', label: '/name', value: '/state', format: 'text', limit: 3, rules: [{ op: 'eq', to: 'up', level: 'ok' }, { op: 'ne', to: 'up', level: 'danger', text: 'DOWN' }] }],
				status: { value: '/down', format: 'number', unit: 'down', rules: [{ op: 'gt', to: 0, level: 'danger' }] },
				refresh: 300,
			},
			inputs_set: {},
			error: '',
		},
	]
}

const core = data => ({ status: 200, body: { success: 200, message: 'ok', data } })
const refused = (message, data) => ({ status: 400, body: { success: 400, message: `invalid widget: ${message}`, ...(data && { data }) } })

// the card a recipe would make, with a sample in place of each value
function sampleCard(recipe, base) {
	const rows = (recipe.rows || []).flatMap(row => typeof row.each === 'string'
		? Array.from({ length: row.limit || 1 }, (_, n) => ({ label: `item ${n + 1}`, value: { kind: 'text', text: 'sample' } }))
		: [{ label: row.label, value: { kind: 'text', text: 'sample' } }])
	return {
		title: recipe.name,
		...(recipe.icon && { icon: recipe.icon }),
		layout: recipe.layout || 'rows',
		...(recipe.status && { status: { value: { kind: 'text', text: 'sample' }, level: 'info' } }),
		rows,
		more: 0,
		...(base && { link: base }),
		refresh: recipe.refresh || 300,
	}
}

// The little the core checks first of a change, and the widget made of it: { widget }, or a refusal. `old` is the widget it replaces: its
// secrets are kept as long as the address is the same (the core compares the whole request).
function built(change, old) {
	const recipe = change?.recipe
	if (!recipe || typeof recipe.name !== 'string' || !recipe.name) {
		return refused('name must be 1 to 40 characters')
	}
	if (typeof change.base !== 'string' || !/^https?:\/\//.test(change.base)) {
		return refused('the address must start with http:// or https://')
	}
	const inputsSet = {}
	for (const { id } of recipe.inputs || []) {
		const kept = old?.base === change.base && old.inputs_set[id]
		if (!change.secrets?.[id] && !kept) {
			return old ? refused('the address or the request changed, every input must be filled again', { secrets_again: true }) : refused(`the input "${id}" is not filled`)
		}
		inputsSet[id] = true
	}
	return { widget: { base: change.base, insecure_tls: !!change.insecure_tls, recipe, inputs_set: inputsSet, error: '' } }
}

/** Answers a call to /v1/sys/widgets, or null for one that is not a route. `list` is the widgets of the box, changed in place. */
export function handleWidgets(verb, path, body, list) {
	if (path === '/v1/sys/widgets' && verb === 'GET') {
		return core({ widgets: list })
	}
	if (path === '/v1/sys/widgets' && verb === 'POST') {
		const made = built(body)
		if (!made.widget) {
			return made
		}
		const widget = { id: Math.random().toString(36).slice(2).padEnd(8, '0').slice(0, 8), ...made.widget }
		list.push(widget)
		return core(widget)
	}
	if (path === '/v1/sys/widgets/test' && verb === 'POST') {
		const made = built(body, list.find(widget => widget.id === body?.id))
		if (!made.widget) {
			return made
		}
		if (made.widget.base.includes('fail')) {
			return { status: 400, body: { success: 400, message: 'the address answered 503' } }
		}
		return core({ response: TEST_ANSWER, card: sampleCard(made.widget.recipe, made.widget.base) })
	}
	if (path === '/v1/sys/widgets/preview' && verb === 'POST') {
		return body?.recipe?.name ? core(sampleCard(body.recipe)) : refused('name must be 1 to 40 characters')
	}
	const one = path.match(ONE_WIDGET)
	if (!one) {
		return null
	}
	const at = list.findIndex(widget => widget.id === one[1])
	if (at < 0) {
		return { status: 404, body: { success: 404, message: 'no such widget' } }
	}
	const widget = list[at]
	if (one[2]) {
		// one of the two keeps its figures, under the name it has now
		return verb === 'GET' ? core(CARDS[widget.id] ? { ...CARDS[widget.id], title: widget.recipe.name } : sampleCard(widget.recipe, widget.base)) : null
	}
	if (verb === 'PUT') {
		const made = built(body, widget)
		if (!made.widget) {
			return made
		}
		list[at] = { id: widget.id, ...made.widget }
		return core(list[at])
	}
	if (verb === 'DELETE') {
		list.splice(at, 1)
		return core(null)
	}
	return null
}
