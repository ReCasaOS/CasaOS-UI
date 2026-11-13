import { describe, expect, it } from 'vitest'
import { menuSide } from './menuSide'

describe('menuSide', () => {
	it('opens below when the menu fits', () => {
		expect(menuSide(100, 500, 300)).toBe('bottom')
	})
	it('opens above when it does not fit below but fits above', () => {
		expect(menuSide(600, 200, 300)).toBe('top')
	})
	it('picks the side with more room when it fits on neither', () => {
		expect(menuSide(150, 250, 400)).toBe('bottom')
		expect(menuSide(350, 150, 400)).toBe('top')
	})
})
