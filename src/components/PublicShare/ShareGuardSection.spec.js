// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareGuardSection from './ShareGuardSection.vue'
import i18n from '@/plugins/i18n'
import { publicShare } from '@/service/publicShare'
import { resetShareGuard, shareGuard, shareGuardApi } from '@/service/shareGuard'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const answer = data => ({ data: { data } })
const view = (extra = {}) => ({ supported: true, reason: '', protection: false, box: { waf: 'off', allow: [], block: [], rules_off: [], countries: { mode: 'none', list: [] }, rate_per_min: 600, ban: { waf_hits: 5, waf_window_s: 300, scan_404: 20, scan_window_s: 300, rate_strikes: 3, rate_window_s: 600, code_fails: 5, code_window_s: 900 } }, apps: { jellyfin: { access: 'code' } }, people: [], ...extra })

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
})
