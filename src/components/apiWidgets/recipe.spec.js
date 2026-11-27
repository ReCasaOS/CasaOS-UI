import { describe, expect, it } from 'vitest'
import { countRow, encodePath, exportRecipe, fileName, fixedTexts, formOf, importRecipe, inputIdOf, isSecretName, leafRow, listRow, pointerOf, recipeOf, requestOf, ruleTo, secretsOf, sentParts, splitBase, splitPath } from './recipe'

const immich = {
	recasaos_widget: 1,
	name: 'Immich',
	icon: 'media-outline',
	path: '/api/server/statistics',
	query: { limit: '5', api_token: { input: 'tok' } },
	headers: { 'x-api-key': { input: 'api_key' }, 'Accept': 'application/json' },
	basic: { user: 'admin', password: { input: 'pass' } },
	inputs: [{ id: 'api_key', label: 'API key' }, { id: 'tok', label: 'Token' }, { id: 'pass', label: 'Password' }],
	base_hint: 'http://IP:2283',
	layout: 'figures',
	rows: [
		{ label: 'Photos', value: '/photos', format: 'number', unit: 'pics', rules: [{ op: 'gt', to: 1000, level: 'warning', text: 'Many' }] },
		{ label: 'Disk', value: '/usage', format: 'percent', bar: true },
		{ each: '', label: '/name', value: '/state', format: 'text', limit: 3 },
	],
	status: { value: '/status', format: 'text', rules: [{ op: 'eq', to: 'ok', level: 'ok' }, { op: 'ne', to: 'ok', level: 'danger', text: 'DOWN' }] },
	refresh: 3600,
}

describe('a JSON pointer', () => {
	it('is written by RFC 6901: ~ first, then /', () => {
		expect(pointerOf(['a/b', 'c~d', 0])).toBe('/a~1b/c~0d/0')
		expect(pointerOf(['~1'])).toBe('/~01')
	})

	it('is empty for the root', () => {
		expect(pointerOf([])).toBe('')
	})
})

describe('the path of a recipe', () => {
	it('gets its spaces and its letters outside ASCII percent-encoded, and keeps what is encoded already', () => {
		expect(encodePath('/api/my files/été')).toBe('/api/my%20files/%C3%A9t%C3%A9')
		expect(encodePath('/a%20b/%C3%A9')).toBe('/a%20b/%C3%A9')
		expect(encodePath('/v1/items(1)/a:b@c;d=e,f+g')).toBe('/v1/items(1)/a:b@c;d=e,f+g')
		expect(encodePath('/50%/"x"')).toBe('/50%25/%22x%22')
	})

	it('leaves its query to the parameters', () => {
		expect(splitPath('/api/x?limit=5&q=a%20b#top')).toEqual({ path: '/api/x', query: [['limit', '5'], ['q', 'a b']] })
		expect(splitPath('/api/x')).toBeNull()
	})
})

describe('a whole address in the field of the base', () => {
	it('is split: the origin stays, the path and the parameters go to their fields', () => {
		expect(splitBase('https://nas.lan:8443/api/v1/stats?limit=5&apikey=abc')).toEqual({ base: 'https://nas.lan:8443', path: '/api/v1/stats', query: [['limit', '5'], ['apikey', 'abc']] })
		expect(splitBase(' http://192.168.1.10/a b ')).toEqual({ base: 'http://192.168.1.10', path: '/a%20b', query: [] })
	})

	it('is left as it is typed when it is only a base, or not an address', () => {
		for (const base of ['http://192.168.1.10:2283', 'http://192.168.1.10:2283/', 'nas.lan/api', 'ftp://nas/api', ''])
			expect(splitBase(base)).toBeNull()
	})
})

describe('what is a secret', () => {
	it('is every name the core refuses as a fixed text', () => {
		for (const name of ['Authorization', 'X-API-Key', 'api_token', 'client_secret', 'PASSWORD'])
			expect(isSecretName(name)).toBe(true)
		for (const name of ['Accept', 'limit', 'X-Requested-With'])
			expect(isSecretName(name)).toBe(false)
	})

	it('gets an id made of its name: a-z0-9_, a letter first, 32 characters at most, never one that is taken', () => {
		expect(inputIdOf('X-API-Key', [])).toBe('x_api_key')
		expect(inputIdOf('X-API-Key', ['x_api_key'])).toBe('x_api_key_2')
		expect(inputIdOf('X-API-Key', ['x_api_key', 'x_api_key_2'])).toBe('x_api_key_3')
		expect(inputIdOf('2fa', [])).toBe('in_2fa')
		expect(inputIdOf('été', [])).toBe('t')
		expect(inputIdOf('!!', [])).toBe('input')
		expect(inputIdOf('a'.repeat(60), [])).toMatch(/^[a-z][a-z0-9_]{0,31}$/)
	})
})

describe('a recipe and the form that edits it', () => {
	it('come back as they went, key for key', () => {
		expect(recipeOf(formOf(immich))).toEqual(immich)
		expect(Object.keys(recipeOf(formOf(immich)))).toEqual(Object.keys(immich))
	})

	it('keeps a row on the root array: each is "", and it is written', () => {
		const recipe = recipeOf({ ...formOf(null), name: 'List', path: '/', rows: [listRow([])] })
		expect(recipe.rows[0]).toMatchObject({ each: '', limit: 5 })
		expect(JSON.parse(exportRecipe({ recipe })).rows[0].each).toBe('')
	})

	it('survives anything that is not a recipe', () => {
		for (const junk of [null, 7, 'x', [], { rows: 'x', query: [1], headers: null, inputs: {}, basic: 3, status: 'x', name: {} }])
			expect(() => recipeOf(formOf(junk))).not.toThrow()
		expect(formOf({ rows: [null, 3, { label: 4, rules: [null, { op: 'eq', to: null }] }] }).rows).toHaveLength(1)
	})

	it('makes an input of a header or a parameter marked secret, and of a name the core takes for a secret', () => {
		const form = formOf(null)
		form.name = 'x'
		form.path = '/x'
		form.headers = [{ name: 'X-Thing', value: 'typed-secret', secret: true, input: '', label: '' }, { name: 'Accept', value: 'application/json', secret: false, input: '', label: '' }]
		form.query = [{ name: 'apikey', value: 'k-123', secret: false, input: '', label: '' }, { name: '', value: 'ignored', secret: false, input: '', label: '' }]
		const recipe = recipeOf(form)
		expect(recipe.headers).toEqual({ 'X-Thing': { input: 'x_thing' }, 'Accept': 'application/json' })
		expect(recipe.query).toEqual({ apikey: { input: 'apikey' } })
		expect(recipe.inputs).toEqual([{ id: 'x_thing', label: 'X-Thing' }, { id: 'apikey', label: 'apikey' }])
		expect(secretsOf(form)).toEqual({ x_thing: 'typed-secret', apikey: 'k-123' })
		expect(JSON.stringify(recipe)).not.toMatch(/typed-secret|k-123/)
	})

	it('has only the inputs that a place uses', () => {
		const form = formOf(immich)
		form.headers = form.headers.filter(pair => pair.name !== 'x-api-key')
		form.basicOn = false
		expect(recipeOf(form).inputs).toEqual([{ id: 'tok', label: 'Token' }])
		expect(recipeOf(form).basic).toBeUndefined()
	})

	it('leaves a unit to the formats that show one, a bar to the shares, and a limit to a list', () => {
		const form = formOf(immich)
		form.rows[0].format = 'bytes'
		form.rows[1].format = 'number'
		const [first, second] = recipeOf(form).rows
		expect(first.unit).toBeUndefined()
		expect(second.bar).toBeUndefined()
		expect(second.limit).toBeUndefined()
	})

	it('keeps the value a rule compares to as it was read, and reads a typed one: a number, true, false, null, or a text', () => {
		const form = formOf({ rows: [{ label: 'a', value: '/a', rules: [{ op: 'eq', to: '200', level: 'ok' }] }] })
		expect(recipeOf(form).rows[0].rules[0].to).toBe('200')
		expect(['200', ' -1.5 ', 'true', 'false', 'null', 'UP', '', '1e3x'].map(ruleTo)).toEqual([200, -1.5, true, false, null, 'UP', '', '1e3x'])
	})
})

describe('what makes the request', () => {
	const sign = (form, base = 'http://nas', insecure = false) => requestOf(form, base, insecure)

	it('is the same after a change of a name, a label, a format, a rule, the layout or the refresh', () => {
		const form = formOf(immich)
		const before = sign(form)
		form.name = 'Other'
		form.layout = 'rows'
		form.refresh = 60
		form.rows[0].label = 'Pictures'
		form.rows[0].format = 'text'
		form.rows.pop()
		form.status = null
		expect(sign(form)).toBe(before)
	})

	it('is another after a change of the address, the certificate, the path, a parameter, a header or basic', () => {
		const before = sign(formOf(immich))
		const changed = (change) => {
			const form = formOf(immich)
			change(form)
			return sign(form)
		}
		expect(sign(formOf(immich), 'http://other')).not.toBe(before)
		expect(sign(formOf(immich), 'http://nas', true)).not.toBe(before)
		expect(changed(form => form.path = '/api/other')).not.toBe(before)
		expect(changed(form => form.query[0].value = '6')).not.toBe(before)
		expect(changed(form => form.headers[1].name = 'X-Accept')).not.toBe(before)
		expect(changed(form => form.headers[1].secret = true)).not.toBe(before)
		// a name the core takes for a secret stays one, whatever the box says
		expect(changed(form => form.headers[0].secret = false)).toBe(before)
		expect(changed(form => form.basicUser.value = 'root')).not.toBe(before)
		expect(changed(form => form.basicOn = false)).not.toBe(before)
	})

	it('does not hold a typed secret', () => {
		const form = formOf(immich)
		const before = sign(form)
		form.headers[0].value = 'typed-secret'
		expect(sign(form)).toBe(before)
	})
})

describe('the rows a click makes', () => {
	it('names a simple row after its key and guesses its format', () => {
		expect(leafRow(['stats', 'photos'], 12)).toMatchObject({ list: false, label: 'photos', value: '/stats/photos', format: 'number' })
		expect(leafRow(['items', 0, 'published_at'], '2026-11-27T10:00:00Z')).toMatchObject({ label: 'published_at', value: '/items/0/published_at', format: 'date' })
		expect(leafRow(['a'], '2026-11-27')).toMatchObject({ format: 'date' })
		expect(leafRow(['a'], 'hello 2026')).toMatchObject({ format: 'text' })
		expect(leafRow(['a'], true)).toMatchObject({ format: 'text' })
		expect(leafRow([], 'up')).toMatchObject({ label: 'Value', value: '' })
		expect(leafRow(['k'.repeat(60)], 1).label).toHaveLength(40)
	})

	it('counts an array, or makes one row per item', () => {
		expect(countRow(['data', 'items'])).toMatchObject({ list: false, label: 'items', value: '/data/items', format: 'count' })
		expect(listRow(['data', 'items'])).toMatchObject({ list: true, each: '/data/items', label: '', value: '', limit: 5 })
	})
})

describe('the export of a recipe', () => {
	const view = { id: 'ab12cd34', base: 'http://192.168.1.10:2283', insecure_tls: true, recipe: immich, inputs_set: { api_key: true }, error: '' }

	it('is the recipe alone, as indented JSON: no address, no certificate setting, no secret', () => {
		const text = exportRecipe(view)
		expect(JSON.parse(text)).toEqual(immich)
		expect(text).toContain('\n  "name": "Immich"')
		expect(text).not.toMatch(/192\.168|insecure|inputs_set|ab12cd34/)
	})

	it('lists the fixed texts it holds: headers, parameters, the user of basic and the hint of the address', () => {
		expect(fixedTexts(immich)).toEqual([
			{ where: 'headers.Accept', value: 'application/json' },
			{ where: 'query.limit', value: '5' },
			{ where: 'basic.user', value: 'admin' },
			{ where: 'base_hint', value: 'http://IP:2283' },
		])
		expect(fixedTexts({ rows: [] })).toEqual([])
	})

	it('says all that is sent, a secret by its place only', () => {
		expect(sentParts(immich)).toEqual([
			{ where: 'headers.x-api-key', value: null },
			{ where: 'headers.Accept', value: 'application/json' },
			{ where: 'query.limit', value: '5' },
			{ where: 'query.api_token', value: null },
			{ where: 'basic.user', value: 'admin' },
			{ where: 'basic.password', value: null },
		])
	})

	it('names its file after the widget', () => {
		expect(fileName('Immich – été 2026!')).toBe('immich-ete-2026.recasaos-widget.json')
		expect(fileName('///')).toBe('widget.recasaos-widget.json')
		expect(fileName(undefined)).toBe('widget.recasaos-widget.json')
	})
})

describe('the import of a recipe', () => {
	it('reads a recipe of version 1', () => {
		expect(importRecipe(exportRecipe({ recipe: immich }))).toEqual(immich)
	})

	it('refuses what is over 16 KiB, what is not JSON, and what is not a recipe of version 1', () => {
		expect(() => importRecipe(JSON.stringify({ recasaos_widget: 1, name: 'é'.repeat(8200) }))).toThrow('This file is too large for a recipe: 16 KiB at most.')
		expect(() => importRecipe('{ not json')).toThrow('This file is not JSON.')
		for (const other of ['[]', 'null', '7', '{}', '{"recasaos_widget":2}', '{"recasaos_widget":"1"}'])
			expect(() => importRecipe(other)).toThrow('This file is not the recipe of an API widget.')
	})
})
