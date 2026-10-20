// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// counts how many times the page module is evaluated
const loaded = vi.hoisted(() => ({ count: 0 }))
vi.mock('./StatsPage.vue', () => {
	loaded.count++
	return { default: { name: 'StatsPage', render: () => null } }
})

function fakeBuefy() {
	const open = vi.fn(options => ({ options, close: vi.fn() }))
	return { buefy: { modal: { open } }, open }
}

describe('the Statistics entry', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('does not load the page when imported', async () => {
		await import('./entry.js')
		expect(loaded.count).toBe(0)
	})

	it('opens a modal that Escape of its own closes, with no initial item', async () => {
		const { openStatistics, STATS_APP_NAME } = await import('./entry.js')
		const { buefy, open } = fakeBuefy()
		const modal = openStatistics(buefy, { appLaunchInIframe: true, appLaunchExceptions: [] })
		expect(STATS_APP_NAME).toBe('Statistics')
		expect(modal).not.toBeNull()
		const options = open.mock.calls[0][0]
		expect(options.canCancel).toEqual([])
		expect(options.props.initialItem).toBe('')
		expect(options.customClass).toContain('stats-modal')
		expect(options.hasModalCard).toBe(true)
	})

	it('hands over the item it was asked for', async () => {
		const { openStatistics } = await import('./entry.js')
		const { buefy, open } = fakeBuefy()
		openStatistics(buefy, { appLaunchInIframe: true, appLaunchExceptions: [] }, { item: 'vm:abc' })
		expect(open.mock.calls[0][0].props.initialItem).toBe('vm:abc')
	})

	it('opens a tab when apps open in new tabs, and returns null', async () => {
		const { openStatistics } = await import('./entry.js')
		const { buefy, open } = fakeBuefy()
		const win = vi.spyOn(window, 'open').mockReturnValue(null)
		expect(openStatistics(buefy, { appLaunchInIframe: false, appLaunchExceptions: [] })).toBeNull()
		expect(win).toHaveBeenCalledTimes(1)
		expect(win.mock.calls[0][0].endsWith('#/stats')).toBe(true)
		expect(win.mock.calls[0][1]).toBe('_blank')
		expect(open).not.toHaveBeenCalled()
	})

	it('puts the item in the address of the tab, encoded', async () => {
		const { openStatistics } = await import('./entry.js')
		const win = vi.spyOn(window, 'open').mockReturnValue(null)
		openStatistics(fakeBuefy().buefy, { appLaunchInIframe: false, appLaunchExceptions: [] }, { item: 'vm:abc/..' })
		expect(win.mock.calls[0][0].endsWith('#/stats?item=vm%3Aabc%2F..')).toBe(true)
	})

	it('opens a tab when Statistics is among the exceptions', async () => {
		const { openStatistics } = await import('./entry.js')
		const win = vi.spyOn(window, 'open').mockReturnValue(null)
		expect(openStatistics(fakeBuefy().buefy, { appLaunchInIframe: true, appLaunchExceptions: ['casaos:statistics'] })).toBeNull()
		expect(win).toHaveBeenCalledTimes(1)
	})
})
