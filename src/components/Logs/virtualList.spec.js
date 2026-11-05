import { describe, expect, it } from 'vitest'
import { visibleRange } from './virtualList'

describe('visibleRange', () => {
	it('renders the rows on screen and the overscan around them', () => {
		// 220 px of 22 px rows from row 100: rows 100..109, 20 more each side
		expect(visibleRange(2200, 220, 22, 1000, 20)).toEqual({ start: 80, end: 130 })
	})

	it('stops at both ends', () => {
		expect(visibleRange(0, 220, 22, 1000, 20)).toEqual({ start: 0, end: 30 })
		expect(visibleRange(22000, 220, 22, 1000, 20)).toEqual({ start: 970, end: 1000 })
	})

	it('shows the last rows when scrolled past a list that shrank', () => {
		expect(visibleRange(1000, 220, 22, 4, 20)).toEqual({ start: 0, end: 4 })
		expect(visibleRange(0, 220, 22, 0, 20)).toEqual({ start: 0, end: 0 })
	})
})
