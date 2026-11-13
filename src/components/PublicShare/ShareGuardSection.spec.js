// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareGuardSection from './ShareGuardSection.vue'
import i18n from '@/plugins/i18n'
import { publicShare } from '@/service/publicShare'
import { resetShareGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const answer = data => ({ data: { data } })
const view = (extra = {}) => ({ supported: true, reason: '', protection: false, box: { waf: 'off', allow: [], block: [], rules_off: [], countries: { mode: 'none', list: [] }, rate_per_min: 600, ban: { waf_hits: 5, waf_window_s: 300, scan_404: 20, scan_window_s: 300, rate_strikes: 3, rate_window_s: 600, code_fails: 5, code_window_s: 900 } }, apps: { jellyfin: { access: 'code' } }, people: [], ...extra })

const relay = (extra = {}) => ({ supported: true, filter: true, share_bans: false, share_bans_at: null, community_size: 1234, contributed_month: 0, ...extra })

let wrapper
async function show() {
	wrapper = mount(ShareGuardSection, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
}
const dialogButton = label => [...document.querySelectorAll('.dialog button')].find(b => b.textContent.includes(label))
async function flip() {
	const box = wrapper.find('.switch input')
	await box.setValue(!box.element.checked)
	await flushPromises()
}

beforeEach(() => {
	document.body.innerHTML = ''
	localStorage.clear()
	resetShareGuard()
	shareGuard.view = view()
	shareGuard.ok = true
	publicShare.status = { apps: [{ name: 'jellyfin', label: 'Jellyfin', shared: true }] }
	publicShare.ok = true
	vi.spyOn(shareGuardApi, 'view').mockImplementation(async () => answer(shareGuard.view))
	vi.spyOn(shareGuardApi, 'events').mockResolvedValue(answer([]))
	vi.spyOn(shareGuardApi, 'bans').mockResolvedValue(answer([]))
	vi.spyOn(shareGuardApi, 'setProtection').mockImplementation(async on => answer(view({ protection: on })))
	vi.spyOn(shareGuardApi, 'setRelay').mockImplementation(async body => answer(view({ relay: relay(body) })))
	vi.spyOn(shareGuardApi, 'setBox').mockResolvedValue(answer(view({ protection: true })))
})
afterEach(() => {
	wrapper.unmount()
	vi.restoreAllMocks()
})

describe('the protection section', () => {
	it('is hidden without a shared app', async () => {
		publicShare.status = { apps: [{ name: 'jellyfin', label: 'Jellyfin', shared: false }] }
		await show()
		expect(wrapper.find('.share-guard-section').exists()).toBe(false)
	})

	it('is hidden when the core does not answer', async () => {
		shareGuard.view = null
		shareGuard.ok = false
		shareGuardApi.view.mockRejectedValue({ response: { status: 404 } })
		await show()
		expect(wrapper.find('.share-guard-section').exists()).toBe(false)
	})

	it('only says to update when the Gateway cannot protect', async () => {
		shareGuard.view = view({ supported: false, reason: 'gateway_unsupported' })
		await show()
		expect(wrapper.text()).toContain('Update ReCasaOS to protect shared apps')
		expect(wrapper.find('.switch').exists()).toBe(false)
		expect(wrapper.find('.share-people').exists()).toBe(false)
	})

	it('turns protection on after the DDoS notice, once', async () => {
		await show()
		expect(wrapper.find('.guard-policy-form').exists()).toBe(false)
		await flip()
		expect(shareGuardApi.setProtection).not.toHaveBeenCalled()
		expect(document.body.textContent).toContain('it does not stop a flood (DDoS)')
		dialogButton('Turn on').click()
		await flushPromises()
		expect(shareGuardApi.setProtection).toHaveBeenCalledWith(true)
		expect(wrapper.find('.guard-policy-form').exists()).toBe(true)
		expect(wrapper.find('.guard-journal').exists()).toBe(true)
		await flip()
		expect(shareGuardApi.setProtection).toHaveBeenLastCalledWith(false)
		document.body.innerHTML = ''
		await flip()
		expect(shareGuardApi.setProtection).toHaveBeenLastCalledWith(true)
		expect(document.body.textContent).not.toContain('DDoS')
	})

	it('shows the people even when protection is off, and the box form only when on', async () => {
		await show()
		expect(wrapper.find('.share-people').exists()).toBe(true)
		expect(wrapper.find('.guard-policy-form').exists()).toBe(false)
	})

	it('saves the box and shows a refusal on the form', async () => {
		shareGuard.view = view({ protection: true })
		await show()
		shareGuardApi.setBox.mockRejectedValue({ response: { status: 400, data: { message: 'bad_policy:rate_per_min' } } })
		await wrapper.find('.guard-policy-form').trigger('submit')
		await flushPromises()
		expect(shareGuardApi.setBox).toHaveBeenCalled()
		expect(wrapper.find('.guard-policy-form').text()).toContain('Invalid value in the request limit')
	})

	it('draws the switch off again when the notice is cancelled', async () => {
		await show()
		await flip()
		dialogButton('Cancel').click()
		await flushPromises()
		expect(shareGuardApi.setProtection).not.toHaveBeenCalled()
		expect(wrapper.find('.switch input').element.checked).toBe(false)
		expect(document.activeElement).toBe(wrapper.find('.switch input').element)
	})

	it('draws the switch off again when turning protection on fails', async () => {
		localStorage.setItem('share-guard-ddos-seen', '1')
		shareGuardApi.setProtection.mockRejectedValue({ response: { status: 400, data: { message: 'gateway_unsupported' } } })
		await show()
		await flip()
		expect(wrapper.find('.switch input').element.checked).toBe(false)
		expect(wrapper.text()).toContain('too old to protect shared apps')
	})

	it('reads the store again when turning protection on fails, and gives the focus back to the switch', async () => {
		localStorage.setItem('share-guard-ddos-seen', '1')
		shareGuardApi.setProtection.mockRejectedValue({ response: { status: 500, data: { message: 'the change is saved, but the Gateway has not taken it yet: it will be sent again' } } })
		await show()
		shareGuardApi.view.mockResolvedValue(answer(view({ protection: true })))
		await flip()
		expect(wrapper.text()).toContain('Saved; it will reach the box\'s gateway in a moment.')
		expect(wrapper.find('.switch input').element.checked).toBe(true)
		expect(document.activeElement).toBe(wrapper.find('.switch input').element)
	})

	it('says a failed box save above the form, and reads the store again', async () => {
		shareGuard.view = view({ protection: true })
		await show()
		const reads = shareGuardApi.view.mock.calls.length
		shareGuardApi.setBox.mockRejectedValue({ response: { status: 500, data: { message: 'the change is saved, but the Gateway has not taken it yet: it will be sent again' } } })
		await wrapper.find('.guard-policy-form').trigger('submit')
		await flushPromises()
		expect(wrapper.findComponent({ name: 'GuardPolicyForm' }).props('error')).toBe('')
		expect(wrapper.text().split('Saved; it will reach the box\'s gateway in a moment.')).toHaveLength(2)
		expect(shareGuardApi.view).toHaveBeenCalledTimes(reads + 1)
	})

	it('keeps the new code shown when the read after it fails, and drops it on close', async () => {
		vi.spyOn(shareGuardApi, 'addPerson').mockResolvedValue(answer({ person: { id: 'p_2', name: 'Papa', apps: ['jellyfin'] }, code: 'ABCD-EFGH-JKMN' }))
		await show()
		shareGuardApi.view.mockRejectedValue({ response: { status: 500 } })
		await wrapper.find('.add-person').trigger('click')
		await wrapper.find('input[name=person-name]').setValue('Papa')
		await wrapper.find('input[name=person-app]').setValue(true)
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		// a transient failure keeps the last view: the section stays
		expect(wrapper.find('.share-guard-section').exists()).toBe(true)
		expect(wrapper.find('.code-value').text()).toBe('ABCD-EFGH-JKMN')
		expect(wrapper.text()).toContain('This code will not be shown again.')
		await wrapper.find('.close-code').trigger('click')
		await flushPromises()
		expect(wrapper.html()).not.toContain('ABCD-EFGH-JKMN')
		expect(JSON.stringify(shareGuard)).not.toContain('ABCD-EFGH-JKMN')
	})
})

describe('the relay block', () => {
	const agree = () => document.querySelector('.relay-agree input')
	const go = () => document.querySelector('.relay-agree-go')
	const switches = () => wrapper.findAll('.relay-block .switch input')

	it('testNoRelayKeyHidesBlock: a view without relay, or with an unsupported one, draws nothing', async () => {
		await show()
		expect(wrapper.find('.relay-block').exists()).toBe(false)
		shareGuard.view = view({ relay: relay({ supported: false, filter: true, share_bans: true }) })
		await flushPromises()
		expect(wrapper.find('.relay-block').exists()).toBe(false)
		expect(wrapper.find('.share-guard-section').exists()).toBe(true)
	})

	it('shows the block whether protection is on or off', async () => {
		shareGuard.view = view({ relay: relay() })
		await show()
		expect(wrapper.find('.relay-block').exists()).toBe(true)
		expect(wrapper.text()).toContain('The relay cuts addresses known as malicious before they reach your box.')
		shareGuard.view = view({ protection: true, relay: relay() })
		await flushPromises()
		expect(wrapper.find('.relay-block').exists()).toBe(true)
	})

	it('shows the relay journal tab with box protection off', async () => {
		shareGuard.view = view({ protection: false, relay: relay() })
		await show()
		expect(wrapper.text()).toContain('Cut at the relay')
	})

	it('shows the relay block when the gateway guard is not supported', async () => {
		shareGuard.view = view({ supported: false, relay: relay() })
		await show()
		expect(wrapper.find('.relay-block').exists()).toBe(true)
	})

	it('does not talk about the protection of the box in the relay block', async () => {
		shareGuard.view = view({ relay: relay() })
		await show()
		expect(wrapper.find('.relay-block').text()).not.toContain('Protection of the box')
	})

	it('warns when bans are shared but the relay does not filter', async () => {
		shareGuard.view = view({ relay: relay({ share_bans: true, filter: false }) })
		await show()
		expect(wrapper.find('.relay-block').text()).toContain('turn filtering on to be protected by the community list')
		shareGuard.view = view({ relay: relay({ share_bans: true, filter: true }) })
		await flushPromises()
		expect(wrapper.find('.relay-block').text()).not.toContain('turn filtering on')
	})

	it('hides the community size when it is 0', async () => {
		shareGuard.view = view({ relay: relay({ community_size: 0 }) })
		await show()
		expect(wrapper.find('.relay-join-card').text()).not.toContain('already blocked')
	})

	it('says the relay has not taken a saved change yet, and draws the switches from the refreshed view', async () => {
		shareGuard.view = view({ relay: relay() })
		shareGuardApi.setRelay.mockRejectedValue({ response: { status: 500, data: { message: 'the change is saved, but the relay has not taken it yet: boom' } } })
		await show()
		shareGuardApi.view.mockImplementation(async () => answer(view({ relay: relay({ filter: false }) })))
		await switches()[0].setValue(false)
		await flushPromises()
		expect(wrapper.text()).toContain('Saved; it will reach the relay in a moment.')
		expect(switches()[0].element.checked).toBe(false)
	})

	it('testFilterSwitchCallsSetRelay', async () => {
		shareGuard.view = view({ relay: relay() })
		await show()
		await switches()[0].setValue(false)
		await flushPromises()
		expect(shareGuardApi.setRelay).toHaveBeenCalledWith({ filter: false })
	})

	it('draws the filter switch again when setRelay fails', async () => {
		shareGuard.view = view({ relay: relay() })
		shareGuardApi.setRelay.mockRejectedValue({ response: { status: 503 } })
		await show()
		await switches()[0].setValue(false)
		await flushPromises()
		expect(switches()[0].element.checked).toBe(true)
		expect(wrapper.text()).toContain('Something went wrong. Try again in a moment.')
	})

	it('testJoinNeedsTick', async () => {
		shareGuard.view = view({ relay: relay() })
		await show()
		expect(document.querySelector('.relay-agree')).toBeNull()
		await wrapper.find('.relay-join').trigger('click')
		await flushPromises()
		expect(agree().checked).toBe(false)
		expect(go().disabled).toBe(true)
		expect(document.body.textContent).toContain('You can stop at any time; your reports are then deleted from the relay.')
		agree().click()
		await flushPromises()
		expect(go().disabled).toBe(false)
		go().click()
		await flushPromises()
		expect(shareGuardApi.setRelay).toHaveBeenCalledWith({ share_bans: true, consent: true })
		expect(document.querySelector('.relay-agree')).toBeNull()
	})

	it('testEscapeDoesNotJoin, and Cancel does not either', async () => {
		shareGuard.view = view({ relay: relay() })
		await show()
		await wrapper.find('.relay-join').trigger('click')
		await flushPromises()
		agree().click()
		await flushPromises()
		document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
		await flushPromises()
		expect(shareGuardApi.setRelay).not.toHaveBeenCalled()
		expect(document.querySelector('.relay-agree')).toBeNull()
		// reopened: not ticked again
		await wrapper.find('.relay-join').trigger('click')
		await flushPromises()
		expect(agree().checked).toBe(false)
		document.querySelector('.relay-cancel').click()
		await flushPromises()
		expect(shareGuardApi.setRelay).not.toHaveBeenCalled()
	})

	it('testWaveSentenceShown', async () => {
		shareGuard.view = view({ relay: relay(), waves: [{ app: 'jellyfin', bans: 23 }] })
		await show()
		expect(wrapper.find('.relay-join-card').text()).toContain('These addresses could have been cut at the relay before reaching your box.')
		expect(wrapper.find('.relay-join-card').text()).toContain('1234 addresses already blocked by the community')
	})

	it('has no wave sentence without a wave', async () => {
		shareGuard.view = view({ relay: relay() })
		await show()
		expect(wrapper.find('.relay-join-card').text()).not.toContain('could have been cut')
	})

	it('testShareOffOneClick', async () => {
		shareGuard.view = view({ relay: relay({ share_bans: true }) })
		await show()
		expect(wrapper.find('.relay-join-card').exists()).toBe(false)
		await switches()[1].setValue(false)
		await flushPromises()
		expect(shareGuardApi.setRelay).toHaveBeenCalledWith({ share_bans: false })
		expect(document.querySelector('.dialog')).toBeNull()
	})

	it('testContributionLine', async () => {
		shareGuard.view = view({ relay: relay({ share_bans: true, contributed_month: 3 }) })
		await show()
		expect(wrapper.text()).toContain('Your reports added 3 addresses to the community list this month')
	})

	it('testRelayErrors', async () => {
		shareGuard.view = view({ relay: relay() })
		shareGuardApi.setRelay.mockRejectedValue({ response: { status: 400, data: { message: 'consent_required' } } })
		await show()
		await switches()[0].setValue(false)
		await flushPromises()
		expect(wrapper.text()).toContain('Tick the box to agree first.')
		shareGuardApi.setRelay.mockRejectedValue({ response: { status: 400, data: { message: 'relay_unsupported' } } })
		await switches()[0].setValue(false)
		await flushPromises()
		expect(wrapper.text()).toContain('The relay does not offer this yet.')
	})
})
