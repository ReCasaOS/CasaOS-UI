import { describe, expect, it } from 'vitest'
import { CARD_ICONS, CARD_ICON_FALLBACK, CARD_TEXT, MODULE_CARD_KEYS, actionNote, cardList, cardView } from './moduleCards.js'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import pt from '@/assets/lang/pt_BR.json'

const ROUTE = '/v1/wake_on_lan'

const action = (extra = {}) => ({ label: 'Wake', method: 'POST', path: '/wake', ...extra })
function full() {
	return {
		schema: 1,
		title: 'Wake-on-LAN',
		icon: 'network-outline',
		status: { level: 'ok', text: '3 machines' },
		rows: [
			{ label: 'NAS', value: 'asleep', level: 'warning', action: action({ body: { mac: 'aa:bb' }, confirm: 'Wake the NAS?' }) },
			{ label: 'Desktop' },
		],
		actions: [action(), action({ label: 'Wake all', path: '/wake-all' })],
		link: { label: 'Open', path: '/ui' },
		refresh: 120,
	}
}

describe('the list of the cards', () => {
	const entry = { name: 'wake-on-lan', title: 'Wake-on-LAN', route: ROUTE }

	it('reads each module that has a card', () => {
		expect(cardList({ modules: [entry, { ...entry, name: 'two', route: '/v1/two', foreign: true, repository: 'inkly/recasaos-two' }] })).toEqual([
			{ name: 'wake-on-lan', title: 'Wake-on-LAN', route: ROUTE, foreign: false, owner: '' },
			{ name: 'two', title: 'Wake-on-LAN', route: '/v1/two', foreign: true, owner: 'inkly' },
		])
	})

	it.each([null, undefined, 'x', 5, [], {}, { modules: null }, { modules: 'x' }])('gives nothing for %j', (raw) => {
		expect(cardList(raw)).toEqual([])
	})

	it('drops an entry that is not a module of a valid name and route, and keeps the others', () => {
		const bad = [null, 'x', {}, { ...entry, name: 'Wake' }, { ...entry, name: 5 }, { ...entry, route: 'https://evil.example/v1/x' }, { ...entry, route: '/v1/x/y' }, { ...entry, route: '//evil.example' }, { ...entry, route: undefined }, { ...entry, route: '/v1/../x' }]
		expect(cardList({ modules: [...bad, entry] }).map(item => item.name)).toEqual(['wake-on-lan'])
	})

	it('cleans the title and cuts it to 80', () => {
		expect(cardList({ modules: [{ ...entry, title: 'A‮B\u0000C' }] })[0].title).toBe('A B C')
		expect(cardList({ modules: [{ ...entry, title: 'x'.repeat(500) }] })[0].title).toHaveLength(80)
	})

	it('names an owner only from a repository that is well written, as the list of the modules does', () => {
		const owner = repository => cardList({ modules: [{ ...entry, foreign: true, repository }] })[0].owner
		expect(owner('inkly/recasaos-wake')).toBe('inkly')
		for (const repository of ['inkly', 'a/b/c', '-a/b', 'a/../b', '<b>x</b>/y', '', 5, null, `${'a'.repeat(40)}/x`])
			expect(owner(repository)).toBe('')
	})

	it('keeps a module once, and a bounded number of them', () => {
		expect(cardList({ modules: [entry, entry] })).toHaveLength(1)
		const many = Array.from({ length: 100 }, (_, i) => ({ name: `m${i}`, title: 'm', route: `/v1/m${i}` }))
		expect(cardList({ modules: many }).length).toBeLessThanOrEqual(32)
	})
})

describe('the description of a card', () => {
	it('reads a full valid description, with the paths already joined to the route', () => {
		const view = cardView(full(), ROUTE)
		expect(view).toEqual({
			title: 'Wake-on-LAN',
			icon: 'network-outline',
			status: { level: 'ok', text: '3 machines' },
			rows: [
				{ label: 'NAS', value: 'asleep', level: 'warning', action: { label: 'Wake', url: `${ROUTE}/wake`, body: { mac: 'aa:bb' }, confirm: 'Wake the NAS?' } },
				{ label: 'Desktop', value: '', level: '', action: null },
			],
			actions: [
				{ label: 'Wake', url: `${ROUTE}/wake`, body: {}, confirm: '' },
				{ label: 'Wake all', url: `${ROUTE}/wake-all`, body: {}, confirm: '' },
			],
			link: { label: 'Open', url: `${ROUTE}/ui` },
			refresh: 120,
		})
	})

	it('reads the least a card can say', () => {
		expect(cardView({ schema: 1, title: 'T' }, ROUTE)).toEqual({ title: 'T', icon: CARD_ICON_FALLBACK, status: null, rows: [], actions: [], link: null, refresh: 60 })
	})

	it('does not change what it was given', () => {
		const raw = full()
		const copy = JSON.stringify(raw)
		cardView(raw, ROUTE)
		expect(JSON.stringify(raw)).toBe(copy)
	})

	// ---- what refuses the whole card
	const set = (key, value) => raw => Object.assign(raw, { [key]: value })
	const refused = (mutate, route = ROUTE) => {
		const raw = full()
		mutate(raw)
		return cardView(raw, route)
	}

	it.each([null, undefined, 'x', 5, [], true])('refuses %j', (raw) => {
		expect(cardView(raw, ROUTE)).toBeNull()
	})

	it('refuses a route that is not a module route', () => {
		for (const route of ['', undefined, 'https://evil.example', '/v1/', '/v1/a/b', '//x'])
			expect(cardView(full(), route)).toBeNull()
	})

	it.each([0, 2, '1', null, undefined, 1.5])('refuses the schema %j', (schema) => {
		expect(refused(raw => Object.assign(raw, { schema }))).toBeNull()
	})

	it('refuses any field that it does not know, at every level', () => {
		expect(refused(raw => Object.assign(raw, { html: '<b>x</b>' }))).toBeNull()
		expect(refused(raw => Object.assign(raw.status, { extra: 1 }))).toBeNull()
		expect(refused(raw => Object.assign(raw.rows[0], { extra: 1 }))).toBeNull()
		expect(refused(raw => Object.assign(raw.rows[0].action, { extra: 1 }))).toBeNull()
		expect(refused(raw => Object.assign(raw.actions[0], { url: 'https://evil.example' }))).toBeNull()
		expect(refused(raw => Object.assign(raw.link, { target: '_self' }))).toBeNull()
		expect(refused(raw => Object.assign(raw, { constructor: 1 }))).toBeNull()
	})

	it('refuses a title that is missing, not text, empty or too long', () => {
		for (const title of [undefined, 5, '', '   ', '\u0000‮', 'x'.repeat(41)])
			expect(refused(raw => Object.assign(raw, { title })), String(title)).toBeNull()
		expect(refused(raw => Object.assign(raw, { title: 'x'.repeat(40) }))).not.toBeNull()
	})

	it('falls back to a neutral icon, for an icon that is unknown, absent or not text, and does not refuse the card', () => {
		for (const icon of ['evil-outline', '', 5, null, '"><script>', '__proto__'])
			expect(refused(raw => Object.assign(raw, { icon })).icon, String(icon)).toBe(CARD_ICON_FALLBACK)
		expect(refused((raw) => {
			delete raw.icon
		}).icon).toBe(CARD_ICON_FALLBACK)
	})

	it('has a closed list of icons that includes the one of the network', () => {
		expect(CARD_ICONS).toContain('network-outline')
		expect(CARD_ICONS.length).toBeGreaterThanOrEqual(10)
		expect(CARD_ICONS.length).toBeLessThanOrEqual(20)
		expect(CARD_ICONS).not.toContain(CARD_ICON_FALLBACK)
		for (const icon of CARD_ICONS)
			expect(refused(raw => Object.assign(raw, { icon })).icon).toBe(icon)
	})

	it('refuses a status that is not an object, has an unknown level or a text that is not text or too long', () => {
		for (const status of ['x', 5, [], { level: 'fine', text: 'x' }, { level: 'ok' }, { level: 'ok', text: 5 }, { level: 'ok', text: 'x'.repeat(41) }, { text: 'x' }, { level: 'toString', text: 'x' }])
			expect(refused(raw => Object.assign(raw, { status })), JSON.stringify(status)).toBeNull()
		for (const level of ['ok', 'info', 'warning', 'danger'])
			expect(refused(raw => Object.assign(raw, { status: { level, text: 'x' } })).status.level).toBe(level)
	})

	it('refuses rows that are too many, not a list, or not objects', () => {
		expect(refused(set('rows', Array.from({ length: 9 }, () => ({ label: 'x' }))))).toBeNull()
		expect(refused(set('rows', Array.from({ length: 8 }, () => ({ label: 'x' })))).rows).toHaveLength(8)
		for (const rows of ['x', {}, 5, [null], ['x'], [[]]])
			expect(refused(raw => Object.assign(raw, { rows })), JSON.stringify(rows)).toBeNull()
	})

	it('refuses a row with no label, a label that is too long, a value that is too long or not text, or an unknown level', () => {
		for (const row of [{}, { label: '' }, { label: 5 }, { label: 'x'.repeat(41) }, { label: 'x', value: 5 }, { label: 'x', value: 'y'.repeat(41) }, { label: 'x', level: 'loud' }, { label: 'x', level: 5 }])
			expect(refused(raw => Object.assign(raw, { rows: [row] })), JSON.stringify(row)).toBeNull()
		expect(refused(set('rows', [{ label: 'x'.repeat(40), value: 'y'.repeat(40) }]))).not.toBeNull()
	})

	it('cleans the texts it keeps', () => {
		const view = refused(raw => Object.assign(raw, { rows: [{ label: 'a‮b', value: 'c d' }], status: { level: 'ok', text: 'e​f' } }))
		expect(view.rows[0]).toMatchObject({ label: 'a b', value: 'c d' })
		expect(view.status.text).toBe('e f')
	})

	it('refuses more than two actions, or a list that is not one', () => {
		expect(refused(raw => Object.assign(raw, { actions: [action(), action(), action()] }))).toBeNull()
		for (const actions of ['x', {}, 5, [null], ['x']])
			expect(refused(raw => Object.assign(raw, { actions })), JSON.stringify(actions)).toBeNull()
	})

	it('refuses an action with a label that is missing, empty or over 24, or a method other than POST', () => {
		for (const bad of [{ label: undefined }, { label: '' }, { label: 'x'.repeat(25) }, { label: 5 }, { method: 'GET' }, { method: 'post' }, { method: undefined }, { method: ['POST'] }])
			expect(refused(raw => Object.assign(raw, { actions: [action(bad)] })), JSON.stringify(bad)).toBeNull()
		expect(refused(set('actions', [action({ label: 'x'.repeat(24) })]))).not.toBeNull()
	})

	// every way a path can leave the route of the module
	const BAD_PATHS = ['wake', '', undefined, 5, null, '//evil.example/x', 'https://evil.example/x', '/../sys/reboot', '/a/../b', '/..', '/a//b', '/a?x=1', '/a#x', '/a\\b', '/a\nb', '/a\u0000', '/a\u007F', '/a\u0085', '/a%2e%2e/b', '/a%2E%2E/b', '/a%2fb', '/a%5Cb', `/${'a'.repeat(200)}`]

	it.each(BAD_PATHS)('refuses the path %j of an action, of a row and of the link', (path) => {
		expect(refused(set('actions', [action({ path })]))).toBeNull()
		expect(refused(set('rows', [{ label: 'x', action: action({ path }) }]))).toBeNull()
		expect(refused(raw => Object.assign(raw, { link: { label: 'x', path } }))).toBeNull()
	})

	it('takes a path of 200 characters, and joins it to the route as it is', () => {
		const path = `/${'a'.repeat(199)}`
		expect(refused(set('actions', [action({ path })])).actions[0].url).toBe(ROUTE + path)
	})

	it('refuses a body that is not a plain object or is over 1 KiB', () => {
		for (const body of ['x', 5, [], [1], null, true])
			expect(refused(set('actions', [action({ body })])), JSON.stringify(body)).toBeNull()
		expect(refused(set('actions', [action({ body: { pad: 'x'.repeat(1024) } })]))).toBeNull()
		expect(refused(set('actions', [action({ body: { pad: 'x'.repeat(900) } })]))).not.toBeNull()
	})

	it('refuses a confirmation that is not text, or over 120', () => {
		for (const confirm of [5, null, ['x'], 'x'.repeat(121)])
			expect(refused(set('actions', [action({ confirm })])), JSON.stringify(confirm)).toBeNull()
		expect(refused(set('actions', [action({ confirm: 'x'.repeat(120) })])).actions[0].confirm).toHaveLength(120)
	})

	it('refuses a link that is not an object, has no label or one over 24', () => {
		for (const link of ['x', 5, [], { path: '/ui' }, { label: '', path: '/ui' }, { label: 'x'.repeat(25), path: '/ui' }, { label: 'x' }])
			expect(refused(raw => Object.assign(raw, { link })), JSON.stringify(link)).toBeNull()
	})

	it('takes a refresh of 30 to 3600 seconds, and refuses any other', () => {
		for (const refresh of [30, 60, 3600])
			expect(refused(raw => Object.assign(raw, { refresh })).refresh).toBe(refresh)
		for (const refresh of [0, 29, 3601, 59.5, '60', null, Number.NaN, Infinity, -60])
			expect(refused(raw => Object.assign(raw, { refresh })), String(refresh)).toBeNull()
	})
})

describe('the answer of an action', () => {
	it('says the message, cleaned and cut to 120', () => {
		expect(actionNote({ message: 'Done' })).toBe('Done')
		expect(actionNote({ message: 'a‮b' })).toBe('a b')
		expect(actionNote({ message: 'x'.repeat(500) })).toHaveLength(120)
	})

	it.each([null, undefined, 'x', 5, [], {}, { message: 5 }, { message: null }, { message: ['x'] }])('says nothing of %j', (raw) => {
		expect(actionNote(raw)).toBe('')
	})
})

describe('the language files', () => {
	it('have each text once', () => {
		expect(new Set(MODULE_CARD_KEYS).size).toBe(MODULE_CARD_KEYS.length)
		for (const key of Object.values(CARD_TEXT))
			expect(MODULE_CARD_KEYS).toContain(key)
	})

	it.each(MODULE_CARD_KEYS)('say "%s" in English, French and Portuguese', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		expect(pt[key]).toBeTruthy()
		expect(pt[key]).not.toBe(key)
		expect(fr[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		expect(pt[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		// French sets a space before : ? ! ;
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(key.replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
	})

	it('says the owner of a module with a placeholder', () => {
		expect(CARD_TEXT.owner).toContain('{owner}')
	})
})
