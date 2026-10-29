import { describe, expect, it } from 'vitest'
import { fileRootFrom, homeFolders } from './fileRoot.js'

describe('fileRootFrom', () => {
	it('returns /DATA when roots is missing, not an array, or empty', () => {
		expect(fileRootFrom()).toBe('/DATA')
		expect(fileRootFrom(null)).toBe('/DATA')
		expect(fileRootFrom({})).toBe('/DATA')
		expect(fileRootFrom([])).toBe('/DATA')
	})

	it('returns the first root', () => {
		expect(fileRootFrom(['/tmp/data'])).toBe('/tmp/data')
		expect(fileRootFrom(['/a', '/b'])).toBe('/a')
	})
})

describe('homeFolders', () => {
	it('prefixes children with the given root', () => {
		const folders = homeFolders('/tmp/data')
		expect(folders[0].path).toBe('/tmp/data')
		expect(folders[0].name).toBe('data')
		expect(folders.map(f => f.path)).toEqual([
			'/tmp/data',
			'/tmp/data/Documents',
			'/tmp/data/Downloads',
			'/tmp/data/Gallery',
			'/tmp/data/Media',
		])
	})
})
