// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import NewTabButton from './NewTabButton.vue'

vi.mock('@/router/pageTabs', () => ({ openPage: vi.fn() }))

describe('the open-in-a-new-tab button', () => {
	const onItsTab = (page, path) => NewTabButton.computed.onItsTab.call({ page, $route: path === undefined ? undefined : { path } })

	it('shows in the window, not on the page\'s own tab', () => {
		expect(onItsTab('stats', '/')).toBe(false)
		expect(onItsTab('stats', '/stats')).toBe(true)
		expect(onItsTab('stats', '/logs')).toBe(false)
		expect(onItsTab('stats', undefined)).toBe(false)
	})
})
