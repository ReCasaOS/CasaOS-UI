import { describe, expect, it, vi } from 'vitest'
import { isNamedVolumeSource, normalizeVolume, resolveAppID } from './composeVolumes'

// stands in for volumeAutoCheck, which invents a host path for a bind the compose
// file leaves open
const suggest = (containerPath, hostPath) => hostPath || `/DATA/AppData/app${containerPath}`

describe('the long syntax', () => {
	// The reported bug. The editor ran every entry through a substitution against the
	// compose file's top-level `volumes:` block -- which maps a volume NAME to its
	// DEFINITION -- so String.replace was handed an object and wrote its coercion
	// into the field the owner reads.
	it('leaves a named volume exactly as written', () => {
		const entry = {
			type: 'volume',
			source: 'backend-storage',
			target: '/var/www/html/storage',
			volume: {},
		}

		expect(normalizeVolume(entry, suggest)).toEqual(entry)
		expect(normalizeVolume(entry, suggest).source).toBe('backend-storage')
	})

	it('leaves a long-form bind alone too', () => {
		const entry = { type: 'bind', source: './backend/docker/php.ini', target: '/usr/local/etc/php/conf.d/custom.ini' }
		expect(normalizeVolume(entry, suggest)).toEqual(entry)
	})

	it('never asks for a host path to be invented for one', () => {
		const suggestSpy = vi.fn()
		normalizeVolume({ type: 'volume', source: 'backend-storage', target: '/data' }, suggestSpy)
		expect(suggestSpy).not.toHaveBeenCalled()
	})
})

describe('the short syntax', () => {
	it('reads a named volume as a volume rather than a folder', () => {
		expect(normalizeVolume('backend-storage:/var/www/html/storage', suggest))
			.toEqual({ type: 'volume', source: 'backend-storage', target: '/var/www/html/storage' })
	})

	it('reads a path as a bind', () => {
		expect(normalizeVolume('/DATA/Media:/media', suggest))
			.toEqual({ type: 'bind', source: '/DATA/Media', target: '/media' })
	})

	it('keeps the container path whole when an access mode follows', () => {
		// splitting on every colon would hand back `ro` as the target
		expect(normalizeVolume('backend-storage:/var/www:ro', suggest))
			.toEqual({ type: 'volume', source: 'backend-storage', target: '/var/www' })
	})

	it('suggests a host path when the entry names only a container path', () => {
		expect(normalizeVolume('/config', suggest))
			.toEqual({ type: 'bind', source: '/DATA/AppData/app/config', target: '/config' })
	})

	it('says nothing about an entry that says nothing', () => {
		expect(normalizeVolume('', suggest)).toBeUndefined()
		expect(normalizeVolume('   ', suggest)).toBeUndefined()
		expect(normalizeVolume(null, suggest)).toBeUndefined()
		expect(normalizeVolume(undefined, suggest)).toBeUndefined()
	})
})

describe('telling a volume name from a host path', () => {
	it('recognises a name', () => {
		for (const source of ['backend-storage', 'db_data', 'cache', 'a.b-c_1'])
			expect(isNamedVolumeSource(source)).toBe(true)
	})

	it('recognises a path', () => {
		for (const source of ['/DATA', './backend', '../shared', '~/stuff', 'C:\\data', 'rel/path'])
			expect(isNamedVolumeSource(source)).toBe(false)
	})

	it('leaves an unresolved variable to the bind side', () => {
		// a compose variable carries no slash and is a path in every case that matters
		// eslint-disable-next-line no-template-curly-in-string -- the literal IS the input
		expect(isNamedVolumeSource('${VOLUME_PATH}')).toBe(false)
		expect(isNamedVolumeSource('$HOME')).toBe(false)
	})

	it('is not fooled by nothing', () => {
		expect(isNamedVolumeSource('')).toBe(false)
		expect(isNamedVolumeSource(undefined)).toBe(false)
	})
})

describe('resolveAppID', () => {
	it('writes the app name where the App Store left $AppID', () => {
		expect(resolveAppID('/DATA/AppData/$AppID/data', 'filebrowser')).toBe('/DATA/AppData/filebrowser/data')
		// eslint-disable-next-line no-template-curly-in-string -- the literal IS the input
		expect(resolveAppID('/DATA/AppData/${AppID}/config', 'filebrowser')).toBe('/DATA/AppData/filebrowser/config')
	})

	it('leaves other variables, escapes and an unknown name alone', () => {
		expect(resolveAppID('/DATA/$AppIDX', 'app')).toBe('/DATA/$AppIDX')
		expect(resolveAppID('/DATA/$$AppID', 'app')).toBe('/DATA/$$AppID')
		expect(resolveAppID('/DATA/AppData/$AppID', '')).toBe('/DATA/AppData/$AppID')
		expect(resolveAppID(undefined, 'app')).toBeUndefined()
	})
})
