// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HealthStrip from './HealthStrip.vue'
import { openFleet } from '@/components/Fleet/entry'

vi.mock('@/components/Fleet/entry', () => ({ openFleet: vi.fn() }))

const hardwareInfo = {
	cpu: { percent: 12.4, temperature: 46, num: 4 },
	mem: { usedPercent: 49, used: 2 * 1024 ** 3, total: 4 * 1024 ** 3 },
	sys_disk: { size: 100, used: 40, smart_status: 'passed' },
	net: [{ name: 'eth0', bytesSent: 0, bytesRecv: 0, time: 100 }],
}

function strip({ runs = [], snapraid, fleet, emit = vi.fn(), buefy = {}, destinations, backupSystem = vi.fn() } = {}) {
	return mount(HealthStrip, {
		global: {
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, name) => params[name]) : key),
				$store: { state: { hardwareInfo } },
				$buefy: buefy,
				$EventBus: { $emit: emit },
				$api: {
					backup: {
						getRuns: () => Promise.resolve({ data: { data: runs } }),
						// absent on a core that predates the call: the button is then left out
						...(destinations ? { getDestinations: () => Promise.resolve({ data: { data: destinations } }) } : {}),
						backupSystem,
					},
					disks: { snapraid: snapraid || (() => Promise.reject(new Error('404'))) },
					// absent on a core that predates the fleet: the panel then has nothing to ask
					...(fleet ? { fleet: { status: fleet } } : {}),
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
		expect(text).toContain('4 cores')
		expect(text).toContain('2 GB / 4 GB')
		// no second sample yet: no speed claimed
		expect(wrapper.findAll('.tile')).toHaveLength(5)
		expect(text).toContain('—')
	})

	it('follows the socket and works the network speed out of two samples', async () => {
		const wrapper = strip()
		const onUtilization = wrapper.vm.$options.sockets['casaos:system:utilization']
		const payload = (sent, recv, time, cpu) => ({
			Properties: {
				sys_cpu: JSON.stringify({ percent: cpu, num: 8, freq: 3400, power: { timestamp: String(time), value: String(time * 1e6 * 7.5) } }),
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
		// 15 J over the 2 s between the samples
		expect(wrapper.text()).toContain('8 cores · 3.4 GHz · 7.5 W')
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

	it('lists the disks the box reports with their role, SMART state and temperature', async () => {
		const wrapper = mount(HealthStrip, {
			global: {
				mocks: {
					$t: key => key,
					$store: { state: { hardwareInfo } },
					$EventBus: { $emit: vi.fn() },
					$api: {
						backup: { getRuns: () => Promise.resolve({ data: { data: [] } }) },
						disks: {
							snapraid: () => Promise.resolve({ data: { data: { configured: true, last: {}, config: { data: [{ path: '/media/a' }], parity: ['/media/p'] } } } }),
							getDiskList: () => Promise.resolve({ data: { data: { disks: [{ path: '/dev/sdb', temperature: 38, smart_status: 'passed' }, { path: '/dev/sdc', temperature: 0, smart_status: 'failed' }] } } }),
						},
						storage: {
							list: () => Promise.resolve({ data: { data: [
								{ path: '/dev/sda', disk_name: 'System', disk_model: 'Samsung SSD', children: [{ mount_point: '/', size: '100', used: '40' }] },
								{ path: '/dev/sdb', disk_name: 'Disk1', disk_model: 'WD Red', children: [{ mount_point: '/media/a', size: '1000', used: '250' }] },
								{ path: '/dev/sdc', disk_name: 'Disk2', disk_model: 'Parity one', children: [{ mount_point: '/media/p', size: '2000', used: '0' }] },
							] } }),
						},
					},
				},
			},
		})
		await settle()

		const drives = wrapper.findAll('.storage .drive')
		expect(drives).toHaveLength(3)
		expect(drives[0].text()).toContain('Samsung SSD')
		expect(drives[0].text()).toContain('System')
		// the system disk is no drive of the list: its SMART is the utilization's
		expect(drives[0].text()).toContain('Healthy')
		expect(drives[1].text()).toContain('Data disk · 25 %')
		expect(drives[1].text()).toContain('38°C')
		expect(drives[2].text()).toContain('Parity disk')
		expect(drives[2].text()).toContain('Damage')
		expect(drives[2].text()).not.toContain('°C')
	})

	it('opens the storage manager from the storage tile', async () => {
		const emit = vi.fn()
		const wrapper = strip({ emit })

		await wrapper.find('.tile.is-clickable').trigger('click')

		expect(emit).toHaveBeenCalledWith('casaUI:openStorageManager')
	})

	it('opens it from the keyboard too, since the tile is a div acting as a button', async () => {
		const emit = vi.fn()
		const wrapper = strip({ emit })
		const tile = wrapper.find('.tile.is-clickable')

		expect(tile.attributes('role')).toBe('button')
		expect(tile.attributes('tabindex')).toBe('0')
		await tile.trigger('keydown', { key: 'Enter' })
		await tile.trigger('keydown', { key: ' ' })

		expect(emit).toHaveBeenCalledTimes(2)
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

describe('health strip fleet panel', () => {
	const answer = data => () => Promise.resolve({ data: { data } })
	const master = boxes => answer({ role: 'master', master: { address: 'https://home.example', boxes } })
	const home = { id: 'a', name: 'Home', online: true, last_seen: '2026-11-03T10:00:00Z' }
	const cabin = { id: 'b', name: 'Cabin', online: false, last_seen: '2020-01-01T00:00:00Z' }
	const fresh = { id: 'c', name: 'Shed', online: false, last_seen: new Date().toISOString() }
	const nobody = { id: 'd', name: 'New', online: false }

	it('counts the boxes of a master that are online and says where each one stands', async () => {
		const wrapper = strip({ fleet: master([home, cabin, nobody]) })
		await settle()

		const panel = wrapper.find('.fleet')
		expect(panel.text()).toContain('1 of 3 boxes online')
		const rows = panel.findAll('li').map(li => li.text())
		expect(rows).toEqual(['HomeOnline', 'CabinOffline', 'NewNever connected'])
	})

	it('shows no panel on a box that is not a master, on an old core, or when the call fails', async () => {
		for (const fleet of [answer({ role: 'none' }), answer({ role: 'member', member: { connected: true } }), master([]), () => Promise.reject(new Error('404')), undefined]) {
			const wrapper = strip({ fleet })
			await settle()
			expect(wrapper.find('.fleet').exists()).toBe(false)
		}
	})

	it('puts a box that has been gone for a while in the attention list, not one that just dropped or never came', async () => {
		const wrapper = strip({ fleet: master([home, cabin, fresh, nobody]) })
		await settle()

		const lines = wrapper.findAll('.attention li').map(li => li.text())
		expect(lines).toEqual(['The box Cabin is offline'])
	})
})

describe('health strip fleet link', () => {
	const master = () => Promise.resolve({ data: { data: { role: 'master', master: { boxes: [{ id: 'a', name: 'Home', online: true }] } } } })

	it('opens the Fleet page from a Beta strip at the foot of the panel', async () => {
		const buefy = { modal: {} }
		const wrapper = strip({ fleet: master, buefy })
		await settle()

		const link = wrapper.find('.fleet button.fleet-open')
		expect(link.text()).toContain('Beta')
		expect(link.text()).toContain('Open the Fleet page')

		await link.trigger('click')

		// the page opens as the app card and the settings open it: with this box's modal service and store state
		expect(openFleet).toHaveBeenCalledWith(buefy, wrapper.vm.$store.state)
	})
})

describe('health strip opens the dialogs behind its panels', () => {
	const failed = [{ started_at: '2026-11-03T03:00:00Z', error: 'no route to host' }]

	it('opens the Storage manager from the storage panel and the SnapRAID tile', async () => {
		const emit = vi.fn()
		const wrapper = strip({ emit, snapraid: () => Promise.resolve({ data: { data: { configured: true, last: {} } } }) })
		await settle()

		await wrapper.find('.storage .panel-action').trigger('click')
		await wrapper.findAll('.tile').find(tile => tile.text().includes('SnapRAID')).trigger('click')

		expect(emit).toHaveBeenCalledTimes(2)
		expect(emit).toHaveBeenCalledWith('casaUI:openStorageManager')
	})

	it('opens the backups dialog, with the restore, from the backups panel and tile', async () => {
		const open = vi.fn()
		const wrapper = strip({ buefy: { modal: { open } } })
		await settle()

		await wrapper.find('.backups .panel-action').trigger('click')
		await wrapper.findAll('.tile').find(tile => tile.text().includes('Backups')).trigger('click')

		expect(open).toHaveBeenCalledTimes(2)
		expect(open.mock.calls[0][0]).toMatchObject({ customClass: 'backup-modal', hasModalCard: true })
	})

	it('opens what a failure is about: a failed backup opens the backups dialog', async () => {
		const open = vi.fn()
		const wrapper = strip({ runs: failed, buefy: { modal: { open } } })
		await settle()

		await wrapper.find('.attention .attention-item').trigger('click')

		expect(open).toHaveBeenCalledTimes(1)
	})
})

describe('health strip and the bell of the beta bar', () => {
	it('says how many things need a person, again when that changes', async () => {
		const wrapper = strip({ runs: [{ started_at: '2026-11-03T03:00:00Z', error: 'no route to host' }] })
		await settle()

		expect(wrapper.emitted('attention').map(args => args[0])).toEqual([0, 1])
	})

	it('brings the attention panel into view and focuses it', () => {
		const wrapper = strip()
		const panel = wrapper.find('.attention').element
		panel.scrollIntoView = vi.fn()

		wrapper.vm.showAttention()

		expect(panel.scrollIntoView).toHaveBeenCalledTimes(1)
		expect(document.activeElement === panel || panel.tabIndex === -1).toBe(true)
	})
})

describe('health strip back up now', () => {
	const toast = vi.fn()
	const confirmed = () => ({ dialog: { confirm: vi.fn(options => options.onConfirm()) }, toast: { open: toast } })

	it('has no button on a box with no destination, or one that cannot list them', async () => {
		expect((await settled(strip({ destinations: [] }))).find('.backups .panel-action').text()).toBe('Backups and restore')
		expect((await settled(strip())).findAll('.backups .panel-action')).toHaveLength(1)
	})

	async function settled(wrapper) {
		await settle()
		return wrapper
	}

	it('backs the box up to where the last backup went, once the dialog that warns of the stop is confirmed', async () => {
		const backupSystem = vi.fn(() => Promise.resolve())
		const buefy = confirmed()
		const wrapper = await settled(strip({ destinations: ['usb', 'nas'], runs: [{ started_at: '2026-11-03T03:00:00Z', destination: 'nas' }], buefy, backupSystem }))

		await wrapper.findAll('.backups .panel-action')[0].trigger('click')
		await settle()

		expect(buefy.dialog.confirm.mock.calls[0][0].message).toContain('unreachable for a few seconds')
		expect(backupSystem).toHaveBeenCalledWith('nas', true)
		expect(toast.mock.calls.at(-1)[0].type).toBe('is-success')
	})

	it('falls back to the first destination, and says what the box answered when it refuses', async () => {
		const backupSystem = vi.fn(() => Promise.reject(Object.assign(new Error('refused'), { response: { data: { message: 'a backup is already running' } } })))
		const wrapper = await settled(strip({ destinations: ['usb', 'nas'], buefy: confirmed(), backupSystem }))

		await wrapper.findAll('.backups .panel-action')[0].trigger('click')
		await settle()

		expect(backupSystem).toHaveBeenCalledWith('usb', true)
		expect(toast.mock.calls.at(-1)[0]).toMatchObject({ message: 'a backup is already running', type: 'is-danger' })
	})
})
