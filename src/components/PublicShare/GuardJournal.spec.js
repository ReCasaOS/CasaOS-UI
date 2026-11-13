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
	wrapper = mount(GuardJournal, { props, global: { plugins: [Buefy, i18n] } })
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
	vi.spyOn(shareGuardApi, 'view').mockImplementation(async () => answer(shareGuard.view))
})
async function banTab() {
	await wrapper.findAll('[role=tab], .tabs a').at(1).trigger('click')
	await flushPromises()
}
afterEach(() => {
	wrapper.unmount()
	vi.restoreAllMocks()
})

const refusal = (extra = {}) => ({ hour: '2026-11-12T10:00:00Z', key: '198.51.100.7', reason: 'external', source: 'FireHOL level 1', count: 12, ...extra })
const relayTab = () => wrapper.findAll('[role=tab], .tabs a').filter(t => t.text().includes('Cut at the relay'))
async function openRelay() {
	await relayTab().at(0).trigger('click')
	await flushPromises()
}

describe('the relay tab of the journal', () => {
	beforeEach(() => {
		shareGuard.view = { ...view(), relay: { supported: true } }
		vi.spyOn(shareGuardApi, 'relayRefusals').mockResolvedValue(answer([refusal()]))
	})

	it('is hidden when the relay is not supported', async () => {
		shareGuard.view = view()
		await show()
		expect(relayTab()).toHaveLength(0)
	})

	it('is hidden in an app window', async () => {
		await show({ app: 'jellyfin' })
		expect(relayTab()).toHaveLength(0)
	})

	it('reads nothing until it is opened, then lists the refusals', async () => {
		await show()
		expect(shareGuardApi.relayRefusals).not.toHaveBeenCalled()
		await openRelay()
		expect(shareGuardApi.relayRefusals).toHaveBeenCalledTimes(1)
		const text = wrapper.find('table.guard-relay').text()
		expect(text).toContain('198.51.100.7')
		expect(text).toContain('On the list FireHOL level 1')
		expect(text).toContain('12')
	})

	it('reads again on Refresh', async () => {
		await show()
		await openRelay()
		await click('button[name=refresh]')
		expect(shareGuardApi.relayRefusals).toHaveBeenCalledTimes(2)
	})

	it('says so when nothing was cut', async () => {
		shareGuardApi.relayRefusals.mockResolvedValue(answer([]))
		await show()
		await openRelay()
		expect(wrapper.text()).toContain('Nothing was cut at the relay in the last 7 days.')
		expect(wrapper.find('table.guard-relay').exists()).toBe(false)
	})

	it('shows an error as the journal does', async () => {
		shareGuardApi.relayRefusals.mockRejectedValue({ response: { status: 502, data: { message: 'x' } } })
		await show()
		await openRelay()
		expect(wrapper.text()).toContain('Something went wrong')
	})
})

describe('the protection journal', () => {
	it('shows the reason sentence, the flag, the network and the count', async () => {
		shareGuardApi.events.mockResolvedValue(answer([ev({ count: 50 })]))
		await show()
		const text = wrapper.text()
		expect(text).toContain('OWASP rule 942100: SQL Injection')
		expect(text).toContain('France')
		expect(wrapper.findComponent({ name: 'CountryFlag' }).props('cc')).toBe('FR')
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
		expect(shareGuardApi.view).toHaveBeenCalled()
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

	it('builds the box from the store, not from an older prop', async () => {
		shareGuard.view = { ...view(), box: { ...box(), allow: ['192.0.2.1', '198.51.100.7'] } }
		await show()
		await wrapper.findAll('[role=tab], .tabs a').at(1).trigger('click')
		await flushPromises()
		await click('.allow')
		expect(shareGuardApi.setBox).toHaveBeenCalledWith({ ...box(), allow: ['192.0.2.1', '198.51.100.7', '203.0.113.9'] })
	})

	it('reads the store again when a write fails, the core may have saved it', async () => {
		shareGuardApi.setApp.mockRejectedValue({ response: { status: 500, data: { message: 'the change is saved, but the Gateway has not taken it yet: it will be sent again' } } })
		await show()
		await click('.stop-rule')
		expect(shareGuardApi.view).toHaveBeenCalledTimes(1)
		expect(wrapper.text()).toContain('Saved; it will reach the box\'s gateway in a moment.')
	})

	it('offers no rule button when the app already does not apply the rule', async () => {
		shareGuard.view = { ...view(), apps: { jellyfin: { access: 'open', override: null, effective: { rules_off: [942100] } } } }
		await show()
		expect(wrapper.find('.stop-rule').exists()).toBe(false)
	})

	it('lists only the bans of its app', async () => {
		shareGuardApi.bans.mockResolvedValue(answer([ban(), ban({ key: '198.51.100.2', ip: '198.51.100.2', app: 'nextcloud' })]))
		await show({ app: 'jellyfin' })
		await banTab()
		expect(wrapper.findAll('.guard-bans tbody tr')).toHaveLength(1)
		expect(wrapper.text()).not.toContain('198.51.100.2')
	})

	it('names the banned reason as an address in the filter', async () => {
		await show()
		expect(wrapper.find('select[name=reason-filter] option[value=banned]').text()).toBe('Banned address')
	})

	it('does not repeat a rule the override already turns off', async () => {
		shareGuard.view = view({ waf: null, rules_off: [942100], allow: null, block: null, countries: null, rate_per_min: null, ban: null })
		await show()
		await click('.stop-rule')
		expect(shareGuardApi.setApp.mock.calls[0][2].rules_off).toEqual([942100])
	})

	it('offers no rule button on a waf event without a rule number', async () => {
		shareGuardApi.events.mockResolvedValue(answer([ev({ rule: 0 })]))
		await show()
		expect(wrapper.find('.stop-rule').exists()).toBe(false)
	})

	it('unbans an IPv6 /64 with its raw key', async () => {
		shareGuardApi.bans.mockResolvedValue(answer([ban({ key: '2001:db8::/64', ip: '2001:db8::1' })]))
		await show()
		await wrapper.findAll('[role=tab], .tabs a').at(1).trigger('click')
		await flushPromises()
		await click('.unban')
		expect(shareGuardApi.unban).toHaveBeenCalledWith('2001:db8::/64')
	})

	it('drops an answer older than the latest request', async () => {
		let late
		shareGuardApi.events.mockReturnValueOnce(new Promise(ok => (late = ok)))
		await show()
		shareGuardApi.events.mockResolvedValue(answer([ev({ path: '/fresh' })]))
		await wrapper.find('select[name=reason-filter]').setValue('scan')
		await flushPromises()
		late(answer([ev({ path: '/stale' })]))
		await flushPromises()
		expect(wrapper.text()).toContain('/fresh')
		expect(wrapper.text()).not.toContain('/stale')
	})
})
