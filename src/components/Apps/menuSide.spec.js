import { describe, expect, it } from 'vitest'
import { menuPlace } from './menuSide'

describe('menuPlace', () => {
	it('opens below, uncapped, when the menu fits', () => {
		expect(menuPlace(100, 500, 300)).toEqual({ side: 'bottom', maxHeight: null })
	})
	it('opens above, uncapped, when it only fits above', () => {
		expect(menuPlace(600, 200, 300)).toEqual({ side: 'top', maxHeight: null })
	})
	it('picks the side with more room and caps the height when it fits on neither', () => {
		expect(menuPlace(150, 250, 400)).toEqual({ side: 'bottom', maxHeight: 238 })
		expect(menuPlace(350, 150, 400)).toEqual({ side: 'top', maxHeight: 338 })
	})
	it('never caps below a usable height', () => {
		expect(menuPlace(40, 60, 400).maxHeight).toBe(120)
	})
})
