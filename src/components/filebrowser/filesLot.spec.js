import { describe, expect, it } from 'vitest'
import { fileBadge, typedPath } from './filesLot'

describe('a path typed in the path bar', () => {
	it('is opened as typed when absolute, cleaned of extra slashes', () => {
		expect(typedPath('/DATA/Media/', '/')).toBe('/DATA/Media')
		expect(typedPath('  //DATA//Media  ', '/')).toBe('/DATA/Media')
		expect(typedPath('/', '/DATA')).toBe('/')
	})

	it('is read from the folder shown when relative, . and .. included', () => {
		expect(typedPath('Movies', '/DATA/Media')).toBe('/DATA/Media/Movies')
		expect(typedPath('../Downloads', '/DATA/Media')).toBe('/DATA/Downloads')
		expect(typedPath('./a/../b', '/DATA')).toBe('/DATA/b')
		expect(typedPath('../../../..', '/DATA')).toBe('/')
	})

	it('is nothing when empty', () => {
		expect(typedPath('   ', '/DATA')).toBeNull()
		expect(typedPath('', '/DATA')).toBeNull()
	})
})

describe('a file icon\'s badge', () => {
	it('is the extension, upper case', () => {
		expect(fileBadge({ name: 'report.pdf', is_dir: false })).toBe('PDF')
		expect(fileBadge({ name: 'archive.tar.gz', is_dir: false })).toBe('GZ')
		expect(fileBadge({ name: 'notes.Md', is_dir: false })).toBe('MD')
	})

	it('is none for a folder, no extension, a dot file, or one too long to read', () => {
		expect(fileBadge({ name: 'Media', is_dir: true })).toBe('')
		expect(fileBadge({ name: 'Makefile', is_dir: false })).toBe('')
		expect(fileBadge({ name: '.bashrc', is_dir: false })).toBe('')
		expect(fileBadge({ name: 'file.', is_dir: false })).toBe('')
		expect(fileBadge({ name: 'page.webmanifest', is_dir: false })).toBe('')
		expect(fileBadge({ name: 'odd.e x', is_dir: false })).toBe('')
	})
})
