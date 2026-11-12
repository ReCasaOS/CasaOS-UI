// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GuardJournal from './GuardJournal.vue'
import i18n from '@/plugins/i18n'
import { resetShareGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const ev = (extra = {}) => ({ time: '2026-11-12T10:21:03Z', ip: '203.0.113.9', key: '203.0.113.9', country: 'FR', asn: 3215, as_org: 'Orange', app: 'jellyfin', path: '/x', reason: 'waf', rule: 942100, detail: 'SQL Injection', action: 'blocked', count: 1, ...extra })
const ban = (extra = {}) => ({ key: '203.0.113.9', ip: '203.0.113.9', country: 'FR', asn: 0, as_org: '', app: 'jellyfin', reason: 'scan', since: '2026-11-12T10:21:03Z', until: '2026-11-12T11:21:03Z', strikes: 1, ...extra })
const box = () => ({ waf: 'block', rules_off: [], allow: ['192.0.2.1'], block: [], countries: { mode: 'none', list: [] }, rate_per_min: 600, ban: null })
const answer = data => ({ data: { data } })
const view = (override = null) => ({ box: box(), apps: { jellyfin: { access: 'open', override } } })

let wrapper
async function show(props = {}) {
	wrapper = mount(GuardJournal, { props: { boxPolicy: box(), ...props }, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
}
async function click(find) {
	await wrapper.find(find).trigger('click')
	await flushPromises()
}

beforeEach(() => {
	resetShareGuard()
	shareGuard.view = view()
	shareGuard.ok = true
	vi.spyOn(shareGuardApi, 'events').mockResolvedValue(answer([ev()]))
	vi.spyOn(shareGuardApi, 'bans').mockResolvedValue(answer([ban()]))
	vi.spyOn(shareGuardApi, 'unban').mockResolvedValue({})
	vi.spyOn(shareGuardApi, 'setApp').mockResolvedValue(answer(view()))
	vi.spyOn(shareGuardApi, 'setBox').mockResolvedValue(answer(view()))
})
afterEach(() => {
	wrapper.unmount()
	vi.restoreAllMocks()
})

describe('the protection journal', () => {
	it('shows the reason sentence, the flag, the network and the count', async () => {
		shareGuardApi.events.mockResolvedValue(answer([ev({ count: 50 })]))
		await show()
		const text = wrapper.text()
		expect(text).toContain('OWASP rule 942100: SQL Injection')
		expect(text).toContain('🇫🇷')
		expect(text).toContain('Orange AS3215')
		expect(text).toContain('×50')
		expect(text).toContain('IP Geolocation by DB-IP')
		expect(wrapper.find('a[href="https://db-ip.com"]').attributes('rel')).toBe('noopener noreferrer')
	})

	it('asks for one app and hides the app column when it is given', async () => {
		await show({ app: 'jellyfin' })
		expect(shareGuardApi.events).toHaveBeenCalledWith({ app: 'jellyfin' })
		expect(wrapper.findAll('th').map(h => h.text())).not.toContain('App')
		expect(wrapper.find('select[name=app-filter]').exists()).toBe(false)
	})

	it('stops applying a rule to an app that had no override', async () => {
		await show()
		await click('.stop-rule')
		expect(shareGuardApi.setApp).toHaveBeenCalledWith('jellyfin', 'open', { waf: null, rules_off: [942100], allow: null, block: null, countries: null, rate_per_min: null, ban: null })
		expect(wrapper.emitted('changed')).toHaveLength(1)
	})

	it('appends the rule to the rules the override already turns off', async () => {
		shareGuard.view = view({ waf: 'observe', rules_off: [1], allow: null, block: null, countries: null, rate_per_min: null, ban: null })
		await show()
		await click('.stop-rule')
		expect(shareGuardApi.setApp.mock.calls[0][2]).toMatchObject({ waf: 'observe', rules_off: [1, 942100] })
	})

	it('offers no rule button for an app that is no longer shared', async () => {
		shareGuardApi.events.mockResolvedValue(answer([ev({ app: 'gone' })]))
		await show()
		expect(wrapper.find('.stop-rule').exists()).toBe(false)
	})

	it('always allows an address, then lifts its ban', async () => {
		await show()
		await wrapper.findAll('[role=tab], .tabs a').at(1).trigger('click')
		await flushPromises()
		await click('.allow')
		expect(shareGuardApi.setBox).toHaveBeenCalledWith({ ...box(), allow: ['192.0.2.1', '203.0.113.9'] })
		expect(shareGuardApi.unban).toHaveBeenCalledWith('203.0.113.9')
		expect(shareGuardApi.setBox.mock.invocationCallOrder[0]).toBeLessThan(shareGuardApi.unban.mock.invocationCallOrder[0])
	})

	it('keeps the ban row and says so when the unban fails', async () => {
		shareGuardApi.unban.mockRejectedValue({ response: { status: 400, data: { message: 'gateway_unsupported' } } })
		await show()
		await wrapper.findAll('[role=tab], .tabs a').at(1).trigger('click')
		await flushPromises()
		await click('.allow')
		expect(wrapper.find('.message.is-danger').exists()).toBe(true)
		expect(wrapper.find('.guard-bans tbody tr').exists()).toBe(true)
		expect(wrapper.emitted('changed')).toBeUndefined()
	})

	it('unbans and reloads the bans', async () => {
		await show()
		await wrapper.findAll('[role=tab], .tabs a').at(1).trigger('click')
		await flushPromises()
		shareGuardApi.bans.mockClear()
		await click('.unban')
		expect(shareGuardApi.unban).toHaveBeenCalledWith('203.0.113.9')
		expect(shareGuardApi.bans).toHaveBeenCalledTimes(1)
	})

	it('shows an error and no table when the events cannot be read', async () => {
		shareGuardApi.events.mockRejectedValue({ response: { status: 400, data: { message: 'gateway_unsupported' } } })
		await show()
		expect(wrapper.find('.message.is-danger').exists()).toBe(true)
		expect(wrapper.find('table').exists()).toBe(false)
	})

	it('shows 25 rows a page and 3 pages for 60 events', async () => {
		shareGuardApi.events.mockResolvedValue(answer(Array.from({ length: 60 }, (_, i) => ev({ time: `2026-11-12T10:${String(i).padStart(2, '0')}:00Z`, path: `/p${i}` }))))
		await show()
		expect(wrapper.findAll('.guard-events tbody tr')).toHaveLength(25)
		expect(wrapper.findAll('.pagination-list a.pagination-link')).toHaveLength(3)
	})
})
