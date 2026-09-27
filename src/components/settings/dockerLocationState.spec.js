import { describe, expect, it } from 'vitest'
import { copyPercent, locationLabel, moving } from './dockerLocationState'

describe('the Docker data move', () => {
	it('is under way in its middle phases only', () => {
		expect(moving({ phase: 'copying' })).toBe(true)
		expect(moving({ phase: 'done' })).toBe(false)
		expect(moving({ phase: 'failed' })).toBe(false)
		expect(moving({ phase: 'idle' })).toBe(false)
		expect(moving(null)).toBe(false)
	})

	it('says how far the copy is, never past 100', () => {
		expect(copyPercent({ total_bytes: 200, copied_bytes: 50 })).toBe(25)
		expect(copyPercent({ total_bytes: 200, copied_bytes: 210 })).toBe(100)
		expect(copyPercent({ total_bytes: 200 })).toBeNull()
	})

	it('names the default place', () => {
		expect(locationLabel({ location: '' })).toBe('/var/lib/docker')
		expect(locationLabel({ location: '/media/Big' })).toBe('/media/Big')
	})
})
