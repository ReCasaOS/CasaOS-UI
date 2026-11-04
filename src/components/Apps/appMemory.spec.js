import { describe, expect, it } from 'vitest'
import { memoryByApp } from './appMemory'

const entry = (id, app, memory_used, kind = 'app-container') => ({ id, kind, app, name: 'app', state: 'running', memory_used })

describe('memoryByApp', () => {
	it('adds up the containers of an app, one entry per app', () => {
		const memory = memoryByApp({ items: [entry('a:1', 'nextcloud', 600), entry('a:2', 'nextcloud', 500), entry('b:1', 'jellyfin', 640)] })

		expect(memory).toEqual({ nextcloud: 1100, jellyfin: 640 })
	})

	it('leaves out what is not an app container, a container at rest, and what the box answers badly', () => {
		expect(memoryByApp({ items: [entry('v', 'vm1', 900, 'vm'), entry('c:1', 'idle', 0)] })).toEqual({})
		expect(memoryByApp(null)).toEqual({})
		expect(memoryByApp({ items: 'x' })).toEqual({})
	})
})
