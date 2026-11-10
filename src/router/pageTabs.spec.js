// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openPage, pageAddress } from './pageTabs'

describe('the built-in pages\' addresses', () => {
	afterEach(() => vi.restoreAllMocks())

	it('names the page and where in it, leaving out what is not set', () => {
		const base = window.location.pathname
		expect(pageAddress('fleet')).toBe(`${base}#/fleet`)
		expect(pageAddress('files', { path: '/DATA/My Movies' })).toBe(`${base}#/files?path=%2FDATA%2FMy%20Movies`)
		expect(pageAddress('logs', { app: 'jellyfin', box: '', at: null })).toBe(`${base}#/logs?app=jellyfin`)
	})

	it('opens it on a new tab', () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null)
		openPage('vms', { vm: 'abc' })
		expect(open).toHaveBeenCalledWith(`${window.location.pathname}#/vms?vm=abc`, '_blank')
	})
})

// The launcher is opened by the dashboard, with the app it was asked for. It used to
// have a page of its own, open without a session, that took the app (its address
// with it) from the link: a link could put any site in the frame of the dashboard.
describe('the pages of the dashboard', () => {
	it('have none that takes the app to open from its link', async () => {
		const { default: routes } = await import('./route')
		expect(routes.map(route => route.path)).not.toContain('/launch')
	})
})
