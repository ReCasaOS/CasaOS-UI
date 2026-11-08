// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VerificationScheduleModal from './VerificationScheduleModal.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { relay: vi.fn() } }))

const ROWS = [{ key: 'a', id: 'a', name: 'Home' }, { key: 'b', id: 'b', name: 'Shop' }]
const failure = (status, body) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: body } })

let wrapper
function mountModal(props = {}) {
	wrapper = mount(VerificationScheduleModal, { attachTo: document.body, props: { rows: ROWS, ...props }, global: { plugins: [Buefy, i18n] } })
	return wrapper
}
const toggle = () => wrapper.find('input[type="checkbox"]')
const days = () => wrapper.find('input[type="number"]')
const time = () => wrapper.find('input[type="time"]')
const button = label => wrapper.findAll('button').find(b => b.text() === label)
const calls = () => fleetApi.relay.mock.calls

describe('the verification schedule dialog', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		fleetApi.relay.mockResolvedValue({ status: 200, data: { success: 200 } })
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('starts switched off, every 7 days at 03:00, with the cost of a verification said', () => {
		mountModal()
		expect(toggle().element.checked).toBe(false)
		expect(days().element.value).toBe('7')
		expect(time().element.value).toBe('03:00')
		expect(wrapper.text()).toContain('A verification re-reads data from the destination: it uses bandwidth and quota.')
		expect(wrapper.text()).toContain('checked every week')
	})

	it('names the switch for what it does, not by its state, and says the time is each box local', async () => {
		mountModal()
		const name = () => toggle().element.closest('label').textContent
		expect(name()).toContain('Verify on a schedule')
		await toggle().setValue(true)
		expect(name()).toContain('Verify on a schedule')
		expect(name()).not.toMatch(/Enabled|Disabled/)
		expect(wrapper.text()).toContain('The time is the local time of each box.')
	})

	it('starts from the schedule the boxes carry', () => {
		mountModal({ current: { enabled: true, every_days: 14, at: '04:30', last_run: '2026-11-01T04:30:00Z' } })
		expect(toggle().element.checked).toBe(true)
		expect(days().element.value).toBe('14')
		expect(time().element.value).toBe('04:30')
	})

	it('puts exactly enabled, every_days and at to every box, and shows one result per box', async () => {
		fleetApi.relay.mockImplementation(id => (id === 'b' ? Promise.reject(failure(503, { message: 'box offline' })) : Promise.resolve({ status: 200, data: {} })))
		const applied = vi.fn()
		mountModal({ current: { enabled: false, every_days: 7, at: '03:00', last_run: 'x' }, afterApply: applied })
		await toggle().setValue(true)
		await days().setValue('3')
		await time().setValue('05:15')
		await button('Apply').trigger('click')
		await flushPromises()
		expect(calls()).toEqual([
			['a', 'put', '/v2/app_management/backup/verification-schedule', { data: { enabled: true, every_days: 3, at: '05:15' } }],
			['b', 'put', '/v2/app_management/backup/verification-schedule', { data: { enabled: true, every_days: 3, at: '05:15' } }],
		])
		const lines = wrapper.findAll('.verification-result')
		expect(lines).toHaveLength(2)
		expect(lines[0].text()).toContain('Home')
		expect(lines[0].text()).toContain('Done')
		expect(lines[1].text()).toContain('Shop')
		expect(lines[1].text()).toContain('Box offline')
		expect(applied).toHaveBeenCalledTimes(1)
	})

	it.each(['', '7.5'])('keeps what was typed (%j), says why it is not applied, and does not post', async (value) => {
		mountModal()
		await days().setValue(value)
		expect(days().element.value).toBe(value)
		expect(wrapper.find('[role="alert"]').text()).toContain('whole number of days from 1 to 30')
		expect(button('Apply').attributes('disabled')).toBeDefined()
		expect(button('Apply').attributes('aria-describedby')).toBe(wrapper.find('[role="alert"]').attributes('id'))
		await days().trigger('keydown', { key: 'Enter' })
		await flushPromises()
		expect(calls()).toEqual([])
	})

	it('says "Every day" for one day and "Every n days" otherwise', async () => {
		mountModal()
		expect(wrapper.text()).toContain('Every 7 days')
		await days().setValue('1')
		expect(wrapper.text()).toContain('Every day')
		expect(wrapper.text()).not.toContain('Every 1 days')
	})

	it('says when the boxes had different schedules, and starts from the defaults', () => {
		mountModal({ differ: true })
		expect(wrapper.text()).toContain('The selected boxes have different schedules; applying will replace them all.')
		expect(days().element.value).toBe('7')
		wrapper.unmount()
		mountModal()
		expect(wrapper.text()).not.toContain('different schedules')
	})

	it.each(['0', '31', '-2'])('does not apply %s days', async (value) => {
		mountModal()
		await days().setValue(value)
		expect(button('Apply').attributes('disabled')).toBeDefined()
		await button('Apply').trigger('click')
		expect(calls()).toEqual([])
	})

	it.each(['1', '30'])('applies %s days', async (value) => {
		mountModal()
		await days().setValue(value)
		expect(button('Apply').attributes('disabled')).toBeUndefined()
	})

	it('does not apply without a time', async () => {
		mountModal()
		await time().setValue('')
		expect(button('Apply').attributes('disabled')).toBeDefined()
	})

	it('applies on Enter in a field, and closes on Escape', async () => {
		mountModal()
		await days().trigger('keydown', { key: 'Enter' })
		await flushPromises()
		expect(calls()).toHaveLength(2)
		await time().trigger('keydown', { key: 'Escape' })
		expect(wrapper.emitted('close')).toHaveLength(1)
	})
})
