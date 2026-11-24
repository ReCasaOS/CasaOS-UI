// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import SecurityOverview from '@/components/Security/SecurityOverview.vue'
import { refresh, vulnScan, vulnScanApi } from '@/service/vulnScan'

vi.mock('@/service/vulnScan', async () => {
	const { reactive } = await import('vue')
	return {
		vulnScan: reactive({ apps: {}, ok: true }),
		refresh: vi.fn(() => Promise.resolve()),
		vulnScanApi: { app: vi.fn(), status: vi.fn(), scan: vi.fn() },
	}
})

// a near-empty table makes $t return its key, which is the English sentence
// (a key with a parameter must be in it: $t leaves a missing key uninterpolated)
vi.mock('@/assets/lang', () => ({
	default: {
		en_us: {
			'Last scan: {date}': 'Last scan: {date}',
			'{count} critical · update': '{count} critical · update',
			'{count} critical': '{count} critical',
			'{count} high': '{count} high',
		},
	},
}))

const body = data => Promise.resolve({ data: { data } })
const scanned = { running: false, last_error: '', last_run: '2026-11-24T05:31:00Z', db_updated_at: '2026-11-23T19:02:50Z' }

async function open(status = scanned) {
	vulnScanApi.status.mockImplementation(() => body(status))
	const wrapper = mount(SecurityOverview, { global: { plugins: [Buefy, i18n] }, attachTo: document.body })
	await flushPromises()

	return wrapper
}

beforeEach(() => {
	vi.clearAllMocks()
	vulnScan.apps = {}
})
afterEach(() => {
	document.body.innerHTML = ''
	vi.useRealTimers()
})

describe('the Security window of the box', () => {
	it('says a first scan runs right after the install, and shows what it found once it is over', async () => {
		vi.useFakeTimers()
		const wrapper = await open({ running: true, last_error: '', last_run: null, db_updated_at: null })
		expect(wrapper.find('[data-state]').text()).toBe('The first scan is running. It can take several minutes.')
		expect(wrapper.find('[data-action="scan"]').attributes('disabled')).toBeDefined()
		expect(wrapper.findAll('[data-app]')).toHaveLength(0)

		vulnScanApi.status.mockImplementation(() => body(scanned))
		vulnScan.apps = { jellyfin: { app: 'jellyfin', critical: 0, high: 0, actionable: false } }
		await vi.advanceTimersByTimeAsync(5000)
		await flushPromises()
		expect(refresh).toHaveBeenCalledWith({ force: true })
		expect(wrapper.find('[data-state]').text()).toBe('No app needs an update for a critical vulnerability.')
		expect(wrapper.findAll('[data-app]')).toHaveLength(1)
		expect(wrapper.find('[data-app]').text()).toContain('Nothing found')
	})

	it('says no scan has run on a box whose module never scanned', async () => {
		const wrapper = await open({ running: false, last_error: '', last_run: null, db_updated_at: null })
		expect(wrapper.find('[data-state]').text()).toBe('No scan has run yet.')
	})

	it('lists the apps an update would fix first, then the most critical ones', async () => {
		vulnScan.apps = {
			calibre: { app: 'calibre', critical: 0, high: 3, actionable: false },
			vaultwarden: { app: 'vaultwarden', critical: 4, high: 117, actionable: false },
			anythingllm: { app: 'anythingllm', critical: 2, high: 9, actionable: true },
		}
		const wrapper = await open()
		const rows = wrapper.findAll('[data-app]')
		expect(rows.map(row => row.find('.security-overview__name').text())).toEqual(['anythingllm', 'vaultwarden', 'calibre'])
		expect(rows[0].text()).toContain('2 critical · update')
		expect(rows[1].text()).toContain('4 critical')
		expect(rows[1].text()).toContain('117 high')
		expect(wrapper.find('[data-state]').text()).toBe('Some apps have a critical vulnerability that an update fixes.')
	})

	it('opens the vulnerabilities of an app from its line', async () => {
		vulnScan.apps = { jellyfin: { app: 'jellyfin', critical: 1, high: 0, actionable: false } }
		const wrapper = await open()
		const modal = vi.spyOn(wrapper.vm.$buefy.modal, 'open').mockImplementation(() => {})
		await wrapper.find('[data-app]').trigger('click')
		expect(modal.mock.calls[0][0].props).toEqual({ app: 'jellyfin' })
	})

	it('says so when the module cannot be read', async () => {
		vulnScanApi.status.mockImplementation(() => Promise.reject(new Error('502')))
		const wrapper = mount(SecurityOverview, { global: { plugins: [Buefy, i18n] }, attachTo: document.body })
		await flushPromises()
		expect(wrapper.find('[data-error]').exists()).toBe(true)
	})
})
