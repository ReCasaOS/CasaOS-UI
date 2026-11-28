import { describe, expect, it } from 'vitest'
import { handleGrid, newGridState } from './grid.js'

// The API widgets of the core, as the dashboard asks for them: through the stub of the box, in the core's envelope.
const ask = (method, path, body = null, state = newGridState()) => handleGrid({ method, path, body }, state)
const WIDGETS = '/v1/sys/widgets'
const change = {
	base: 'http://192.168.1.20:8080',
	insecure_tls: false,
	recipe: { recasaos_widget: 1, name: 'Mine', path: '/api', headers: { 'x-api-key': { input: 'api_key' } }, inputs: [{ id: 'api_key', label: 'API key' }], layout: 'rows', rows: [{ label: 'Up', value: '/up', format: 'text' }], refresh: 300 },
	secrets: { api_key: 'k-secret' },
}

describe('the stub of the API widgets', () => {
	it('lists two widgets, with their recipe and no secret: one of figures, one that is a list', () => {
		const { status, body } = ask('GET', WIDGETS)
		expect(status).toBe(200)
		expect(body.data.widgets.map(widget => widget.recipe.layout)).toEqual(['figures', 'rows'])
		for (const widget of body.data.widgets) {
			expect(widget).toMatchObject({ id: expect.stringMatching(/^[a-z0-9]{8}$/), base: expect.stringMatching(/^http/), insecure_tls: false, error: '' })
			expect(widget.secrets).toBeUndefined()
		}
		expect(body.data.widgets[0].inputs_set).toEqual({ api_key: true })
		expect(body.data.widgets[1].recipe.rows[0].each).toBe('/servers')
	})

	it('answers their cards as the core shapes them: figures with a bar, and a list with levels and rows left out', () => {
		const [figures, list] = ask('GET', WIDGETS).body.data.widgets.map(widget => ask('GET', `${WIDGETS}/${widget.id}/card`).body.data)
		expect(figures).toMatchObject({ layout: 'figures', more: 0 })
		expect(figures.rows.find(row => row.bar !== undefined)).toMatchObject({ value: { kind: 'percent', number: expect.any(Number) }, bar: expect.any(Number) })
		expect(list).toMatchObject({ layout: 'rows', status: { level: 'danger', value: { kind: 'text' } } })
		expect(list.more).toBeGreaterThan(0)
		expect(new Set(list.rows.map(row => row.level))).toEqual(new Set(['ok', 'danger']))
		expect(ask('GET', `${WIDGETS}/nosuch00/card`)).toMatchObject({ status: 404, body: { message: 'no such widget' } })
	})

	it('creates a widget, changes it and deletes it', () => {
		const state = newGridState()
		const created = ask('POST', WIDGETS, change, state).body.data
		expect(created).toMatchObject({ id: expect.stringMatching(/^[a-z0-9]{8}$/), base: change.base, recipe: change.recipe, inputs_set: { api_key: true }, error: '' })
		expect(JSON.stringify(state.widgets)).not.toContain('k-secret')
		expect(ask('GET', WIDGETS, null, state).body.data.widgets).toHaveLength(3)
		expect(ask('GET', `${WIDGETS}/${created.id}/card`, null, state).body.data).toMatchObject({ title: 'Mine', rows: [{ label: 'Up' }] })

		const renamed = { ...change, recipe: { ...change.recipe, name: 'Renamed' }, secrets: {} }
		expect(ask('PUT', `${WIDGETS}/${created.id}`, renamed, state).body.data.recipe.name).toBe('Renamed')
		expect(ask('PUT', `${WIDGETS}/nosuch00`, renamed, state).status).toBe(404)

		expect(ask('DELETE', `${WIDGETS}/${created.id}`, null, state).status).toBe(200)
		expect(ask('DELETE', `${WIDGETS}/${created.id}`, null, state).status).toBe(404)
		expect(ask('GET', WIDGETS, null, state).body.data.widgets).toHaveLength(2)
	})

	it('refuses a widget without a name or without a secret, and asks for the secrets again when the address changes', () => {
		const state = newGridState()
		expect(ask('POST', WIDGETS, { ...change, recipe: { ...change.recipe, name: '' } }, state)).toMatchObject({ status: 400, body: { success: 400, message: expect.stringContaining('name') } })
		expect(ask('POST', WIDGETS, { ...change, secrets: {} }, state)).toMatchObject({ status: 400, body: { message: expect.stringContaining('api_key') } })
		const { id } = ask('POST', WIDGETS, change, state).body.data
		const moved = ask('PUT', `${WIDGETS}/${id}`, { ...change, base: 'http://192.168.1.21:8080', secrets: {} }, state)
		expect(moved).toMatchObject({ status: 400, body: { data: { secrets_again: true }, message: expect.stringContaining('filled again') } })
	})

	it('answers a test with an answer worth a tree and a card, and refuses an address that holds "fail"', () => {
		const { response, card } = ask('POST', `${WIDGETS}/test`, change).body.data
		expect(response.servers.length).toBeGreaterThan(50)
		expect(response.note).toContain('<script>')
		expect(response.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
		expect(response.system.disk.root.used_percent).toEqual(expect.any(Number))
		expect(card).toMatchObject({ title: 'Mine', layout: 'rows', rows: [{ label: 'Up', value: { kind: 'text' } }] })
		expect(ask('POST', `${WIDGETS}/test`, { ...change, base: 'http://fail.lan' })).toMatchObject({ status: 400, body: { message: 'the address answered 503' } })
	})

	it('takes, in a test of a widget it has, the secrets it keeps', () => {
		const state = newGridState()
		const [immich] = ask('GET', WIDGETS, null, state).body.data.widgets
		const same = { id: immich.id, base: immich.base, insecure_tls: false, recipe: immich.recipe, secrets: {} }
		expect(ask('POST', `${WIDGETS}/test`, same, state).status).toBe(200)
		expect(ask('POST', `${WIDGETS}/test`, { ...same, base: 'http://192.168.1.99' }, state).body.data).toEqual({ secrets_again: true })
	})

	it('answers a preview with the card of the recipe it is given', () => {
		const recipe = { ...change.recipe, layout: 'figures', rows: [{ label: 'One', value: '/a' }, { each: '/servers', label: '/name', value: '/state', limit: 3 }] }
		const card = ask('POST', `${WIDGETS}/preview`, { recipe, response: {} }).body.data
		expect(card).toMatchObject({ title: 'Mine', layout: 'figures', more: 0, refresh: 300 })
		expect(card.rows.map(row => row.label)).toEqual(['One', 'item 1', 'item 2', 'item 3'])
	})
})
