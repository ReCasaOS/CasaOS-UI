import { describe, expect, it } from 'vitest'
import { liveFigures, liveTitle } from './liveBackup.js'

// what the owner's box said of seerr on 2026-11-09
const seerr = {
	id: 'b7',
	app: 'happy_rik',
	destination: 'GDrive',
	operation: 1,
	operations: 2,
	stats: { bytes: 1182844747, total_bytes: 1926565931, files: 9812, total_files: 25488, speed: 219371, eta: 3390, current: 'cache/a.jpg' },
}

describe('the figures of a backup that runs', () => {
	it('says how far it has got, out of what', () => {
		expect(liveFigures(seerr)).toEqual({
			percent: 61,
			bytes: 1182844747,
			totalBytes: 1926565931,
			files: 9812,
			totalFiles: 25488,
			speed: 219371,
			eta: 3390,
		})
	})

	it('has no percent while the total is still being taken stock of', () => {
		const { total_bytes: _, total_files: __, ...counting } = seerr.stats
		expect(liveFigures({ ...seerr, stats: counting }).percent).toBe(null)
	})

	it('has nothing but zeros before the engine has said anything', () => {
		expect(liveFigures({ ...seerr, stats: undefined })).toEqual({
			percent: null,
			bytes: 0,
			totalBytes: 0,
			files: 0,
			totalFiles: 0,
			speed: 0,
			eta: null,
		})
	})
})

describe('the name of what a backup copies', () => {
	const t = key => `t:${key}`

	it('is the box for the box, the app title otherwise', () => {
		expect(liveTitle('casaos-system', () => 'nope', t)).toBe('t:This box')
		expect(liveTitle('happy_rik', name => (name === 'happy_rik' ? 'seerr' : name), t)).toBe('seerr')
	})
})
