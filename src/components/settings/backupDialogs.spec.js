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
