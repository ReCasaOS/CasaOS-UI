// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HealthStrip from './HealthStrip.vue'

const hardwareInfo = {
	cpu: { percent: 12.4, temperature: 46, num: 4 },
	mem: { usedPercent: 49, total: 4 * 1024 ** 3 },
	sys_disk: { size: 100, used: 40, smart_status: 'passed' },
	net: [{ name: 'eth0', bytesSent: 0, bytesRecv: 0, time: 100 }],
}

function strip({ runs = [], snapraid, emit = vi.fn() } = {}) {
	return mount(HealthStrip, {
		global: {
			mocks: {
				$t: (key, params) => (params ? key.replace('{name}', params.name) : key),
				$store: { state: { hardwareInfo } },
				$EventBus: { $emit: emit },
				$api: {
					backup: { getRuns: () => Promise.resolve({ data: { data: runs } }) },
					disks: { snapraid: snapraid || (() => Promise.reject(new Error('404'))) },
				},
			},
		},
	})
}

const settle = () => new Promise(resolve => setTimeout(resolve))

afterEach(() => {
	vi.useRealTimers()
})

describe('health strip', () => {
	it('says what the box is doing from the utilization the home page already read', () => {
		const wrapper = strip()

		const text = wrapper.text()
		expect(text).toContain('12 %')
		expect(text).toContain('49 %')
		expect(text).toContain('40 %')
		expect(text).toContain('46°C')
		// no second sample yet: no speed claimed
		expect(wrapper.findAll('.tile')).toHaveLength(5)
		expect(text).toContain('—')
	})

	it('follows the socket and works the network speed out of two samples', async () => {
		const wrapper = strip()
		const onUtilization = wrapper.vm.$options.sockets['casaos:system:utilization']
		const payload = (sent, recv, time, cpu) => ({
			Properties: {
				sys_cpu: JSON.stringify({ percent: cpu }),
				sys_mem: JSON.stringify({ usedPercent: 50, total: 1024 }),
				sys_disk: JSON.stringify({ size: 100, used: 41, smart_status: 'passed' }),
				sys_net: JSON.stringify([{ name: 'eth0', bytesSent: sent, bytesRecv: recv, time }]),
			},
		})

		onUtilization.call(wrapper.vm, payload(0, 0, 100, 20))
		onUtilization.call(wrapper.vm, payload(2048, 4096, 102, 30))
		await wrapper.vm.$nextTick()

		expect(wrapper.text()).toContain('30 %')
		expect(wrapper.text()).toContain('↓ 2 KB/s')
		expect(wrapper.text()).toContain('↑ 1 KB/s')
	})

	it('leaves SnapRAID out on a box that has none, and says so when it is late', async () => {
		const without = strip()
		await settle()
		expect(without.findAll('.tile')).toHaveLength(5)
		expect(without.findAll('.attention li')).toHaveLength(0)
		expect(without.find('.attention').text()).toContain('All good')

		const late = strip({ snapraid: () => Promise.resolve({ data: { data: { configured: true, last: {} } } }) })
		await settle()
		expect(late.findAll('.tile')).toHaveLength(6)
		expect(late.find('.attention').text()).toContain('SnapRAID: Not synced yet')
	})

	it('puts a failed last backup in the attention list, and still dates the last good one', async () => {
		const wrapper = strip({
			runs: [
				{ started_at: '2026-11-03T03:00:00Z', error: 'no route to host' },
				{ started_at: '2026-11-02T03:00:00Z' },
			],
		})
		await settle()

		expect(wrapper.find('.attention').text()).toContain('The last backup failed')
		expect(wrapper.text()).toContain(new Date('2026-11-02T03:00:00Z').toLocaleString())
	})

	it('lists the system drive and the USB disks in the storage panel, and the apps go in the main column', () => {
		const wrapper = mount(HealthStrip, {
			slots: { default: '<p class="apps-here">apps</p>' },
			global: {
				mocks: {
					$t: key => key,
					$store: { state: { hardwareInfo: { ...hardwareInfo, sys_usb: [{ name: 'sdb', model: 'Backup stick', size: 1000, avail: 250 }] } } },
					$EventBus: { $emit: vi.fn() },
					$api: { backup: { getRuns: () => Promise.resolve({ data: { data: [] } }) }, disks: { snapraid: () => Promise.reject(new Error('404')) } },
				},
			},
		})

		const drives = wrapper.findAll('.storage .drive')
		expect(drives).toHaveLength(2)
		expect(drives[0].text()).toContain('System drive')
		expect(drives[0].text()).toContain('Healthy')
		expect(drives[1].text()).toContain('Backup stick')
		expect(drives[1].text()).toContain('75 %')
		expect(wrapper.find('.beta-main .apps-here').exists()).toBe(true)
	})

	it('opens the storage manager from the storage tile', async () => {
		const emit = vi.fn()
		const wrapper = strip({ emit })

		await wrapper.find('button.tile').trigger('click')

		expect(emit).toHaveBeenCalledWith('casaUI:openStorageManager')
	})

	it('reads the backup runs and SnapRAID again now and then, and stops with the page', async () => {
		vi.useFakeTimers()
		const getRuns = vi.fn(() => Promise.resolve({ data: { data: [] } }))
		const wrapper = mount(HealthStrip, {
			global: {
				mocks: {
					$t: key => key,
					$store: { state: { hardwareInfo } },
					$EventBus: { $emit: vi.fn() },
					$api: { backup: { getRuns }, disks: { snapraid: () => Promise.reject(new Error('404')) } },
				},
			},
		})
		expect(getRuns).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(60 * 1000)
		expect(getRuns).toHaveBeenCalledTimes(2)

		wrapper.unmount()
		vi.advanceTimersByTime(5 * 60 * 1000)
		expect(getRuns).toHaveBeenCalledTimes(2)
	})
})
