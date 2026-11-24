// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveSort, savedSort, sortApps } from './appSort'

const apps = [
	{ name: 'plex', title: { en_us: 'Plex' }, status: 'exited' },
	{ name: 'app10', title: { en_us: 'app10' }, status: 'running' },
	{ name: 'immich', title: { en_us: 'Immich' }, status: 'running' },
	{ name: 'app2', title: { en_us: 'App2' }, status: 'exited' },
	{ name: 'raw', status: 'running' },
]
const by = { title: app => app.title?.en_us || app.name, memory: { immich: 900, plex: 900, app2: 50 } }
const names = list => list.map(app => app.name)

afterEach(() => localStorage.clear())

describe('the app grid orders', () => {
	it('leaves the custom order as it is', () => {
		expect(sortApps(apps, 'custom', by)).toBe(apps)
	})

	it('sorts by the name shown, case and numbers read as a person would', () => {
		expect(names(sortApps(apps, 'name', by))).toEqual(['app2', 'app10', 'immich', 'plex', 'raw'])
		expect(names(sortApps(apps, 'name-desc', by))).toEqual(['raw', 'plex', 'immich', 'app10', 'app2'])
	})

	it('puts the hungriest first, ties and unknowns in the custom order', () => {
		expect(names(sortApps(apps, 'memory', by))).toEqual(['plex', 'immich', 'app2', 'app10', 'raw'])
	})

	it('puts the running apps first, each group in the custom order', () => {
		expect(names(sortApps(apps, 'status', by))).toEqual(['app10', 'immich', 'raw', 'plex', 'app2'])
	})

	it('does not touch the list it is given', () => {
		const before = names(apps)
		sortApps(apps, 'name', by)
		expect(names(apps)).toEqual(before)
	})
})

describe('the remembered order', () => {
	it('is custom until one is chosen, and an unknown value is custom', () => {
		expect(savedSort()).toBe('custom')
		saveSort('memory')
		expect(savedSort()).toBe('memory')
		localStorage.setItem('casaos-app-sort', 'bogus')
		expect(savedSort()).toBe('custom')
	})

	it('is custom when the browser refuses its storage', () => {
		const denied = () => {
			throw new Error('denied')
		}
		const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
		const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
		expect(savedSort()).toBe('custom')
		expect(() => saveSort('name')).not.toThrow()
		get.mockRestore()
		set.mockRestore()
	})
})
