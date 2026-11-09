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

	it('opens a schedule on its own, picks every app with All, says This box in the head', async () => {
		await open(BackupSchedules, {
			getSchedules: answer([{ app: 'casaos-system', destination: 'offsite', every: 'daily', weekday: 0, at: '03:00', keep: 0, hold_still: true, enabled: true, last_run: '2026-11-07T02:00:00Z' }]),
			getDestinations: answer(['offsite']),
			getRuns: answer([
				{ app: 'casaos-system', destination: 'offsite', scheduled: true, started_at: '2026-11-07T02:00:00Z', finished_at: '2026-11-07T02:04:00Z', bytes: 3 * 1024 * 1024 },
				// asked for by hand the day before: not the schedule's
				{ app: 'casaos-system', destination: 'offsite', scheduled: false, started_at: '2026-11-06T15:00:00Z', finished_at: '2026-11-06T15:30:00Z' },
			]),
		})

		// one schedule: open, with the box tile and the app grid
		expect(wrapper.find('._head').text()).toContain('This box')
		expect(wrapper.findAll('._grid ._tile')).toHaveLength(1)
		expect(wrapper.find('button[title="Collapse"]').exists()).toBe(true)

		await wrapper.findAll('button').find(b => b.text() === 'All').trigger('click')
		expect(wrapper.vm.schedules[0].apps).toEqual(['casaos-system', 'immich'])

		await wrapper.findAll('button').find(b => b.text() === 'None').trigger('click')
		expect(wrapper.vm.schedules[0].apps).toEqual(['casaos-system'])

		// the last run: the scheduled one, 4 minutes, not the one asked for by hand
		expect(wrapper.vm.lastBatch(wrapper.vm.schedules[0])).toHaveLength(1)
		expect(wrapper.vm.lastText(wrapper.vm.schedules[0])).toContain('4 min, 3 MB, succeeded')
		expect(wrapper.vm.durationText(5400000)).toBe('1 h 30')
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

describe('a backup somebody stopped, in the history', () => {
	afterEach(() => wrapper?.unmount())

	it('says it was stopped, not that it failed', async () => {
		await open(BackupHistory, {
			getRuns: answer([{ app: 'happy_rik', destination: 'GDrive', started_at: '2026-11-09T07:00:00Z', stamp: 'x', error: 'stopped from the interface: copying /DATA/AppData/overseerr/config: context canceled' }]),
		})

		expect(wrapper.text()).toContain('Stopped from the interface')
		expect(wrapper.text()).not.toContain('Failed')
	})
})
