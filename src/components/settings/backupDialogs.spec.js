// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BackupDestinations from './BackupDestinations.vue'
import BackupSchedules from './BackupSchedules.vue'
import RestoreFromDestinationModal from './RestoreFromDestinationModal.vue'
import i18n from '@/plugins/i18n'
import BackupAppModal from '@/components/Apps/BackupAppModal.vue'

// keys are shown as they are, so the assertions read the English
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const fail = () => Promise.reject(Object.assign(new Error('boom'), { response: { data: { message: 'permission denied' } } }))
const pending = () => new Promise(() => {})
const answer = data => () => Promise.resolve({ data: { data } })

async function open(component, backup, props = {}) {
	const wrapper = mount(component, {
		props,
		attachTo: document.body,
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				$api: { backup },
				$openAPI: { appGrid: { getAppGrid: answer([]) } },
				$buefy: { toast: { open() {} }, dialog: { confirm() {} }, modal: { open() {} } },
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('a list that did not load', () => {
	// the error said the list could not be read, and the empty state below it said
	// there was nothing: two answers, one of them wrong
	it('is not also called empty, in the destinations', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: fail })
		expect(wrapper.text()).toContain('Destinations could not be loaded')
		expect(wrapper.text()).not.toContain('No destination yet')
		wrapper.unmount()
	})

	it('is not also called empty, in the schedules', async () => {
		const wrapper = await open(BackupSchedules, { getSchedules: fail, getDestinations: answer([]) })
		expect(wrapper.text()).toContain('Schedules could not be loaded')
		expect(wrapper.text()).not.toContain('Nothing is scheduled')
		wrapper.unmount()
	})

	it('offers neither a form nor a backup, in the app backup dialog', async () => {
		const wrapper = await open(BackupAppModal, { getDestinations: fail }, { appId: 'nextcloud', appName: 'Nextcloud' })
		expect(wrapper.text()).toContain('Destinations could not be loaded')
		expect(wrapper.text()).not.toContain('No destination is configured')
		expect(wrapper.find('select').exists()).toBe(false)
		const buttons = wrapper.findAll('.modal-card-foot .button')
		expect(buttons.map(button => button.text())).toEqual(['Close'])
		wrapper.unmount()
	})
})

describe('the restore dialog', () => {
	it('shows that it is loading', async () => {
		// `:active` is ignored by Buefy 3: the dialog sat blank until the list came
		const wrapper = await open(RestoreFromDestinationModal, { getDestinationRuns: pending }, { destination: 'nas' })
		expect(wrapper.find('.loading-overlay').exists()).toBe(true)
		wrapper.unmount()
	})

	it('names the button that deletes a backup', async () => {
		const held = [{ app: 'nextcloud', installed: true, stamps: ['2026-09-24T03-00-12Z'] }]
		const wrapper = await open(RestoreFromDestinationModal, { getDestinationRuns: answer(held) }, { destination: 'nas' })
		expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(true)
		wrapper.unmount()
	})
})

describe('the destination form', () => {
	it('is never filled with the dashboard password', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer([]) })
		wrapper.vm.draft.encrypt = true
		await flushPromises()
		// every password field: the encryption password and s3's secret_access_key
		const passwords = wrapper.findAll('input[type=password]')
		expect(passwords.length).toBeGreaterThanOrEqual(2)
		for (const input of passwords)
			expect(input.attributes('autocomplete')).toBe('new-password')
		wrapper.unmount()
	})
})

describe('a destination kept with restic', () => {
	const state = states => name => Promise.resolve({ data: { data: states[name] } })
	const buttons = wrapper => wrapper.findAll('.destination .button').map(button => button.text())

	it('offers the switch only where this box has restic and the destination is not switched', async () => {
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer(['nas', 'offsite', 'old']),
			getResticState: state({ nas: { available: true, enabled: false }, offsite: { available: true, enabled: true }, old: { available: false, enabled: false } }),
		})
		const rows = wrapper.findAll('.destination')
		expect(rows[0].text()).toContain('Keep with restic')
		expect(rows[1].text()).not.toContain('Keep with restic')
		expect(rows[1].text()).toContain('Kept with restic')
		expect(rows[2].text()).not.toContain('restic')
		wrapper.unmount()
	})

	it('is no button and no error where the box does not know the call', async () => {
		const wrapper = await open(BackupDestinations, { getDestinations: answer(['nas']) })
		expect(buttons(wrapper).join(' ')).not.toContain('restic')
		expect(wrapper.text()).not.toContain('Destinations could not be loaded')
		wrapper.unmount()
	})

	it('shows the password it is given back once, and not one the person typed', async () => {
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer(['nas']),
			getResticState: state({ nas: { available: true, enabled: false } }),
			enableRestic: vi.fn(() => Promise.resolve({ data: { data: { password: 'Zm9vYmFy-_' } } })),
		})
		const alert = vi.fn()
		wrapper.vm.$buefy.dialog.alert = alert
		const toast = vi.fn()
		wrapper.vm.$buefy.toast.open = toast

		await wrapper.vm.enableRestic('nas', '')
		expect(alert).toHaveBeenCalledOnce()
		expect(alert.mock.calls[0][0].message).toContain('<code>Zm9vYmFy-_</code>')

		alert.mockClear()
		await wrapper.vm.enableRestic('nas', 'from-the-old-box')
		expect(alert).not.toHaveBeenCalled()
		expect(toast).toHaveBeenCalled()
		wrapper.unmount()
	})

	it('puts nothing a destination can be called into the markup of the password dialog', async () => {
		const wrapper = await open(BackupDestinations, {
			getDestinations: answer([]),
			enableRestic: () => Promise.resolve({ data: { data: { password: 'abc' } } }),
			getResticState: state({}),
		})
		const alert = vi.fn()
		wrapper.vm.$buefy.dialog.alert = alert

		await wrapper.vm.enableRestic('<img src=x onerror=alert(1)>', '')
		expect(alert.mock.calls[0][0].message).not.toContain('<img')
		wrapper.unmount()
	})
})
