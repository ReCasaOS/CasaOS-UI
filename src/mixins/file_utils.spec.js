import { describe, expect, it } from 'vitest'
import { filterHiddenFiles, renderSize, sortFiles } from './file_utils'

describe('renderSize', () => {
	it.each([
		[0, '0 Bytes'],
		[10, '10 Bytes'],
		[1024, '1 KB'],
		[1800, '1.76 KB'],
		[1024 ** 2, '1 MB'],
		[1024 ** 3, '1 GB'],
		[2.5 * 1024 ** 3, '2.5 GB'],
		[1024 ** 4, '1 TB'],
		[1024 ** 5, '1 PB'],
		[2 * 1024 ** 5, '2 PB'],
		[1024 ** 6, '1 EB'],
	])('format %s bytes as %s', (bytes, formattedSize) => {
		expect(renderSize(bytes)).toEqual(formattedSize)
	})
})

describe('filterHiddenFiles', () => {
	const files = [
		{ name: 'visible-file.txt' },
		{ name: '.hidden-file' },
		{ name: '.hidden-folder' },
		{ name: 'file.with-dot.txt' },
	]

	it('filters dot-prefixed files and folders when disabled', () => {
		expect(filterHiddenFiles(files, false)).toEqual([
			{ name: 'visible-file.txt' },
			{ name: 'file.with-dot.txt' },
		])
	})

	it('keeps dot-prefixed files and folders when enabled', () => {
		expect(filterHiddenFiles(files, true)).toBe(files)
	})
})

describe('sortFiles', () => {
	const files = [
		{ name: 'b10.txt', is_dir: false, size: 30, date: '2026-11-20T10:00:00Z' },
		{ name: 'Zeta', is_dir: true, size: 4096, date: '2026-11-01T10:00:00Z' },
		{ name: 'b2.jpg', is_dir: false, size: 10, date: '2026-11-22T10:00:00Z' },
		{ name: 'alpha', is_dir: true, size: 4096, date: '2026-11-23T10:00:00Z' },
		{ name: 'a.md', is_dir: false, size: 20, date: '2026-10-01T10:00:00Z' },
	]
	const names = list => list.map(f => f.name)

	it('puts folders first, then names in natural order', () => {
		expect(names(sortFiles(files, 'name', 'asc'))).toEqual(['alpha', 'Zeta', 'a.md', 'b2.jpg', 'b10.txt'])
		expect(names(sortFiles(files, 'name', 'desc'))).toEqual(['Zeta', 'alpha', 'b10.txt', 'b2.jpg', 'a.md'])
	})

	it('sorts by date modified, newest first in desc', () => {
		expect(names(sortFiles(files, 'date', 'desc'))).toEqual(['alpha', 'Zeta', 'b2.jpg', 'b10.txt', 'a.md'])
		expect(names(sortFiles(files, 'date', 'asc'))).toEqual(['Zeta', 'alpha', 'a.md', 'b10.txt', 'b2.jpg'])
	})

	it('sorts files by size and type, folders by name', () => {
		expect(names(sortFiles(files, 'size', 'desc'))).toEqual(['alpha', 'Zeta', 'b10.txt', 'a.md', 'b2.jpg'])
		expect(names(sortFiles(files, 'format', 'asc'))).toEqual(['alpha', 'Zeta', 'b2.jpg', 'a.md', 'b10.txt'])
	})

	it('leaves the input untouched', () => {
		const copy = [...files]
		sortFiles(files, 'date', 'asc')
		expect(files).toEqual(copy)
	})
})
