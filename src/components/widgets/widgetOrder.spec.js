import { describe, expect, it } from 'vitest'
import { combineWidgetSettings, moveWidget, resetWidgetOrder } from './widgetOrder'

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
