import { describe, expect, it } from 'vitest'
import { MAX_KEY_LENGTH, MAX_LABELS, MAX_VALUE_BYTES, isReservedLabel, joinLabels, labelProblem, labelProblems, splitLabels } from './composeLabels'

describe('composeLabels rules', () => {
	it.each([
		['traefik.http.routers.my-app.rule', 'Host(`app.example.com`)'],
		['com.centurylinklabs.watchtower.enable', 'false'],
		['app.kubernetes.io/name', 'démo'],
		['empty', ''],
	])('accepts %s', (key, value) => {
		expect(labelProblem(key, value)).toBeNull()
	})

	it.each([
		['', 'x'],
		['my label', 'x'],
		['a=b', 'x'],
		['a:b', 'x'],
		['a$b', 'x'],
		['.a', 'x'],
		['a'.repeat(MAX_KEY_LENGTH + 1), 'x'],
		['a', 'v'.repeat(MAX_VALUE_BYTES + 1)],
		['a', 'two\nlines'],
		['a', 'nul\u0000'],
	])('refuses %j = %j', (key, value) => {
		expect(labelProblem(key, value)).not.toBeNull()
	})

	it('counts bytes, not characters, in a value', () => {
		expect(labelProblem('a', 'é'.repeat(MAX_VALUE_BYTES / 2))).toBeNull()
		expect(labelProblem('a', 'é'.repeat(MAX_VALUE_BYTES / 2 + 1))).not.toBeNull()
	})

	it.each(['casaos', 'origin', 'icon', 'CasaOS', 'io.casaos.v1.app.store.id', 'com.docker.compose.project'])('refuses the system name %s', (key) => {
		expect(isReservedLabel(key)).toBe(true)
		expect(labelProblem(key, 'x').text).toMatch(/set by the system/)
	})

	it('does not reserve the other docker namespaces', () => {
		expect(isReservedLabel('com.docker.desktop')).toBe(false)
		expect(isReservedLabel('traefik.enable')).toBe(false)
	})
})

describe('composeLabels problems of a form', () => {
	it('says nothing of empty rows and good rows', () => {
		expect(labelProblems([{ container: '', host: '' }, { container: 'a', host: '1' }])).toEqual([])
	})

	it('leaves alone what the file had when it was opened, however odd', () => {
		const known = { 'legacy key': 'x', 'origin': 'custom' }
		expect(labelProblems([{ container: 'legacy key', host: 'x' }, { container: 'origin', host: 'custom' }], known)).toEqual([])
		expect(labelProblems([{ container: 'origin', host: 'system' }], known)).toHaveLength(1)
	})

	it('refuses a name used twice, and too many', () => {
		expect(labelProblems([{ container: 'a', host: '1' }, { container: 'a', host: '2' }])[0].text).toMatch(/used twice/)
		const rows = Array.from({ length: MAX_LABELS + 1 }, (_, i) => ({ container: `k${i}`, host: 'v' }))
		expect(labelProblems(rows).at(-1).text).toMatch(/At most/)
		expect(labelProblems(rows.slice(0, MAX_LABELS))).toEqual([])
		const known = Object.fromEntries(rows.map(row => [row.container, row.host]))
		expect(labelProblems(rows, known)).toEqual([])
	})
})

describe('composeLabels reading and writing', () => {
	it('reads the list form, keeping quotes and equal signs in a value', () => {
		const { rows } = splitLabels(['traefik.http.routers.a.rule=Host(`a.lan`) && Path("/x")', 'k=a=b', 'bare'])
		expect(rows).toEqual([
			{ container: 'traefik.http.routers.a.rule', host: 'Host(`a.lan`) && Path("/x")' },
			{ container: 'k', host: 'a=b' },
			{ container: 'bare', host: '' },
		])
	})

	it('reads the map form, whose values may be a boolean, a number or null', () => {
		const { rows } = splitLabels({ 'traefik.enable': true, 'weight': 3, 'nothing': null, 'text': 'x' })
		expect(rows).toEqual([
			{ container: 'traefik.enable', host: 'true' },
			{ container: 'weight', host: '3' },
			{ container: 'nothing', host: '' },
			{ container: 'text', host: 'x' },
		])
	})

	it('puts the keys the system sets aside and writes them back first', () => {
		const { rows, hidden } = splitLabels({ icon: 'http://x/i.png', casaos: 'casaos', mine: '1' })
		expect(rows).toEqual([{ container: 'mine', host: '1' }])
		expect(joinLabels(rows, hidden)).toEqual(['icon=http://x/i.png', 'casaos=casaos', 'mine=1'])
	})

	it('has nothing for no labels, and drops empty rows when writing', () => {
		expect(splitLabels(undefined)).toEqual({ rows: [], hidden: [] })
		expect(joinLabels([{ container: '', host: '' }, { container: 'a', host: '1' }])).toEqual(['a=1'])
	})
})
