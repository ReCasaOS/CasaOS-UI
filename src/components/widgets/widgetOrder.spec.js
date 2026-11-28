import { describe, expect, it } from 'vitest'
import { combineWidgetSettings, moveWidget, resetWidgetOrder, withAbsent } from './widgetOrder'

const shipped = [
	{ name: 'clock', show: true },
	{ name: 'cpu', show: true },
	{ name: 'disks', show: true },
	{ name: 'network', show: true },
]

describe('the widgets, as saved and as shipped', () => {
	it('keeps the order somebody saved', () => {
		const saved = [
			{ name: 'network', show: true },
			{ name: 'clock', show: false },
			{ name: 'disks', show: true },
			{ name: 'cpu', show: true },
		]
		expect(combineWidgetSettings(shipped, saved)).toEqual(saved)
	})

	it('adds a widget the saved list does not know at the end, as shipped', () => {
		const saved = [{ name: 'disks', show: false }, { name: 'clock', show: true }]
		const combined = combineWidgetSettings(shipped, saved)
		expect(combined.map(w => w.name)).toEqual(['disks', 'clock', 'cpu', 'network'])
		expect(combined[0].show).toBe(false)
	})

	it('drops a widget this dashboard no longer ships, and a name saved twice', () => {
		const saved = [{ name: 'weather', show: true }, { name: 'cpu', show: false }, { name: 'cpu', show: true }]
		expect(combineWidgetSettings(shipped, saved)).toEqual([
			{ name: 'cpu', show: false },
			{ name: 'clock', show: true },
			{ name: 'disks', show: true },
			{ name: 'network', show: true },
		])
	})

	it('starts from what is shipped when nothing usable was saved', () => {
		expect(combineWidgetSettings(shipped, '')).toEqual(shipped)
		expect(combineWidgetSettings(shipped, null)).toEqual(shipped)
		expect(combineWidgetSettings(shipped, [null, { show: true }])).toEqual(shipped)
	})
})

describe('moving a widget with the keyboard', () => {
	it('moves one place up or down', () => {
		expect(moveWidget(shipped, 0, 1).map(w => w.name)).toEqual(['cpu', 'clock', 'disks', 'network'])
		expect(moveWidget(shipped, 3, -1).map(w => w.name)).toEqual(['clock', 'cpu', 'network', 'disks'])
	})

	it('does nothing past either end, and leaves the list it was given alone', () => {
		expect(moveWidget(shipped, 0, -1)).toBe(shipped)
		expect(moveWidget(shipped, 3, 1)).toBe(shipped)
		moveWidget(shipped, 1, 1)
		expect(shipped.map(w => w.name)).toEqual(['clock', 'cpu', 'disks', 'network'])
	})
})

describe('putting the widgets back in the order they ship', () => {
	it('restores the shipped order and keeps what was hidden hidden', () => {
		const chosen = [
			{ name: 'network', show: true },
			{ name: 'clock', show: false },
			{ name: 'disks', show: true },
			{ name: 'cpu', show: true },
		]
		expect(resetWidgetOrder(chosen, shipped.map(w => w.name))).toEqual([
			{ name: 'clock', show: false },
			{ name: 'cpu', show: true },
			{ name: 'disks', show: true },
			{ name: 'network', show: true },
		])
		expect(chosen[0].name).toBe('network')
	})

	it('puts a name the dashboard does not ship at the end rather than losing it', () => {
		const list = [{ name: 'weather', show: true }, { name: 'disks', show: true }, { name: 'clock', show: true }]
		expect(resetWidgetOrder(list, ['clock', 'disks']).map(w => w.name)).toEqual(['clock', 'disks', 'weather'])
	})
})

describe('the cards of the modules among the widgets', () => {
	const withCard = [...shipped, { name: 'module:wake-on-lan', show: true }]

	it('adds a card that the saved list does not know at the end', () => {
		const saved = shipped.map(widget => ({ ...widget }))
		expect(combineWidgetSettings(withCard, saved).at(-1)).toEqual({ name: 'module:wake-on-lan', show: true })
	})

	it('keeps the place and the hidden state of a saved card while the list of cards does not have it yet', () => {
		const saved = [{ name: 'clock', show: true }, { name: 'module:wake-on-lan', show: false }, { name: 'cpu', show: true }]
		expect(combineWidgetSettings(shipped, saved).map(w => [w.name, w.show])).toEqual([['clock', true], ['module:wake-on-lan', false], ['cpu', true], ['disks', true], ['network', true]])
		// and the card keeps them when the list comes
		expect(combineWidgetSettings(withCard, combineWidgetSettings(shipped, saved)).map(w => w.name)).toEqual(['clock', 'module:wake-on-lan', 'cpu', 'disks', 'network'])
	})

	it('still drops what is not a widget nor a card, and a card saved twice', () => {
		const saved = [{ name: 'module:Bad Name', show: true }, { name: 'module:', show: true }, { name: 'modul:x', show: true }, { name: 5, show: true }, { name: 'module:a', show: true }, { name: 'module:a', show: false }]
		expect(combineWidgetSettings(shipped, saved).map(w => w.name)).toEqual(['module:a', 'clock', 'cpu', 'disks', 'network'])
	})

	it('puts back the saved cards that Settings did not list, where they were', () => {
		const full = [{ name: 'clock', show: true }, { name: 'module:gone', show: false }, { name: 'cpu', show: true }]
		expect(withAbsent([{ name: 'cpu', show: true }, { name: 'clock', show: true }], full, ['clock', 'cpu']).map(w => w.name)).toEqual(['cpu', 'module:gone', 'clock'])
		expect(withAbsent(full, full, ['clock', 'cpu'])).toEqual(full)
	})
})

describe('the API widgets among the widgets', () => {
	it('keeps the place and the hidden state of a saved API widget that the list does not have', () => {
		const saved = [{ name: 'clock', show: true }, { name: 'custom:ab12cd34', show: false }, { name: 'cpu', show: true }]
		expect(combineWidgetSettings(shipped, saved).map(w => [w.name, w.show])).toEqual([['clock', true], ['custom:ab12cd34', false], ['cpu', true], ['disks', true], ['network', true]])
	})

	it('adds a new API widget after the others, shown', () => {
		const saved = [...shipped.map(widget => ({ ...widget })), { name: 'module:wake-on-lan', show: true }]
		expect(combineWidgetSettings([...shipped, { name: 'custom:ab12cd34', show: true }], saved).at(-1)).toEqual({ name: 'custom:ab12cd34', show: true })
	})

	it('drops a key that is not the id of an API widget', () => {
		const saved = [{ name: 'custom:AB', show: true }, { name: 'custom:AB12CD34', show: true }, { name: 'custom:ab12cd345', show: true }, { name: 'custom:ab12-d34', show: true }, { name: 'custom:', show: true }, { name: 'xcustom:ab12cd34', show: true }]
		expect(combineWidgetSettings(shipped, saved).map(w => w.name)).toEqual(['clock', 'cpu', 'disks', 'network'])
	})
})
