// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RemoteAccessModal from './RemoteAccessModal.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ OFFICIAL_RELAY: 'https://relay.official.test', fleetApi: { status: vi.fn(), setRemote: vi.fn(), remote: vi.fn(), removeDevice: vi.fn(), addDevice: vi.fn() } }))
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
		window.happyDOM.setURL('http://localhost:8080/')
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
			[502, 'bad gateway', 'Relay unreachable'],
			[409, 'the relay no longer knows this box\'s network', 'The relay no longer knows this box\'s network'],
			[409, 'too many codes not used yet', 'Too many codes are not used yet'],
			[400, 'the gateway listens on this box\'s loopback only, so your phones and PCs cannot reach it: set its address to 0.0.0.0', 'The gateway only listens on this box'],
			[400, 'this box is a member of a fleet: phones and PCs are added on the master\'s dashboard', 'This box is a member of a fleet'],
			[400, 'the master runs at an address typed by hand: move it onto a relay to get remote access', 'typed by hand'],
			[409, 'remote access already runs over another relay: turn it off first', 'already runs over another relay'],
			[409, 'this box is already in another private network', 'This box is already in another private network'],
			[409, 'the relay refused: limit of boxes reached', 'The relay refused: the fleet is full'],
			[400, 'the relay no longer knows this fleet', 'The relay no longer knows this fleet: change the relay'],
			[400, 'the gateway listens on loopback only', 'set its address to 0.0.0.0 (or leave it empty) in the gateway settings'],
			[503, 'relay is full', 'try again later, or use another relay'],
		]
		for (const [status, message, shown] of cases) {
			fleetApi.setRemote.mockImplementation(() => refusal(status, message))
			await button('Turn remote access on').trigger('click')
			await flushPromises()
			expect(wrapper.text()).toContain(shown)
		}
	})

	describe('devices and boxes', () => {
		const LIST = { relay: 'r', addr: '100.64.0.7', devices: [{ id: 'd1', hostname: 'phone-gary', ip: '100.64.0.9', online: true, last_seen: '2026-11-07T10:00:00Z' }, { id: 'd2', hostname: 'old-pc', ip: '100.64.0.10', online: false, last_seen: '' }] }

		beforeEach(() => {
			fleetApi.status.mockReturnValue(answer(ON))
			fleetApi.remote.mockReturnValue(answer(LIST))
			fleetApi.removeDevice.mockReturnValue(answer({}))
		})
		afterEach(() => vi.useRealTimers())

		it('asks the relay once', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
			await open()
			expect(fleetApi.remote).toHaveBeenCalledTimes(1)
			vi.advanceTimersByTime(10 * 60 * 1000)
			await flushPromises()
			expect(fleetApi.remote).toHaveBeenCalledTimes(1)
		})

		it('does not ask the relay while off', async () => {
			fleetApi.status.mockReturnValue(answer(NONE))
			await open()
			expect(fleetApi.remote).not.toHaveBeenCalled()
		})

		it('lists devices and removes one after confirming', async () => {
			await open()
			expect(wrapper.text()).toContain('phone-gary')
			expect(wrapper.text()).toContain('old-pc')
			expect(wrapper.text()).toContain('Offline')
			await button('Remove').trigger('click')
			await flushPromises()
			expect(document.body.textContent).toContain('phone-gary will no longer reach this box.')
			dialogButton('Cancel').click()
			await flushPromises()
			expect(fleetApi.removeDevice).not.toHaveBeenCalled()
			await button('Remove').trigger('click')
			await flushPromises()
			dialogButton('Remove').click()
			await flushPromises()
			expect(fleetApi.removeDevice).toHaveBeenCalledWith('d1')
			expect(fleetApi.remote).toHaveBeenCalledTimes(2)
		})

		it('says so when there is no device', async () => {
			fleetApi.remote.mockReturnValue(answer({ relay: 'r', addr: 'a', devices: [] }))
			await open()
			expect(wrapper.text()).toContain('No phone or PC yet.')
		})

		it('shows device names as text', async () => {
			fleetApi.remote.mockReturnValue(answer({ ...LIST, devices: [{ id: 'x', hostname: '<img src=x onerror=alert(1)>', online: true }] }))
			await open()
			expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
			expect(wrapper.find('img').exists()).toBe(false)
		})

		it('lists the boxes of a master with their addresses', async () => {
			fleetApi.status.mockReturnValue(answer(MASTER_ON))
			fleetApi.remote.mockReturnValue(answer({ ...LIST, boxes: [{ id: 'b1', name: 'salon', addr: '100.64.0.20', online: true }, { id: 'b2', name: 'cave', addr: '', online: false }] }))
			await open()
			expect(wrapper.text()).toContain('salon')
			expect(wrapper.text()).toContain('http://100.64.0.20')
			expect(wrapper.text()).toContain('cave')
			expect(wrapper.text()).toContain('not on the private network')
			const copy = (await import('clipboard-copy')).default
			await wrapper.find('.box-copy').trigger('click')
			expect(copy).toHaveBeenCalledWith('http://100.64.0.20')
		})

		it('escapes a hostile name in the remove dialog', async () => {
			fleetApi.remote.mockReturnValue(answer({ ...LIST, devices: [{ id: 'x', hostname: '<img src=x onerror=alert(1)>', online: true }] }))
			await open()
			await button('Remove').trigger('click')
			await flushPromises()
			expect(document.body.querySelector('img')).toBeNull()
			expect(document.body.querySelector('.dialog').textContent).toContain('<img src=x onerror=alert(1)> will no longer reach this box.')
		})

		it('forgets the list when remote access is turned off', async () => {
			fleetApi.setRemote.mockReturnValue(answer({}))
			await open()
			await button('Turn remote access off').trigger('click')
			await flushPromises()
			fleetApi.status.mockReturnValue(answer(NONE))
			dialogButton('Turn off').click()
			await flushPromises()
			fleetApi.status.mockReturnValue(answer(ON))
			fleetApi.remote.mockReturnValue(new Promise(() => {}))
			await button('Turn remote access on').trigger('click')
			await flushPromises()
			expect(wrapper.text()).not.toContain('phone-gary')
		})

		it('shows this box with the gateway port, as a link, and the others without', async () => {
			fleetApi.status.mockReturnValue(answer(MASTER_ON))
			fleetApi.remote.mockReturnValue(answer({ ...LIST, boxes: [{ id: 'b0', name: 'master', addr: '100.64.0.1', online: true }, { id: 'b1', name: 'salon', addr: '100.64.0.8', online: true }] }))
			await open()
			const copy = (await import('clipboard-copy')).default
			const hrefs = wrapper.findAll('a[target=_blank]').map(a => [a.attributes('href'), a.attributes('rel'), a.text()])
			expect(hrefs).toEqual([
				['http://100.64.0.1:8080', 'noopener noreferrer', 'http://100.64.0.1:8080'],
				['http://100.64.0.1:8080', 'noopener noreferrer', 'http://100.64.0.1:8080'],
				['http://100.64.0.8', 'noopener noreferrer', 'http://100.64.0.8'],
			])
			await wrapper.findAll('.box-copy')[1].trigger('click')
			expect(copy).toHaveBeenCalledWith('http://100.64.0.8')
			await wrapper.findAll('.box-copy')[0].trigger('click')
			expect(copy).toHaveBeenCalledWith('http://100.64.0.1:8080')
		})

		it('shows no address line without an address, and no port when the page has none', async () => {
			window.happyDOM.setURL('https://box.example/')
			fleetApi.status.mockReturnValue(answer({ ...ON, remote: { ...ON.remote, addr: '' } }))
			await open()
			expect(wrapper.text()).not.toContain('Address of this box')
			expect(wrapper.text()).not.toContain('http://')
			wrapper.unmount()
			fleetApi.status.mockReturnValue(answer(ON))
			await open()
			expect(wrapper.find('a[target=_blank]').attributes('href')).toBe('https://100.64.0.7')
		})

		it('names what each copy button copies and says the copy failed generically', async () => {
			const copy = (await import('clipboard-copy')).default
			fleetApi.status.mockReturnValue(answer(MASTER_ON))
			fleetApi.remote.mockReturnValue(answer({ ...LIST, boxes: [{ id: 'b1', name: 'salon', addr: '100.64.0.8', online: true }] }))
			await open()
			expect(wrapper.find('[aria-label="Copy this box\'s address"]').exists()).toBe(true)
			expect(wrapper.find('[aria-label="Copy salon\'s address"]').exists()).toBe(true)
			copy.mockImplementationOnce(() => Promise.reject(new Error('denied')))
			await wrapper.find('.box-copy').trigger('click')
			await flushPromises()
			expect(wrapper.text()).toContain('This could not be copied')
			await wrapper.find('.box-copy').trigger('click')
			await flushPromises()
			expect(wrapper.find('.box-copy').text()).toBe('Copied')
		})

		it('keeps the list when turning off fails', async () => {
			fleetApi.setRemote.mockImplementation(() => refusal(500, 'boom'))
			await open()
			await button('Turn remote access off').trigger('click')
			await flushPromises()
			dialogButton('Turn off').click()
			await flushPromises()
			expect(wrapper.text()).toContain('phone-gary')
		})

		it('refreshes on demand', async () => {
			await open()
			await button('Refresh').trigger('click')
			await flushPromises()
			expect(fleetApi.remote).toHaveBeenCalledTimes(2)
		})

		it('shows the relay error when the list cannot be read', async () => {
			fleetApi.remote.mockImplementation(() => refusal(409, 'the relay no longer knows this box\'s network'))
			await open()
			expect(wrapper.text()).toContain('The relay no longer knows this box')
			expect(wrapper.text()).toContain('Address of this box: http://100.64.0.7')
			expect(button('Refresh')).toBeTruthy()
		})
	})

	describe('adding a device', () => {
		const NOW = new Date('2026-11-07T12:00:00Z')
		const LIST = { relay: 'r', addr: '100.64.0.7', devices: [] }
		const code = (secs = 600) => ({ code: 'ABCD-2345', expires_at: new Date(NOW.getTime() + secs * 1000).toISOString() })

		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
			vi.setSystemTime(NOW)
			fleetApi.status.mockReturnValue(answer(ON))
			fleetApi.remote.mockReturnValue(answer(LIST))
			fleetApi.addDevice.mockReturnValue(answer(code()))
		})
		afterEach(() => vi.useRealTimers())

		const add = async () => {
			await open()
			await button('Add a phone or PC').trigger('click')
			await flushPromises()
		}

		it('shows the code and the steps', async () => {
			await add()
			expect(wrapper.text()).toContain('ABCD-2345')
			expect(wrapper.text()).toContain('valid for 10:00')
			expect(wrapper.text()).toContain('https://relay.official.test')
			expect(wrapper.text()).toContain('"Use a custom coordination server"')
			expect(wrapper.text()).toContain('Already using the Tailscale app for another network?')
			await button('Windows').trigger('click')
			expect(wrapper.text()).toContain('tailscale login --login-server=https://relay.official.test')
			await button('Android').trigger('click')
			expect(wrapper.text()).toContain('"Use an alternate server"')
			await button('Mac').trigger('click')
			expect(wrapper.text()).toContain('Custom Login Server')
		})

		it('expires the code locally', async () => {
			await add()
			vi.advanceTimersByTime(599 * 1000)
			await flushPromises()
			expect(wrapper.text()).toContain('valid for 00:01')
			vi.advanceTimersByTime(2 * 1000)
			await flushPromises()
			expect(wrapper.text()).toContain('This code has expired.')
			expect(wrapper.find('[role=status]').text()).toBe('This code has expired.')
			expect(fleetApi.addDevice).toHaveBeenCalledTimes(1)
			expect(fleetApi.remote).toHaveBeenCalledTimes(1)
			fleetApi.addDevice.mockReturnValue(answer({ code: 'WXYZ-6789', expires_at: new Date(Date.now() + 600 * 1000).toISOString() }))
			await button('New code').trigger('click')
			await flushPromises()
			expect(fleetApi.addDevice).toHaveBeenCalledTimes(2)
			expect(wrapper.text()).toContain('WXYZ-6789')
			expect(wrapper.text()).not.toContain('This code has expired.')
		})

		it('copies the code', async () => {
			const copy = (await import('clipboard-copy')).default
			await add()
			await wrapper.find('.remote-code-copy').trigger('click')
			await flushPromises()
			expect(copy).toHaveBeenCalledWith('ABCD-2345')
		})

		it('reloads the devices once when done', async () => {
			await add()
			await button('Done').trigger('click')
			await flushPromises()
			expect(wrapper.text()).not.toContain('ABCD-2345')
			expect(fleetApi.remote).toHaveBeenCalledTimes(2)
		})

		it('clears its timer when closed', async () => {
			await open()
			vi.clearAllTimers() // Buefy's own transition timers are not ours
			await button('Add a phone or PC').trigger('click')
			await flushPromises()
			expect(vi.getTimerCount()).toBe(1)
			wrapper.unmount()
			wrapper = null
			expect(vi.getTimerCount()).toBe(0)
		})

		it('copies the relay address', async () => {
			const copy = (await import('clipboard-copy')).default
			await add()
			await wrapper.find('.remote-relay-copy').trigger('click')
			expect(copy).toHaveBeenCalledWith('https://relay.official.test')
			await button('Windows').trigger('click')
			await wrapper.find('.remote-relay-copy').trigger('click')
			expect(copy).toHaveBeenCalledWith('tailscale login --login-server=https://relay.official.test')
		})

		it('starts no timer when closed while the code is pending', async () => {
			await open()
			vi.clearAllTimers()
			let resolve
			fleetApi.addDevice.mockReturnValue(new Promise(r => (resolve = r)))
			await button('Add a phone or PC').trigger('click')
			wrapper.unmount()
			wrapper = null
			resolve({ data: { data: code() } })
			await flushPromises()
			expect(vi.getTimerCount()).toBe(0)
		})

		it('stays closed when done is pressed while a new code is pending', async () => {
			await add()
			vi.advanceTimersByTime(601 * 1000)
			await flushPromises()
			let resolve
			fleetApi.addDevice.mockReturnValue(new Promise(r => (resolve = r)))
			await button('New code').trigger('click')
			await button('Done').trigger('click')
			resolve({ data: { data: code() } })
			await flushPromises()
			expect(wrapper.text()).not.toContain('ABCD-2345')
			expect(vi.getTimerCount()).toBe(0)
		})

		it('says so when there are too many codes', async () => {
			fleetApi.addDevice.mockImplementation(() => refusal(409, 'too many codes not used yet'))
			await add()
			expect(wrapper.text()).toContain('Too many codes are not used yet')
			expect(wrapper.text()).not.toContain('valid for')
		})
	})
})
