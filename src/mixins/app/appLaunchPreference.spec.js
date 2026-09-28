import { describe, expect, it } from 'vitest'
import {
	DEFAULT_APP_LAUNCH_EXCEPTIONS,
	FILES_LAUNCH_ID,
	builtinOpensInNewTab,
	readAppLaunchPreference,
	shouldOpenInNewWindow,
} from './appLaunchPreference'

const qbittorrent = { id: 'org.icewhale.qbittorrent', name: 'qbittorrent' }
const jellyfin = { id: 'org.icewhale.jellyfin', name: 'jellyfin' }

function fakeStorage(entries) {
	return {
		getItem: key => (key in entries ? entries[key] : null),
	}
}

describe('shouldOpenInNewWindow', () => {
	const inIframe = { inIframe: true, exceptions: DEFAULT_APP_LAUNCH_EXCEPTIONS }

	it('keeps ordinary apps in the dialog when the setting is on', () => {
		expect(shouldOpenInNewWindow(jellyfin, inIframe)).toBe(false)
	})

	it('sends an excepted app to a new tab', () => {
		expect(shouldOpenInNewWindow(qbittorrent, inIframe)).toBe(true)
	})

	it('sends every app to a new tab when the setting is off', () => {
		expect(shouldOpenInNewWindow(jellyfin, { inIframe: false, exceptions: [] })).toBe(true)
	})

	it('ignores the exception list entirely when the setting is off', () => {
		expect(shouldOpenInNewWindow(qbittorrent, { inIframe: false, exceptions: [] })).toBe(true)
	})

	it('matches an exception on either the id or the name', () => {
		const byId = { inIframe: true, exceptions: ['org.icewhale.jellyfin'] }
		const byName = { inIframe: true, exceptions: ['jellyfin'] }

		expect(shouldOpenInNewWindow(jellyfin, byId)).toBe(true)
		expect(shouldOpenInNewWindow(jellyfin, byName)).toBe(true)
	})

	it('matches exceptions case-insensitively', () => {
		expect(shouldOpenInNewWindow(jellyfin, { inIframe: true, exceptions: ['JellyFin'] })).toBe(true)
	})

	it('defaults to the dialog when no preference is given', () => {
		expect(shouldOpenInNewWindow(jellyfin, undefined)).toBe(false)
	})

	it('does not throw on an app with neither id nor name', () => {
		expect(shouldOpenInNewWindow({}, inIframe)).toBe(false)
	})
})

describe('builtinOpensInNewTab', () => {
	it('keeps Files in the dialog while apps open inside CasaOS', () => {
		expect(builtinOpensInNewTab(FILES_LAUNCH_ID, { appLaunchInIframe: true, appLaunchExceptions: DEFAULT_APP_LAUNCH_EXCEPTIONS })).toBe(false)
	})

	it('opens Files in a new tab when the setting is off, or when it is excepted', () => {
		expect(builtinOpensInNewTab(FILES_LAUNCH_ID, { appLaunchInIframe: false, appLaunchExceptions: [] })).toBe(true)
		expect(builtinOpensInNewTab(FILES_LAUNCH_ID, { appLaunchInIframe: true, appLaunchExceptions: [FILES_LAUNCH_ID] })).toBe(true)
	})

	it('is not matched by a compose app named files', () => {
		expect(builtinOpensInNewTab(FILES_LAUNCH_ID, { appLaunchInIframe: true, appLaunchExceptions: ['files'] })).toBe(false)
	})
})

describe('readAppLaunchPreference', () => {
	it('falls back to the previous behaviour when nothing is stored', () => {
		const preference = readAppLaunchPreference(fakeStorage({}))

		expect(preference.inIframe).toBe(true)
		expect(preference.exceptions).toEqual(DEFAULT_APP_LAUNCH_EXCEPTIONS)
	})

	it('reads the setting back', () => {
		expect(readAppLaunchPreference(fakeStorage({ appLaunchInIframe: 'false' })).inIframe).toBe(false)
		expect(readAppLaunchPreference(fakeStorage({ appLaunchInIframe: 'true' })).inIframe).toBe(true)
	})

	it('reads an explicitly emptied exception list', () => {
		const preference = readAppLaunchPreference(fakeStorage({ appLaunchExceptions: '[]' }))

		expect(preference.exceptions).toEqual([])
	})

	// A corrupted entry must not take the whole dashboard down with it.
	it('falls back to the defaults on unparseable stored exceptions', () => {
		const preference = readAppLaunchPreference(fakeStorage({ appLaunchExceptions: 'not json' }))

		expect(preference.exceptions).toEqual(DEFAULT_APP_LAUNCH_EXCEPTIONS)
	})

	it('ignores a stored value that is not a list', () => {
		const preference = readAppLaunchPreference(fakeStorage({ appLaunchExceptions: '{"a":1}' }))

		expect(preference.exceptions).toEqual(DEFAULT_APP_LAUNCH_EXCEPTIONS)
	})
})
