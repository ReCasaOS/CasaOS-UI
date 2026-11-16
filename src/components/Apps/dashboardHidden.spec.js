import { describe, expect, it } from 'vitest'
import { isHiddenApp, shownApps, withHiddenApps } from './dashboardHidden'

const apps = [{ name: 'jellyfin' }, { name: 'cloudflared', hidden_on_dashboard: true }, { name: 'files', hidden_on_dashboard: false }]

describe('the apps hidden from the dashboard', () => {
	it('leaves them out unless asked to show them', () => {
		expect(shownApps(apps, false).map(a => a.name)).toEqual(['jellyfin', 'files'])
		expect(shownApps(apps, true)).toBe(apps)
		expect(isHiddenApp(undefined)).toBe(false)
	})

	it('keeps them in the list after a drag that did not draw them', () => {
		const dragged = [apps[2], apps[0]]
		expect(withHiddenApps(dragged, apps, false).map(a => a.name)).toEqual(['files', 'jellyfin', 'cloudflared'])
		expect(withHiddenApps(apps, apps, true)).toBe(apps)
	})
})
