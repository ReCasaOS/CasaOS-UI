// @vitest-environment happy-dom
import Buefy from 'buefy'
import copy from 'clipboard-copy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FleetModal from './FleetModal.vue'
import AddBoxDialog from '@/components/Fleet/AddBoxDialog.vue'
import { forgetFleet, openFleet } from '@/components/Fleet/entry'
import events from '@/events/events'
import { fleetApi } from '@/service/fleet'
import { readLeaveWarning } from '@/service/publicShare'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ OFFICIAL_RELAY: 'https://relay.official.test', fleetApi: { status: vi.fn(), setMaster: vi.fn(), setRelay: vi.fn(), join: vi.fn(), leave: vi.fn(), addBox: vi.fn(), rotateCode: vi.fn() } }))
vi.mock('@/service/publicShare', () => ({ readLeaveWarning: vi.fn() }))
vi.mock('@/components/Fleet/entry', () => ({ forgetFleet: vi.fn(), openFleet: vi.fn() }))
vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))

const answer = data => Promise.resolve({ data: { success: 200, data } })
const NONE = { role: 'none', master: null, member: null, default_relay: 'https://relay.official.test' }
// an older core: no default_relay, no relay
const OLD_NONE = { role: 'none', master: null, member: null }
const MASTER = { role: 'master', master: { address: 'https://m.example', boxes: [{ id: 'a', name: 'Home' }, { id: 'b', name: 'Shop' }] }, member: null }
const RELAY_MASTER = { ...MASTER, relay: 'https://relay.mine.example', net: { connected: true, addr: '100.64.0.1' } }
const refusal = (status, message) => Promise.reject(Object.assign(new Error(String(status)), { response: { status, data: { success: false, message } } }))
const member = fields => ({ role: 'member', master: null, member: { master_url: 'https://m.example', connected: true, since: '2026-11-02T10:00:00Z', last_error: '', ...fields } })

let wrapper
let bus
async function open(component = FleetModal, props = {}) {
	bus = { $emit: vi.fn(), $on: vi.fn(), $off: vi.fn() }
	wrapper = mount(component, { props, attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $EventBus: bus, $store: { state: { appLaunchInIframe: true, appLaunchExceptions: [] } } } } })
	await flushPromises()
	return wrapper
}
const button = label => wrapper.findAll('button').find(b => b.text() === label)
const dialogButton = label => [...document.querySelectorAll('.dialog button')].find(b => b.textContent.includes(label))
const pick = role => wrapper.find(`input[type=radio][value=${role}]`).setValue(true)
const field = name => wrapper.find(`input[name=${name}]`)
const advanced = () => wrapper.find('input[type=checkbox]').setValue(true)

describe('the Fleet settings', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		fleetApi.status.mockReturnValue(answer(NONE))
		readLeaveWarning.mockResolvedValue('')
		fleetApi.addBox.mockReturnValue(answer({ box: { id: 's', self: true }, code: 'ENROL-self' }))
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('joins with the pasted code and shows connected', async () => {
		await open()
		await pick('member')
		await wrapper.find('textarea').setValue('  ENROL-abc  ')
		fleetApi.join.mockReturnValue(answer({}))
		fleetApi.status.mockReturnValue(answer(member()))
		await button('Join').trigger('click')
		await flushPromises()
		expect(fleetApi.join).toHaveBeenCalledWith('ENROL-abc')
		expect(wrapper.text()).toContain('Connected since')
		expect(wrapper.text()).toContain('https://m.example')
		expect(forgetFleet).toHaveBeenCalled()
		expect(bus.$emit).toHaveBeenCalledWith(events.FLEET_CHANGED)
	})

	it('asks before joining when remote access is on', async () => {
		await open()
		await pick('member')
		await wrapper.find('textarea').setValue('ENROL-abc')
		fleetApi.join.mockImplementationOnce(() => refusal(409, 'this box has remote access: joining a fleet turns it off and its phones and PCs lose access; confirm to go on'))
		await button('Join').trigger('click')
		await flushPromises()
		expect(fleetApi.join).toHaveBeenCalledTimes(1)
		expect(document.body.textContent).toContain('Join this fleet and turn remote access off?')
		expect(document.body.textContent).toContain('Your phones and PCs lose access to this box. Add them again on the master afterwards.')
		fleetApi.join.mockReturnValue(answer({}))
		fleetApi.status.mockReturnValue(answer(member()))
		dialogButton('Join').click()
		await flushPromises()
		expect(fleetApi.join).toHaveBeenCalledTimes(2)
		expect(fleetApi.join).toHaveBeenLastCalledWith('ENROL-abc', { leaveRemote: true })
	})

	it('reloads the status and tells the app when the confirmed join fails', async () => {
		await open()
		await pick('member')
		await wrapper.find('textarea').setValue('ENROL-abc')
		fleetApi.join.mockImplementationOnce(() => refusal(409, 'this box has remote access: joining a fleet turns it off and its phones and PCs lose access; confirm to go on'))
		await button('Join').trigger('click')
		await flushPromises()
		fleetApi.join.mockImplementationOnce(() => refusal(502, 'bad gateway'))
		bus.$emit.mockClear()
		fleetApi.status.mockClear()
		dialogButton('Join').click()
		await flushPromises()
		expect(fleetApi.status).toHaveBeenCalledTimes(1)
		expect(bus.$emit).toHaveBeenCalledWith(events.FLEET_CHANGED)
		expect(wrapper.text()).toContain('Relay unreachable')
	})

	it('shows the Join button loading while the first join is pending', async () => {
		await open()
		await pick('member')
		await wrapper.find('textarea').setValue('ENROL-abc')
		let release
		fleetApi.join.mockImplementationOnce(() => new Promise((resolve) => {
			release = resolve
		}))
		await button('Join').trigger('click')
		await flushPromises()
		const join = wrapper.findAll('button').find(b => b.text() === 'Join')
		expect(join.classes()).toContain('is-loading')
		fleetApi.status.mockReturnValue(answer(member()))
		release({ data: { success: 200, data: {} } })
		await flushPromises()
	})

	it('sends nothing more and keeps the code when the join is cancelled', async () => {
		await open()
		await pick('member')
		await wrapper.find('textarea').setValue('ENROL-abc')
		fleetApi.join.mockImplementationOnce(() => refusal(409, 'this box has remote access: joining a fleet turns it off and its phones and PCs lose access; confirm to go on'))
		await button('Join').trigger('click')
		await flushPromises()
		dialogButton('Cancel').click()
		await flushPromises()
		expect(fleetApi.join).toHaveBeenCalledTimes(1)
		expect(wrapper.find('textarea').element.value).toBe('ENROL-abc')
	})

	it('warns that devices go with the master', async () => {
		fleetApi.status.mockReturnValue(answer({ ...MASTER, remote: { relay: 'https://relay.official.test', connected: true } }))
		await open()
		await button('Disable the master role').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('The list of boxes is erased.')
		expect(document.body.textContent).toContain('Your phones and PCs lose remote access too.')
	})

	it('proposes the remote access relay when enabling the master', async () => {
		fleetApi.status.mockReturnValue(answer({ ...NONE, remote: { relay: 'https://relay.remote.example', alone: true } }))
		await open()
		await pick('master')
		expect(field('relay').element.value).toBe('https://relay.remote.example')
	})

	it('warns before leaving the fleet when apps are shared', async () => {
		fleetApi.status.mockReturnValue(answer(member()))
		readLeaveWarning.mockResolvedValue('The public addresses of your shared apps stop answering, and the name mybox is released.')
		await open()
		await button('Leave the fleet').trigger('click')
		await flushPromises()
		expect(document.querySelector('.dialog').textContent).toContain('The public addresses of your shared apps stop answering, and the name mybox is released.')
	})

	it('warns before disabling the master', async () => {
		fleetApi.status.mockReturnValue(answer(MASTER))
		readLeaveWarning.mockResolvedValue('The public name mybox is released.')
		await open()
		await button('Disable the master role').trigger('click')
		await flushPromises()
		expect(document.querySelector('.dialog').textContent).toContain('The public name mybox is released.')
	})

	it('warns before changing the relay', async () => {
		fleetApi.status.mockReturnValue(answer(RELAY_MASTER))
		readLeaveWarning.mockResolvedValue('The public addresses of your shared apps stop answering, and the name mybox is released.')
		await open()
		await button('Change the relay').trigger('click')
		await flushPromises()
		expect(document.querySelector('.dialog').textContent).toContain('the name mybox is released.')
	})

	it('warns before joining a fleet and turning remote access off', async () => {
		fleetApi.status.mockReturnValue(answer(NONE))
		fleetApi.join.mockImplementation(() => refusal(409, 'this box has remote access: turn it off first'))
		readLeaveWarning.mockResolvedValue('The public addresses of your shared apps stop answering, and the name mybox is released.')
		await open()
		await pick('member')
		await wrapper.find('textarea').setValue('ENROL-abc')
		await button('Join').trigger('click')
		await flushPromises()
		await flushPromises()
		expect(document.querySelector('.dialog').textContent).toContain('the name mybox is released.')
	})

	it('opens one dialog when Leave is clicked twice while the warning is read', async () => {
		fleetApi.status.mockReturnValue(answer(member()))
		let release
		readLeaveWarning.mockReturnValue(new Promise(resolve => (release = resolve)))
		await open()
		const b = button('Leave the fleet')
		b.element.click()
		b.element.click()
		release('')
		await flushPromises()
		expect(document.querySelectorAll('.dialog')).toHaveLength(1)
	})

	it('opens one dialog and joins once when Join is clicked twice', async () => {
		fleetApi.status.mockReturnValue(answer(NONE))
		fleetApi.join.mockImplementation(() => refusal(409, 'this box has remote access: turn it off first'))
		let release
		readLeaveWarning.mockReturnValue(new Promise(resolve => (release = resolve)))
		await open()
		await pick('member')
		await wrapper.find('textarea').setValue('ENROL-abc')
		const b = button('Join')
		b.element.click()
		await flushPromises()
		b.element.click()
		release('')
		await flushPromises()
		expect(fleetApi.join).toHaveBeenCalledTimes(1)
		expect(document.querySelectorAll('.dialog')).toHaveLength(1)
	})

	it('shows the public name as text, never as HTML, when leaving', async () => {
		fleetApi.status.mockReturnValue(answer(member()))
		readLeaveWarning.mockResolvedValue('The public name <b id="x">m</b> is released.')
		await open()
		await button('Leave the fleet').trigger('click')
		await flushPromises()
		expect(document.querySelector('.dialog #x')).toBeNull()
		expect(document.querySelector('.dialog').textContent).toContain('<b id="x">m</b>')
	})

	it('asks as before when the share status cannot be read', async () => {
		fleetApi.status.mockReturnValue(answer(member()))
		await open()
		await button('Leave the fleet').trigger('click')
		await flushPromises()
		expect(document.querySelector('.dialog').textContent).toContain('This box forgets its master and stops answering it.')
		expect(document.querySelector('.dialog').textContent).not.toContain('released')
	})

	it('leaves after confirming', async () => {
		fleetApi.status.mockReturnValue(answer(member()))
		fleetApi.leave.mockReturnValue(answer({}))
		await open()
		await button('Leave the fleet').trigger('click')
		await flushPromises()
		expect(fleetApi.leave).not.toHaveBeenCalled()
		expect(document.body.textContent).toContain('This box forgets its master and stops answering it.')
		fleetApi.status.mockReturnValue(answer(NONE))
		dialogButton('Leave').click()
		await flushPromises()
		expect(fleetApi.leave).toHaveBeenCalledTimes(1)
		expect(wrapper.text()).not.toContain('Connected since')
		expect(bus.$emit).toHaveBeenCalledWith(events.FLEET_CHANGED)
	})

	it('enables the master with the relay and no address', async () => {
		await open()
		await pick('master')
		expect(field('relay').element.value).toBe('https://relay.official.test')
		expect(wrapper.text()).toContain('The official ReCasaOS relay unless you run your own')
		fleetApi.setMaster.mockReturnValue(answer({}))
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: true, relay: 'https://relay.official.test' })
		// the master is in its own fleet at once
		expect(fleetApi.addBox).toHaveBeenCalledWith({ name: window.location.hostname, url: '', self: true })
		fleetApi.setMaster.mockClear()
		await pick('master')
		await field('relay').setValue('  https://relay.mine.example  ')
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: true, relay: 'https://relay.mine.example' })
	})

	it('stays master and says so when the master cannot add itself', async () => {
		await open()
		await pick('master')
		fleetApi.setMaster.mockReturnValue(answer({}))
		fleetApi.addBox.mockImplementation(() => refusal(400, 'gateway address is not local'))
		fleetApi.status.mockReturnValue(answer(MASTER))
		await button('Enable').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('This box could not add itself to its fleet: gateway address is not local')
		expect(bus.$emit).toHaveBeenCalledWith(events.FLEET_CHANGED)
	})

	it('does not add itself when the master role is refused', async () => {
		await open()
		await pick('master')
		fleetApi.setMaster.mockImplementation(() => refusal(502, 'relay down'))
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.addBox).not.toHaveBeenCalled()
	})

	it('says what the relay sees, and offers the official relay again once the field was changed', async () => {
		await open()
		await pick('master')
		expect(wrapper.text()).toContain('never what they exchange')
		expect(button('Use the official relay')).toBeUndefined()
		await field('relay').setValue('https://relay.mine.example')
		await button('Use the official relay').trigger('click')
		expect(field('relay').element.value).toBe('https://relay.official.test')
		expect(button('Use the official relay')).toBeUndefined()
		// a trailing slash is still the official relay
		await field('relay').setValue('https://relay.official.test/')
		expect(button('Use the official relay')).toBeUndefined()
	})

	it('offers the official relay again next to the field of a master over another relay', async () => {
		fleetApi.status.mockReturnValue(answer({ ...RELAY_MASTER, default_relay: 'https://relay.official.test' }))
		await open()
		await button('Use the official relay').trigger('click')
		expect(field('relay').element.value).toBe('https://relay.official.test')
	})

	it('shows the old address flow when the core reports neither default_relay nor relay', async () => {
		fleetApi.status.mockReturnValue(answer(OLD_NONE))
		await open()
		await pick('master')
		expect(field('relay').exists()).toBe(false)
		expect(wrapper.find('input[type=checkbox]').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('Advanced settings')
		await field('address').setValue('https://m.example')
		fleetApi.setMaster.mockReturnValue(answer({}))
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: true, address: 'https://m.example' })
	})

	it('uses the default relay announced by the core', async () => {
		fleetApi.status.mockReturnValue(answer({ ...NONE, default_relay: 'https://relay.core.example' }))
		await open()
		await pick('master')
		expect(field('relay').element.value).toBe('https://relay.core.example')
		fleetApi.setMaster.mockReturnValue(answer({}))
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: true, relay: 'https://relay.core.example' })
	})

	it('shows the address field only under advanced settings', async () => {
		await open()
		await pick('master')
		expect(field('address').exists()).toBe(false)
		expect(wrapper.text()).toContain('Advanced settings')
		await advanced()
		expect(field('address').exists()).toBe(true)
		// an empty address under advanced settings still goes through the relay
		fleetApi.setMaster.mockReturnValue(answer({}))
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: true, relay: 'https://relay.official.test' })
	})

	it('shows the address field when the core reports no relay', async () => {
		// a master on an older core, or in advanced mode: its address as before, nothing about a relay
		fleetApi.status.mockReturnValue(answer(MASTER))
		await open()
		expect(wrapper.text()).toContain('Address the boxes join it at: https://m.example')
		expect(wrapper.text()).not.toContain('Relay server')
		expect(button('Change the relay')).toBeUndefined()
		// and an older core is still enabled with an address, sent as before without a relay
		wrapper.unmount()
		fleetApi.status.mockReturnValue(answer(OLD_NONE))
		await open()
		await pick('master')
		await field('address').setValue('https://m.example')
		fleetApi.setMaster.mockReturnValue(answer({}))
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: true, address: 'https://m.example' })
	})

	it('rejects a relay that does not start with https://', async () => {
		await open()
		await pick('master')
		await field('relay').setValue('http://relay.example')
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('The relay must start with https://')
	})

	it('enables the master with its address and refuses an address without https', async () => {
		await open()
		await pick('master')
		await advanced()
		await field('address').setValue('http://m.example')
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('The address must start with https://')
		fleetApi.setMaster.mockReturnValue(answer({}))
		fleetApi.status.mockReturnValue(answer(MASTER))
		await field('address').setValue('https://m.example')
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: true, address: 'https://m.example' })
		expect(wrapper.text()).toContain('2 boxes in the fleet')
		expect(forgetFleet).toHaveBeenCalled()
		await button('Open the Fleet page').trigger('click')
		expect(openFleet).toHaveBeenCalledTimes(1)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('disabling asks and erases', async () => {
		fleetApi.status.mockReturnValue(answer(MASTER))
		fleetApi.setMaster.mockReturnValue(answer({}))
		await open()
		await button('Disable the master role').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('The list of boxes is erased.')
		fleetApi.status.mockReturnValue(answer(NONE))
		dialogButton('Disable').click()
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: false, address: 'https://m.example' })
		expect(wrapper.text()).not.toContain('boxes in the fleet')
	})

	it('says when the master refuses the box, or cannot be reached', async () => {
		fleetApi.status.mockReturnValue(answer(member({ connected: false, last_error: 'unauthorized' })))
		await open()
		expect(wrapper.text()).toContain('Refused by the master')
		wrapper.unmount()
		fleetApi.status.mockReturnValue(answer(member({ connected: false, last_error: 'dial tcp: i/o timeout' })))
		await open()
		expect(wrapper.text()).toContain('Not connected: dial tcp: i/o timeout')
	})

	it('does not take a master that is down for a refusal', async () => {
		fleetApi.status.mockReturnValue(answer(member({ connected: false, last_error: 'dial tcp 10.0.0.1:443: connect: connection refused' })))
		await open()
		expect(wrapper.text()).toContain('Not connected: dial tcp 10.0.0.1:443: connect: connection refused')
		expect(wrapper.text()).not.toContain('Refused by the master')
		wrapper.unmount()
		fleetApi.status.mockReturnValue(answer(member({ connected: false, last_error: 'refused by the master' })))
		await open()
		expect(wrapper.text()).toContain('Refused by the master')
	})

	it('shows the relay and the private-network address when master', async () => {
		fleetApi.status.mockReturnValue(answer(RELAY_MASTER))
		await open()
		expect(wrapper.text()).toContain('Relay server: https://relay.mine.example')
		expect(wrapper.text()).toContain('Address on the private network: 100.64.0.1')
	})

	it('shows connected/not connected for a member from net.connected', async () => {
		fleetApi.status.mockReturnValue(answer({ ...member(), relay: 'https://relay.mine.example', net: { connected: true } }))
		await open()
		expect(wrapper.text()).toContain('Connected to the private network')
		expect(wrapper.text()).not.toContain('Not connected to the private network')
		wrapper.unmount()
		fleetApi.status.mockReturnValue(answer({ ...member(), relay: 'https://relay.mine.example', net: { connected: false, error: '<b>tailscale down</b>' } }))
		await open()
		expect(wrapper.text()).toContain('Not connected to the private network: <b>tailscale down</b>')
		expect(wrapper.find('.fleet-settings-modal b').exists()).toBe(false)
		// no relay, no line about a private network
		wrapper.unmount()
		fleetApi.status.mockReturnValue(answer(member()))
		await open()
		expect(wrapper.text()).not.toContain('private network')
	})

	it('renders relay errors as text', async () => {
		fleetApi.setMaster.mockImplementation(() => refusal(400, '<script>window.hacked = 1</script><img src=x onerror="window.hacked = 2">'))
		await open()
		await pick('master')
		await button('Enable').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('<script>window.hacked = 1</script>')
		expect(wrapper.html()).toContain('&lt;script&gt;')
		expect(wrapper.find('script').exists()).toBe(false)
		expect(wrapper.find('img').exists()).toBe(false)
		expect(window.hacked).toBeUndefined()
	})

	it('confirm text mentions the relay when one is set', async () => {
		fleetApi.status.mockReturnValue(answer(RELAY_MASTER))
		fleetApi.setMaster.mockReturnValue(answer({}))
		await open()
		await button('Disable the master role').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('Disabling the master also deletes the fleet at the relay')
		fleetApi.status.mockReturnValue(answer(NONE))
		dialogButton('Disable').click()
		await flushPromises()
		expect(fleetApi.setMaster).toHaveBeenCalledWith({ enabled: false, address: 'https://m.example' })
		// without a relay, the old warning only
		wrapper.unmount()
		document.body.innerHTML = ''
		fleetApi.status.mockReturnValue(answer(MASTER))
		await open()
		await button('Disable the master role').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('The list of boxes is erased.')
		expect(document.body.textContent).not.toContain('at the relay')
	})

	it('maps 409 other network to a readable message', async () => {
		const tries = [
			[409, 'this box is already in another private network', 'This box is already in another private network'],
			[409, 'the relay refused: this fleet has reached its limit of boxes or unused join keys', 'The relay refused: the fleet is full'],
			[429, 'the relay is busy, try again later', 'The relay is busy, try again later'],
			[502, 'dial tcp: connection refused', 'Relay unreachable'],
			[409, 'the relay rejected the credentials of this box', 'the relay rejected the credentials of this box'],
		]
		for (const [status, message, shown] of tries) {
			fleetApi.setMaster.mockImplementation(() => refusal(status, message))
			await open()
			await pick('master')
			await button('Enable').trigger('click')
			await flushPromises()
			expect(wrapper.text()).toContain(shown)
			wrapper.unmount()
		}
		wrapper = null
	})

	it('changes the relay after a warning that the codes stop working', async () => {
		fleetApi.status.mockReturnValue(answer(RELAY_MASTER))
		fleetApi.setRelay.mockReturnValue(answer({}))
		await open()
		expect(field('relay').element.value).toBe('https://relay.mine.example')
		await field('relay').setValue('http://other.example')
		await button('Change the relay').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('The relay must start with https://')
		await field('relay').setValue('https://other.example')
		await button('Change the relay').trigger('click')
		await flushPromises()
		expect(fleetApi.setRelay).not.toHaveBeenCalled()
		expect(document.body.textContent).toContain('The codes already given stop working: every box needs a new code.')
		dialogButton('Change the relay').click()
		await flushPromises()
		expect(fleetApi.setRelay).toHaveBeenCalledWith('https://other.example')
	})

	it('keeps the buttons disabled while the relay works', async () => {
		let done
		fleetApi.setMaster.mockImplementation(() => new Promise((resolve) => {
			done = resolve
		}))
		await open()
		await pick('master')
		await button('Enable').trigger('click')
		await flushPromises()
		expect(button('Enable').attributes('disabled')).toBeDefined()
		await button('Enable').trigger('click')
		expect(fleetApi.setMaster).toHaveBeenCalledTimes(1)
		done(answer({}))
		await flushPromises()
	})

	it('says so when the core cannot be read, and shows nothing to change', async () => {
		fleetApi.status.mockImplementation(() => Promise.reject(new Error('Network Error')))
		await open()
		expect(wrapper.text()).toContain('The fleet could not be read.')
		expect(wrapper.find('input[type=radio]').exists()).toBe(false)
	})
})

describe('adding a box', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('keeps the code on screen in a selectable field until Close, even when the clipboard fails', async () => {
		copy.mockImplementation(() => Promise.reject(new Error('denied')))
		fleetApi.addBox.mockReturnValue(answer({ box: { id: 'c', name: 'Shop' }, code: 'ENROL-123' }))
		await open(AddBoxDialog, { self: false })
		await wrapper.find('input[type=text]').setValue('Shop')
		await button('Add').trigger('click')
		await flushPromises()
		expect(fleetApi.addBox).toHaveBeenCalledWith({ name: 'Shop', url: '', self: false })
		expect(wrapper.emitted('added')).toHaveLength(1)
		const field = wrapper.find('input[readonly]')
		expect(field.element.value).toBe('ENROL-123')
		expect(wrapper.text()).toContain('Copy this code into the box\'s settings. It is shown once.')
		await button('Copy').trigger('click')
		await flushPromises()
		expect(copy).toHaveBeenCalledWith('ENROL-123')
		expect(wrapper.find('input[readonly]').element.value).toBe('ENROL-123')
		expect(wrapper.emitted('close')).toBeUndefined()
		await button('Close').trigger('click')
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('refuses a dashboard address that is not http, and an empty name', async () => {
		await open(AddBoxDialog, { self: false })
		await button('Add').trigger('click')
		expect(fleetApi.addBox).not.toHaveBeenCalled()
		await wrapper.find('input[type=text]').setValue('Shop')
		await wrapper.find('input[type=url]').setValue('ftp://shop')
		await button('Add').trigger('click')
		await flushPromises()
		expect(fleetApi.addBox).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('The address must start with http')
	})

	it('prefills the name with the hostname for this box, and says so to the core', async () => {
		fleetApi.addBox.mockReturnValue(answer({ box: { id: 'a', name: 'localhost' }, code: 'ENROL-self' }))
		await open(AddBoxDialog, { self: true })
		expect(wrapper.find('input[type=text]').element.value).toBe(window.location.hostname)
		await button('Add').trigger('click')
		await flushPromises()
		expect(fleetApi.addBox).toHaveBeenCalledWith({ name: window.location.hostname, url: '', self: true })
		expect(wrapper.find('input[readonly]').element.value).toBe('ENROL-self')
	})

	it('shows a box\'s new code', async () => {
		fleetApi.rotateCode.mockReturnValue(answer({ code: 'ENROL-new' }))
		await open(AddBoxDialog, { rotate: { id: 'b', name: 'Shop' } })
		expect(fleetApi.rotateCode).toHaveBeenCalledWith('b')
		expect(wrapper.text()).toContain('New code for Shop')
		expect(wrapper.find('input[readonly]').element.value).toBe('ENROL-new')
	})

	it('shows the core\'s refusal and keeps the form', async () => {
		fleetApi.addBox.mockImplementation(() => Promise.reject(Object.assign(new Error('409'), { response: { status: 409, data: { message: 'a box already has this name' } } })))
		await open(AddBoxDialog, { self: false })
		await wrapper.find('input[type=text]').setValue('Shop')
		await button('Add').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('a box already has this name')
		expect(wrapper.find('input[type=text]').exists()).toBe(true)
	})
})
