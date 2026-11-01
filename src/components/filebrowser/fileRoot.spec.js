import { describe, expect, it } from 'vitest'
import { fileRootFrom, homeFolders, withTimeout } from './fileRoot.js'

describe('fileRootFrom', () => {
	it('returns /DATA when roots is missing, not an array, or empty', () => {
		expect(fileRootFrom()).toBe('/DATA')
		expect(fileRootFrom(null)).toBe('/DATA')
		expect(fileRootFrom({})).toBe('/DATA')
		expect(fileRootFrom([])).toBe('/DATA')
	})

	it('returns only the first root; later ManagementRoots stay unused', () => {
		expect(fileRootFrom(['/tmp/data'])).toBe('/tmp/data')
		expect(fileRootFrom(['/a', '/b'])).toBe('/a')
	})
})

describe('withTimeout', () => {
	it('rejects when the promise does not settle', async () => {
		await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrow('timeout')
	})

	it('resolves when the promise wins', async () => {
		await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1)
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
