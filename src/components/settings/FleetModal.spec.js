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
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn(), setMaster: vi.fn(), join: vi.fn(), leave: vi.fn(), addBox: vi.fn(), rotateCode: vi.fn() } }))
vi.mock('@/components/Fleet/entry', () => ({ forgetFleet: vi.fn(), openFleet: vi.fn() }))
vi.mock('clipboard-copy', () => ({ default: vi.fn(() => Promise.resolve()) }))

const answer = data => Promise.resolve({ data: { success: 200, data } })
const NONE = { role: 'none', master: null, member: null }
const MASTER = { role: 'master', master: { address: 'https://m.example', boxes: [{ id: 'a', name: 'Home' }, { id: 'b', name: 'Shop' }] }, member: null }
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

describe('the Fleet settings', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		fleetApi.status.mockReturnValue(answer(NONE))
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

	it('enables the master with its address and refuses an address without https', async () => {
		await open()
		await pick('master')
		await wrapper.find('input[type=url]').setValue('http://m.example')
		await button('Enable').trigger('click')
		await flushPromises()
		expect(fleetApi.setMaster).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('The address must start with https://')
		fleetApi.setMaster.mockReturnValue(answer({}))
		fleetApi.status.mockReturnValue(answer(MASTER))
		await wrapper.find('input[type=url]').setValue('https://m.example')
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
