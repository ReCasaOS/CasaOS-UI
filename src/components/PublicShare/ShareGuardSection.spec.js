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

	it('draws the switch off again when the notice is cancelled', async () => {
		await show()
		await flip()
		dialogButton('Cancel').click()
		await flushPromises()
		expect(shareGuardApi.setProtection).not.toHaveBeenCalled()
		expect(wrapper.find('.switch input').element.checked).toBe(false)
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
