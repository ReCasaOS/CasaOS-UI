import { describe, expect, it } from 'vitest'
import { HOSTILE } from './__fixtures__/contract'
import { alertMessage, createAlertFeed } from './resourceAlerts'
import { clean } from '@/components/settings/osPlan'

const firing = (over = {}) => ({ item: 'app:immich', name: 'Immich / server', kind: 'app-container', situation: 'cpu_high', value: '93', minutes: '10', since: '2026-10-20T10:00:00Z', source: 'app_management', ...over })

function feedAt() {
	const clock = { t: 1000000 }
	const feed = createAlertFeed({ now: () => clock.t })
	return { feed, clock }
}

describe('createAlertFeed: what a firing event says', () => {
	it.each([
		['value and date', {}, 'Processor of {name} at {value} % since {since}', { name: 'Immich / server', value: 93, since: '2026-10-20T10:00:00Z' }],
		['value only', { since: undefined }, 'Processor of {name} at {value} %', { name: 'Immich / server', value: 93 }],
		['value only, date garbage', { since: 'garbage' }, 'Processor of {name} at {value} %', { name: 'Immich / server', value: 93 }],
		['date only, value NaN', { value: 'NaN' }, 'Processor of {name} high since {since}', { name: 'Immich / server', since: '2026-10-20T10:00:00Z' }],
		['date only, value empty', { value: '' }, 'Processor of {name} high since {since}', { name: 'Immich / server', since: '2026-10-20T10:00:00Z' }],
		['neither', { value: 'Infinity', since: '' }, 'Processor of {name} is high', { name: 'Immich / server' }],
		['memory, both', { situation: 'mem_high', value: '93.4' }, 'Memory of {name} at {value} % since {since}', { name: 'Immich / server', value: 93, since: '2026-10-20T10:00:00Z' }],
		['memory, neither', { situation: 'mem_high', value: undefined, since: undefined }, 'Memory of {name} is high', { name: 'Immich / server' }],
		['a crash', { situation: 'vm_crashed', kind: 'vm', value: undefined }, 'The virtual machine {name} crashed', { name: 'Immich / server' }],
	])('%s', (_, over, key, params) => {
		const got = createAlertFeed().accept('firing', firing(over))
		expect(got).toMatchObject({ kind: 'firing', item: 'app:immich', text: { key, params }, open: { item: 'app:immich' } })
	})

	it.each([
		['-5'],
		['1e300'],
		['abc'],
		[' '],
		[null],
		[{}],
	])('an odd value %j is left out of the sentence', (value) => {
		const got = createAlertFeed().accept('firing', firing({ value }))
		expect(got.text.key).toBe('Processor of {name} high since {since}')
		expect(got.text.params).not.toHaveProperty('value')
	})

	it('a value is rounded to a whole percent and 0 is a value', () => {
		expect(createAlertFeed().accept('firing', firing({ value: '0' })).text.params.value).toBe(0)
		expect(createAlertFeed().accept('firing', firing({ value: '92.6' })).text.params.value).toBe(93)
	})

	it.each([['x'], [''], [undefined], ['__proto__'], ['cpu_low']])('an unknown situation %j gives null', (situation) => {
		expect(createAlertFeed().accept('firing', firing({ situation }))).toBeNull()
	})

	it.each([['bogus'], [undefined]])('an unknown state %j gives null', (state) => {
		expect(createAlertFeed().accept(state, firing())).toBeNull()
	})

	it.each([[undefined], [null], ['']])('properties %j give null and do not throw', (props) => {
		expect(createAlertFeed().accept('firing', props)).toBeNull()
	})

	it('an item that is not a string, empty or too long gives null', () => {
		const feed = createAlertFeed()
		expect(feed.accept('firing', firing({ item: 42 }))).toBeNull()
		expect(feed.accept('firing', firing({ item: '' }))).toBeNull()
		expect(feed.accept('firing', firing({ item: 'x'.repeat(301) }))).toBeNull()
		expect(feed.accept('firing', firing({ item: 'x'.repeat(300) }))).not.toBeNull()
	})

	it('an unknown kind gives null', () => {
		expect(createAlertFeed().accept('firing', firing({ kind: 'toaster' }))).toBeNull()
		expect(createAlertFeed().accept('firing', firing({ kind: undefined }))).toBeNull()
	})

	it('a hostile name is cleaned, cut and still text', () => {
		const name = `${HOSTILE}\n\u0007${'y'.repeat(200)}`
		const got = createAlertFeed().accept('firing', firing({ name }))
		expect(typeof got.text.params.name).toBe('string')
		expect(got.text.params.name).toBe(clean(name, 80))
		expect(got.text.params.name.length).toBeLessThanOrEqual(80)
		expect([...got.text.params.name].some(c => c.charCodeAt(0) < 32)).toBe(false)
	})

	it('a missing name falls back to the item', () => {
		expect(createAlertFeed().accept('firing', firing({ name: undefined })).text.params.name).toBe('app:immich')
	})
})

describe('createAlertFeed: dedupe, flood and resolved', () => {
	it('the same item, situation and state within the window is accepted once, and again after it', () => {
		const { feed, clock } = feedAt()
		expect(feed.accept('firing', firing())).not.toBeNull()
		clock.t += 59999
		expect(feed.accept('firing', firing())).toBeNull()
		clock.t += 2
		expect(feed.accept('firing', firing())).not.toBeNull()
	})

	it('six distinct events in the window: the sixth is dropped, not queued', () => {
		const { feed, clock } = feedAt()
		const got = [1, 2, 3, 4, 5, 6].map(n => feed.accept('firing', firing({ item: `c${n}` })))
		expect(got.slice(0, 5).every(Boolean)).toBe(true)
		expect(got[5]).toBeNull()
		clock.t += 60001
		expect(feed.accept('firing', firing({ item: 'c7' }))).not.toBeNull()
		// the dropped one was never remembered, so it is accepted when it comes again
		expect(feed.accept('firing', firing({ item: 'c6' }))).not.toBeNull()
	})

	it('a resolved with no firing seen is null; with one it is accepted once, then null again', () => {
		const { feed, clock } = feedAt()
		expect(feed.accept('resolved', firing({ value: undefined }))).toBeNull()
		feed.accept('firing', firing())
		clock.t += 70000
		const got = feed.accept('resolved', firing({ value: '12' }))
		expect(got).toMatchObject({ kind: 'resolved', text: { key: 'Processor of {name} is back to normal' } })
		expect(got.text.params).not.toHaveProperty('value')
		clock.t += 70000
		expect(feed.accept('resolved', firing())).toBeNull()
	})

	it('a firing the flood dropped does not let its resolved through', () => {
		const { feed } = feedAt()
		for (let n = 1; n <= 5; n++) {
			feed.accept('firing', firing({ item: `c${n}` }))
		}
		expect(feed.accept('firing', firing({ item: 'late' }))).toBeNull()
		expect(feed.accept('resolved', firing({ item: 'late' }))).toBeNull()
	})

	it('the three resolved sentences', () => {
		const { feed, clock } = feedAt()
		const keys = []
		for (const situation of ['cpu_high', 'mem_high', 'vm_crashed']) {
			feed.accept('firing', firing({ situation }))
			clock.t += 70000
			keys.push(feed.accept('resolved', firing({ situation })).text.key)
			clock.t += 70000
		}
		expect(keys).toEqual(['Processor of {name} is back to normal', 'Memory of {name} is back to normal', 'The virtual machine {name} is running again'])
	})

	it('ids differ between notifications', () => {
		const { feed } = feedAt()
		expect(feed.accept('firing', firing({ item: 'a' })).id).not.toBe(feed.accept('firing', firing({ item: 'b' })).id)
	})
})

describe('alertMessage', () => {
	const t = (key, params) => key.replace(/\{(\w+)\}/g, (_, k) => params[k])

	it('writes the sentence and dates with formatDateTime', () => {
		const got = createAlertFeed().accept('firing', firing())
		expect(alertMessage(got.text, t, 'en')).toMatch(/^Processor of Immich \/ server at 93 % since .*2026/)
	})

	it('a hostile name stays a string', () => {
		const got = createAlertFeed().accept('firing', firing({ name: HOSTILE }))
		expect(typeof alertMessage(got.text, t, 'en')).toBe('string')
	})
})
