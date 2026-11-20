import { describe, expect, it } from 'vitest'
import { newerBadgeOf, newerVersionsOf, repoOf } from './newerTags'

const FOUND = [
	{ service: 'db', image: 'postgres:16.2', current: '16.2', minor: '16.4', major: '17.0' },
	{ service: 'app', image: 'nextcloud:29.0.1', current: '29.0.1', patch: '29.0.7' },
]

describe('newerVersionsOf', () => {
	it('lists the versions of one service, smallest change first', () => {
		expect(newerVersionsOf(FOUND, 'db')).toEqual([
			{ level: 'minor', label: 'Minor version', tag: '16.4' },
			{ level: 'major', label: 'Major version', tag: '17.0' },
		])
		expect(newerVersionsOf(FOUND, 'app').map(version => version.tag)).toEqual(['29.0.7'])
	})

	it('has nothing for a service, or an app, the box found nothing for', () => {
		expect(newerVersionsOf(FOUND, 'redis')).toEqual([])
		expect(newerVersionsOf(undefined, 'db')).toEqual([])
	})
})

describe('newerBadgeOf', () => {
	it('says the smallest change found, with its image', () => {
		expect(newerBadgeOf(FOUND)).toEqual({ image: 'nextcloud:29.0.1', current: '29.0.1', tag: '29.0.7', level: 'patch' })
		expect(newerBadgeOf([FOUND[0]])).toEqual({ image: 'postgres:16.2', current: '16.2', tag: '16.4', level: 'minor' })
	})

	it('puts no major version alone on the card', () => {
		expect(newerBadgeOf([{ service: 'db', image: 'postgres:16.2', current: '16.2', major: '17.0' }])).toBeNull()
	})

	it('says nothing when nothing was found', () => {
		expect(newerBadgeOf([])).toBeNull()
		expect(newerBadgeOf(undefined)).toBeNull()
	})
})

describe('repoOf', () => {
	it('drops the tag, and keeps a registry port', () => {
		expect(repoOf('postgres:16.2')).toBe('postgres')
		expect(repoOf('registry.local:5000/team/app:1.2')).toBe('registry.local:5000/team/app')
		expect(repoOf('registry.local:5000/team/app')).toBe('registry.local:5000/team/app')
	})
})
