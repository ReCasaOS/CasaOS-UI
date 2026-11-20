import { describe, expect, it } from 'vitest'
import { crumbsOf, join, parentOf } from './containerPaths'

describe('paths inside a container', () => {
	it('cuts a path into the folders that open it', () => {
		expect(crumbsOf('/')).toEqual([{ name: '/', path: '/' }])
		expect(crumbsOf('/app/config')).toEqual([
			{ name: '/', path: '/' },
			{ name: 'app', path: '/app' },
			{ name: 'config', path: '/app/config' },
		])
	})

	it('joins a name to a folder and finds a parent', () => {
		expect(join('/', 'app')).toBe('/app')
		expect(join('/app', 'x.yml')).toBe('/app/x.yml')
		expect(parentOf('/app/config')).toBe('/app')
		expect(parentOf('/app')).toBe('/')
		expect(parentOf('/')).toBe('/')
	})
})
