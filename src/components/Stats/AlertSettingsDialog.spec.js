// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOSTILE, anAlerts } from './__fixtures__/contract'
import AlertSettingsDialog from './AlertSettingsDialog.vue'
import { statsApi } from '@/service/stats'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/stats', () => ({
	STATS_SOURCES: ['app_management', 'virt_management', 'core'],
	statsApi: { list: vi.fn(), series: vi.fn(), alerts: vi.fn(), setAlerts: vi.fn() },
}))

const failure = (status, message) => Object.assign(new Error('failed'), { response: { status, data: { message } } })

let wrapper
async function open(props = {}) {
	wrapper = mount(AlertSettingsDialog, {
		props: { source: 'app_management', itemId: 'app:jellyfin:web:1', itemName: 'Jellyfin', ...props },
		attachTo: document.body,
		global: { plugins: [Buefy, i18n] },
	})
	await flushPromises()
	return wrapper
}
const dialog = () => document.querySelector('.stats-dialog')
const rows = () => [...document.querySelectorAll('.stats-rule')]
const field = (row, name) => rows()[row].querySelector(`[data-field="${name}"]`)
const save = () => [...document.querySelectorAll('.stats-dialog button')].find(b => b.textContent.trim() === 'Save')
async function type(row, name, value) {
	const input = field(row, name)
	input.value = value
	input.dispatchEvent(new Event('input', { bubbles: true }))
	await flushPromises()
}
function key(type, name, init = {}) {
	const event = new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true, ...init })
	;(document.activeElement || document.body).dispatchEvent(event)
	return event
}

describe('the alert settings dialog', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		statsApi.alerts.mockResolvedValue(anAlerts())
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('is a modal dialog named by its heading, and loads the rules of the item', async () => {
		await open()
		expect(statsApi.alerts).toHaveBeenCalledWith('app_management', 'app:jellyfin:web:1')
		expect(dialog().getAttribute('role')).toBe('dialog')
		expect(dialog().getAttribute('aria-modal')).toBe('true')
		const heading = document.getElementById(dialog().getAttribute('aria-labelledby'))
		expect(heading.textContent).toContain('Alert settings')
		expect(heading.textContent).toContain('Jellyfin')
		expect(rows().map(r => r.querySelector('legend').textContent)).toEqual(['Processor', 'Memory'])
		expect(field(0, 'enabled').checked).toBe(true)
		expect(field(0, 'threshold').value).toBe('90')
		expect(field(0, 'minutes').value).toBe('10')
		expect(field(1, 'minutes').value).toBe('5')
	})

	it('puts the focus on the heading when it opens', async () => {
		await open()
		expect(document.activeElement).toBe(document.getElementById(dialog().getAttribute('aria-labelledby')))
	})

	it('names an unknown rule as text', async () => {
		statsApi.alerts.mockResolvedValue(anAlerts({ rules: [{ key: HOSTILE, enabled: false, threshold: 50, minutes: 3 }] }))
		await open()
		expect(rows()[0].querySelector('legend').textContent).toContain('Rule')
		expect(document.querySelector('.stats-dialog img')).toBeNull()
	})

	it.each([
		['threshold', '0'],
		['threshold', '101'],
		['threshold', '1.5'],
		['threshold', ''],
		['minutes', '0'],
		['minutes', '121'],
		['minutes', ''],
	])('refuses %s %j and says the bound', async (name, value) => {
		await open()
		expect(save().disabled).toBe(false)
		await type(0, name, value)
		expect(save().disabled).toBe(true)
		expect(field(0, name).getAttribute('aria-invalid')).toBe('true')
		expect(rows()[0].querySelector('.stats-rule-bound').textContent).toMatch(/^From \d+ to \d+/)
		await type(0, name, name === 'threshold' ? '50' : '30')
		expect(save().disabled).toBe(false)
	})

	it('sends every rule, the untouched ones too, and closes with what the service returned', async () => {
		const returned = anAlerts({ rules: [{ key: 'cpu_high', enabled: false, threshold: 80, minutes: 10 }, { key: 'mem_high', enabled: true, threshold: 90, minutes: 5 }], active: [] })
		statsApi.setAlerts.mockResolvedValue(returned)
		await open()
		await type(0, 'threshold', '80')
		field(0, 'enabled').click()
		await flushPromises()
		save().click()
		await flushPromises()
		expect(statsApi.setAlerts).toHaveBeenCalledWith('app_management', 'app:jellyfin:web:1', [
			{ key: 'cpu_high', enabled: false, threshold: 80, minutes: 10 },
			{ key: 'mem_high', enabled: true, threshold: 90, minutes: 5 },
		])
		expect(wrapper.emitted('saved')).toEqual([[returned]])
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('sends the key of a rule as it came, and cleans it only for the label', async () => {
		statsApi.alerts.mockResolvedValue(anAlerts({ rules: [{ key: ' odd_rule ', enabled: true, threshold: 50, minutes: 3 }] }))
		statsApi.setAlerts.mockResolvedValue(anAlerts())
		await open()
		expect(rows()[0].querySelector('legend').textContent).toBe('Rule odd_rule')
		save().click()
		await flushPromises()
		expect(statsApi.setAlerts.mock.calls[0][2][0].key).toBe(' odd_rule ')
	})

	it('takes the refusal away as soon as a field is edited', async () => {
		statsApi.setAlerts.mockRejectedValue(failure(500))
		await open()
		save().click()
		await flushPromises()
		expect(document.querySelector('.stats-dialog-error')).not.toBeNull()
		field(0, 'enabled').click()
		await flushPromises()
		expect(document.querySelector('.stats-dialog-error')).toBeNull()
		save().click()
		await flushPromises()
		expect(document.querySelector('.stats-dialog-error')).not.toBeNull()
		await type(1, 'minutes', '7')
		expect(document.querySelector('.stats-dialog-error')).toBeNull()
	})

	it('says the item is gone and cannot be saved', async () => {
		await open({ itemGone: true })
		expect(document.querySelector('.stats-dialog-error').textContent).toBe('This item is gone')
		expect(save().disabled).toBe(true)
	})

	it('shows what the service holds when it is opened again', async () => {
		statsApi.setAlerts.mockResolvedValue(anAlerts())
		await open()
		wrapper.unmount()
		statsApi.alerts.mockResolvedValue(anAlerts({ rules: [{ key: 'cpu_high', enabled: true, threshold: 80, minutes: 10 }, { key: 'mem_high', enabled: true, threshold: 90, minutes: 5 }] }))
		await open()
		expect(field(0, 'threshold').value).toBe('80')
	})

	it('says the values were refused with a fixed sentence, never the text of the service, and marks nothing', async () => {
		statsApi.setAlerts.mockRejectedValue(failure(400, HOSTILE))
		await open()
		save().click()
		await flushPromises()
		expect(document.querySelector('.stats-dialog-error').textContent).toBe('These values were refused.')
		expect(dialog().textContent).not.toContain('onerror')
		expect(dialog().querySelector('[aria-invalid="true"]')).toBeNull()
		expect(wrapper.emitted('close')).toBeUndefined()
	})

	it('marks and focuses the field a bad_rules message names', async () => {
		statsApi.setAlerts.mockRejectedValue(failure(400, 'bad_rules: rules[1].minutes'))
		await open()
		save().click()
		await flushPromises()
		expect(document.querySelector('.stats-dialog-error').textContent).toBe('These values were refused.')
		expect(field(1, 'minutes').getAttribute('aria-invalid')).toBe('true')
		expect(document.activeElement).toBe(field(1, 'minutes'))
		expect(dialog().querySelectorAll('[aria-invalid="true"]')).toHaveLength(1)
	})

	it('names no field for a row that is not there or a field it does not know', async () => {
		statsApi.setAlerts.mockRejectedValue(failure(400, 'bad_rules: rules[7].minutes'))
		await open()
		save().click()
		await flushPromises()
		expect(dialog().querySelector('[aria-invalid="true"]')).toBeNull()
	})

	it('says the settings could not be saved for any other failure and stays open', async () => {
		statsApi.setAlerts.mockRejectedValue(failure(500, HOSTILE))
		await open()
		save().click()
		await flushPromises()
		expect(document.querySelector('.stats-dialog-error').textContent).toBe('The settings could not be saved. Try again.')
		expect(wrapper.emitted('close')).toBeUndefined()
		expect(save().disabled).toBe(false)
	})

	it('says the settings could not be read, and reads them again on Retry', async () => {
		statsApi.alerts.mockRejectedValueOnce(failure(500))
		await open()
		expect(rows()).toHaveLength(0)
		expect(document.querySelector('.stats-dialog-error span').textContent).toBe('The settings could not be read.')
		expect(save().disabled).toBe(true)
		;[...document.querySelectorAll('.stats-dialog button')].find(b => b.textContent.trim() === 'Retry').click()
		await flushPromises()
		expect(rows()).toHaveLength(2)
	})

	describe('keys', () => {
		it('closes on Escape, and the key goes no further', async () => {
			await open()
			const onDocument = vi.fn()
			document.addEventListener('keyup', onDocument)
			key('keyup', 'Escape')
			document.removeEventListener('keyup', onDocument)
			expect(wrapper.emitted('close')).toHaveLength(1)
			expect(onDocument).not.toHaveBeenCalled()
		})

		it('does not hear Escape once it is gone', async () => {
			await open()
			wrapper.unmount()
			const onDocument = vi.fn()
			document.addEventListener('keyup', onDocument)
			key('keyup', 'Escape')
			document.removeEventListener('keyup', onDocument)
			expect(onDocument).toHaveBeenCalledTimes(1)
		})

		it('takes Tab round from the last control to the first, and Shift+Tab back', async () => {
			await open()
			const ring = [...dialog().querySelectorAll('input, button')].filter(e => !e.disabled)
			ring.at(-1).focus()
			const forward = key('keydown', 'Tab')
			expect(forward.defaultPrevented).toBe(true)
			expect(document.activeElement).toBe(ring[0])
			const back = key('keydown', 'Tab', { shiftKey: true })
			expect(back.defaultPrevented).toBe(true)
			expect(document.activeElement).toBe(ring.at(-1))
		})

		it('lets Tab move on by itself in the middle of the dialog', async () => {
			await open()
			field(0, 'threshold').focus()
			expect(key('keydown', 'Tab').defaultPrevented).toBe(false)
		})

		it('takes the first control from the heading at Tab, and the last at Shift+Tab', async () => {
			await open()
			const ring = [...dialog().querySelectorAll('input, button')].filter(e => !e.disabled)
			expect(key('keydown', 'Tab').defaultPrevented).toBe(true)
			expect(document.activeElement).toBe(ring[0])
			document.getElementById(dialog().getAttribute('aria-labelledby')).focus()
			key('keydown', 'Tab', { shiftKey: true })
			expect(document.activeElement).toBe(ring.at(-1))
		})
	})
})
