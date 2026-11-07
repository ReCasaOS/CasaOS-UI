// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RemoteAccessModal from './RemoteAccessModal.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ OFFICIAL_RELAY: 'https://relay.official.test', fleetApi: { status: vi.fn(), setRemote: vi.fn() } }))
vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))

const answer = data => Promise.resolve({ data: { success: 200, data } })
const refusal = (status, message) => Promise.reject(Object.assign(new Error(String(status)), { response: { status, data: { success: false, message } } }))
const NONE = { role: 'none', master: null, member: null, default_relay: 'https://relay.official.test' }
const ON = { role: 'none', master: null, member: null, remote: { relay: 'https://relay.official.test', addr: '100.64.0.7', connected: true, error: '', alone: true } }
const MASTER_ON = { role: 'master', master: { address: 'https://m', boxes: [], relay: 'https://r' }, member: null, remote: { relay: 'https://r', addr: '100.64.0.1', connected: true, error: '', alone: false } }

let wrapper
async function open() {
	wrapper = mount(RemoteAccessModal, { attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $EventBus: { $emit: vi.fn(), $on: vi.fn(), $off: vi.fn() } } } })
	await flushPromises()
	return wrapper
}
const button = label => wrapper.findAll('button').find(b => b.text() === label)
const dialogButton = label => [...document.querySelectorAll('.dialog button')].find(b => b.textContent.includes(label))

describe('the Remote access window', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		fleetApi.status.mockReturnValue(answer(NONE))
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('turns remote access on with the official relay', async () => {
		await open()
		expect(wrapper.find('input[name=relay]').element.value).toBe('https://relay.official.test')
		fleetApi.setRemote.mockReturnValue(answer({}))
		fleetApi.status.mockReturnValue(answer(ON))
		await button('Turn remote access on').trigger('click')
		await flushPromises()
		expect(fleetApi.setRemote).toHaveBeenCalledWith({ enabled: true, relay: 'https://relay.official.test' })
		expect(wrapper.text()).toContain('Address of this box: http://100.64.0.7')
	})

	it('refuses a relay that is not https', async () => {
		await open()
		await wrapper.find('input[name=relay]').setValue('http://relay.example')
		await button('Turn remote access on').trigger('click')
		expect(fleetApi.setRemote).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('The relay must start with https://')
	})

	it('shows the address and turns off after confirming', async () => {
		fleetApi.status.mockReturnValue(answer(ON))
		fleetApi.setRemote.mockReturnValue(answer({}))
		await open()
		expect(wrapper.text()).toContain('Address of this box: http://100.64.0.7')
		await button('Turn remote access off').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('Your phones and PCs lose access to this box.')
		dialogButton('Cancel').click()
		await flushPromises()
		expect(fleetApi.setRemote).not.toHaveBeenCalled()
		await button('Turn remote access off').trigger('click')
		await flushPromises()
		fleetApi.status.mockReturnValue(answer(NONE))
		dialogButton('Turn off').click()
		await flushPromises()
		expect(fleetApi.setRemote).toHaveBeenCalledWith({ enabled: false })
		expect(button('Turn remote access on')).toBeTruthy()
	})

	it('has no off button on a master', async () => {
		fleetApi.status.mockReturnValue(answer(MASTER_ON))
		await open()
		expect(button('Turn remote access off')).toBeUndefined()
		expect(wrapper.text()).toContain('Remote access comes with the master role: disabling the master turns it off.')
	})

	it('points a member to the master', async () => {
		fleetApi.status.mockReturnValue(answer({ role: 'member', master: null, member: {} }))
		await open()
		expect(wrapper.text()).toContain('Phones and PCs are added on the master\'s dashboard.')
		expect(button('Turn remote access on')).toBeUndefined()
	})

	it('tells an advanced master to move to a relay', async () => {
		fleetApi.status.mockReturnValue(answer({ role: 'master', master: { address: 'https://m', boxes: [] }, member: null }))
		await open()
		expect(wrapper.text()).toContain('The master runs at an address typed by hand')
		expect(button('Turn remote access on')).toBeUndefined()
	})

	it('shows an update hint on an older core', async () => {
		await open()
		fleetApi.setRemote.mockImplementation(() => refusal(404, 'not found'))
		await button('Turn remote access on').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('This box\'s system is too old for remote access: update it first')
	})

	it('translates the relay errors', async () => {
		await open()
		const cases = [
			[409, 'the relay does not offer remote access yet', 'This relay does not offer remote access yet'],
			[503, 'relay is full', 'The relay is full'],
			[429, 'slow down', 'The relay is busy, try again later'],
		]
		for (const [status, message, shown] of cases) {
			fleetApi.setRemote.mockImplementation(() => refusal(status, message))
			await button('Turn remote access on').trigger('click')
			await flushPromises()
			expect(wrapper.text()).toContain(shown)
		}
	})
})
