// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BackupDestinations from './BackupDestinations.vue'
import BackupHistory from './BackupHistory.vue'
import BackupSchedules from './BackupSchedules.vue'
import i18n from '@/plugins/i18n'

// keys are shown as they are, so the assertions read the English
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const answer = data => () => Promise.resolve({ data: { data } })

// every call answers; the ones the test cares about answer what it says
const backupApi = answers => new Proxy({}, { get: (_, name) => answers[name] || answer(null) })

let wrapper

async function open(component, answers) {
	wrapper = mount(component, {
		attachTo: document.body,
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				$api: { backup: backupApi(answers) },
				$openAPI: { appGrid: { getAppGrid: answer([{ name: 'immich', app_type: 'v2app' }]) } },
				$buefy: { toast: { open() {} }, dialog: { confirm() {} }, modal: { open() {} } },
			},
		},
	})
	await flushPromises()
	return wrapper
}

const unnamed = w => w.findAll('button').filter(b => !(b.attributes('aria-label') || b.attributes('title') || b.text()))

describe('the backup windows on a phone', () => {
	afterEach(() => wrapper?.unmount())

	it('names the button that removes an option row of a destination', async () => {
		await open(BackupDestinations, { getDestinations: answer(['offsite']) })

		expect(wrapper.findAll('button[title="Remove"]').length).toBeGreaterThan(0)
		expect(unnamed(wrapper)).toHaveLength(0)
	})

	it('names the button that removes a schedule', async () => {
		await open(BackupSchedules, {
			getSchedules: answer([{ app: 'immich', destination: 'offsite', every: 'daily', weekday: 0, at: '03:00', keep: 7, hold_still: false, enabled: true }]),
			getDestinations: answer(['offsite']),
		})

		expect(wrapper.find('button[title="Remove"]').exists()).toBe(true)
		expect(unnamed(wrapper)).toHaveLength(0)
	})

	it('lets the buttons of a destination wrap instead of running off the card', async () => {
		await open(BackupDestinations, { getDestinations: answer(['offsite']) })

		const row = wrapper.find('.destination .ml-auto')
		expect(row.classes()).toContain('is-flex-wrap-wrap')
	})

	it('drops Destination, Copied and Stopped on a phone, shows the destination under the app, keeps Restore', async () => {
		await open(BackupHistory, {
			getRuns: answer([{ app: 'immich', destination: 'offsite', started_at: '2026-11-05T21:42:16Z', copied: '38 GB', containers_stopped: true, stamp: '2026-11-05T21-42-16Z' }]),
		})

		const headers = wrapper.findAll('th')
		for (const label of ['Destination', 'Copied', 'Stopped']) {
			expect(headers.find(h => h.text() === label).classes()).toContain('is-hidden-mobile')
		}
		expect(headers.find(h => h.text() === 'App').classes()).not.toContain('is-hidden-mobile')
		expect(wrapper.find('td span.is-hidden-tablet').text()).toBe('offsite')
		expect(wrapper.findAll('button').some(b => b.text() === 'Restore')).toBe(true)
	})
})
