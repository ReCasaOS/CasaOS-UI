// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import ZfsPanel from '@/components/Storage/ZfsPanel.vue'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

function pool(over = {}) {
	return {
		name: 'pool1',
		health: 'ONLINE',
		size: 1992864825344,
		allocated: 1324916645888,
		free: 667948179456,
		fragmentation: 64,
		capacity: 66,
		known: true,
		state: 'ONLINE',
		status: '',
		action: '',
		data_errors: 0,
		scan: { kind: 'scrub', state: 'finished', percent: -1, remaining: -1, repaired: '0B', errors: 0, duration: 4867, started: 0, ended: 1762562708 },
		vdevs: [{ name: 'mirror-0', kind: 'mirror', state: 'ONLINE', read: 0, write: 0, cksum: 0, children: [
			{ name: '/dev/disk/by-id/nvme-WD_A-part1', kind: 'disk', state: 'ONLINE', read: 0, write: 0, cksum: 0, disk: 'nvme0n1' },
			{ name: '/dev/disk/by-id/nvme-WD_B-part1', kind: 'disk', state: 'ONLINE', read: 0, write: 0, cksum: 0, disk: 'nvme1n1' },
		] }],
		...over,
	}
}
const dataset = (name, over = {}) => ({ name, pool: 'pool1', type: 'filesystem', used: 303757225984, available: 407809804698, referenced: 302870736896, used_by_snapshots: 886489088, mountpoint: `/${name}`, mounted: true, quota: 0, key_status: '', ...over })
const overview = (over = {}) => ({ available: true, pools: [pool()], datasets_known: true, datasets: [dataset('pool1', { used_by_snapshots: 0 }), dataset('pool1/appdata')], ...over })
const reading = (at, n) => [{ pool: 'pool1', at, read_bytes: n * 1000, write_bytes: n * 2000, read_ops: n, write_ops: n * 2 }]

function panel(state = overview(), api = {}, props = {}) {
	const disks = {
		zfs: vi.fn(() => Promise.resolve({ data: { data: state } })),
		zfsIo: vi.fn(() => Promise.resolve({ data: { data: [] } })),
		zfsSnapshots: vi.fn(() => Promise.resolve({ data: { data: { dataset: 'pool1/appdata', snapshots: [{ name: 'backup_1', used: 19500000, referenced: 1, written: 17000000, created: 1762306757 }], truncated: false } } })),
		...api,
	}
	const wrapper = mount(ZfsPanel, { props, global: { plugins: [Buefy, i18n], mocks: { $api: { disks } } } })
	return { wrapper, disks }
}

afterEach(() => {
	vi.useRealTimers()
})

describe('the zfs panel', () => {
	it('shows a pool with its health, drives, last scrub, capacity and datasets', async () => {
		const { wrapper } = panel()
		await flushPromises()
		const text = wrapper.text()
		expect(wrapper.find('.health').classes()).toContain('is-success')
		expect(text).toContain('pool1')
		expect(text).toContain('mirror-0')
		expect(text).toContain('nvme-WD_A-part1')
		expect(text).toContain('nvme0n1')
		expect(text).toMatch(/Last scan: scrub, no error, took 01:21:07/)
		expect(text).toContain('Fragmentation 64 %')
		expect(text).toContain('appdata')
		expect(text).toContain('/pool1/appdata')
		expect(wrapper.find('.capacity').exists()).toBe(true)
	})

	it('does not show a pool whose state could not be read as healthy', async () => {
		const { wrapper } = panel(overview({ pools: [pool({ known: false, state: '', vdevs: [] })] }))
		await flushPromises()
		const tag = wrapper.find('.health')
		expect(tag.text()).toContain('State unknown')
		expect(tag.classes()).not.toContain('is-success')
		expect(wrapper.find('.scan').exists()).toBe(false)
	})

	it('shows a degraded pool, its words, and the drive that is gone', async () => {
		const degraded = pool({
			state: 'DEGRADED',
			status: 'One or more devices could not be opened.',
			action: 'Attach the missing device.',
			data_errors: 2,
			vdevs: [{ name: 'raidz1-0', kind: 'raidz', state: 'DEGRADED', read: 0, write: 0, cksum: 0, children: [{ name: '1148576142', kind: 'disk', state: 'UNAVAIL', read: 0, write: 0, cksum: 0, note: 'was /dev/sdc1' }] }],
		})
		const { wrapper } = panel(overview({ pools: [degraded] }))
		await flushPromises()
		expect(wrapper.find('.health').classes()).toContain('is-warning')
		expect(wrapper.find('.drives').text()).toContain('UNAVAIL')
		expect(wrapper.text()).toContain('2 files have permanent errors')
		expect(wrapper.text()).toContain('One or more devices could not be opened.')
		expect(wrapper.text()).toContain('was /dev/sdc1')
	})

	it('says when ZFS did not answer, and what it shows is the last reading', async () => {
		const { wrapper } = panel(null, { zfs: () => Promise.reject(new Error('500')) })
		await flushPromises()
		expect(wrapper.text()).toContain('ZFS did not answer.')
		const stale = panel(overview({ stale: true }))
		await flushPromises()
		expect(stale.wrapper.find('.stale').exists()).toBe(true)
	})

	it('asks for the snapshots of a dataset when its list is opened, and once', async () => {
		const { wrapper, disks } = panel()
		await flushPromises()
		expect(disks.zfsSnapshots).not.toHaveBeenCalled()
		const toggle = () => wrapper.findAll('.dataset')[1].find('.toggle')
		await toggle().trigger('click')
		await flushPromises()
		expect(disks.zfsSnapshots).toHaveBeenCalledWith('pool1/appdata')
		expect(wrapper.find('.snapshots').text()).toContain('@backup_1')
		await toggle().trigger('click')
		await toggle().trigger('click')
		await flushPromises()
		expect(disks.zfsSnapshots).toHaveBeenCalledTimes(1)
		expect(wrapper.find('.snapshots').exists()).toBe(true)
	})

	it('says so when a dataset has no snapshot, and when the list is cut', async () => {
		const empty = panel(overview(), { zfsSnapshots: () => Promise.resolve({ data: { data: { snapshots: [], truncated: false } } }) })
		await flushPromises()
		await empty.wrapper.findAll('.dataset')[1].find('.toggle').trigger('click')
		await flushPromises()
		expect(empty.wrapper.find('.snapshots').text()).toContain('No snapshots.')

		const cut = panel(overview(), { zfsSnapshots: () => Promise.resolve({ data: { data: { snapshots: [{ name: 'a', used: 1, written: 1, created: 1 }], truncated: true } } }) })
		await flushPromises()
		await cut.wrapper.findAll('.dataset')[1].find('.toggle').trigger('click')
		await flushPromises()
		expect(cut.wrapper.find('.snapshots').text()).toContain('Only the newest 1 are shown.')
	})

	it('shows the live rates from the second reading on, never at the first', async () => {
		vi.useFakeTimers()
		const zfsIo = vi.fn()
			.mockResolvedValueOnce({ data: { data: reading(1000, 1) } })
			.mockResolvedValue({ data: { data: reading(4000, 4) } })
		const { wrapper } = panel(overview(), { zfsIo })
		await vi.advanceTimersByTimeAsync(0)
		expect(wrapper.find('.io').exists()).toBe(false)
		await vi.advanceTimersByTimeAsync(3000)
		expect(wrapper.find('.io').text()).toContain('Live: read')
		expect(wrapper.find('.io').text()).toContain('1 op/s')
		wrapper.unmount()
	})

	it('asks again every few seconds while on show, and stops asking when the tab is left', async () => {
		vi.useFakeTimers()
		const { wrapper, disks } = panel()
		await vi.advanceTimersByTimeAsync(0)
		expect(disks.zfs).toHaveBeenCalledTimes(1)
		expect(disks.zfsIo).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(15000)
		expect(disks.zfs).toHaveBeenCalledTimes(2)
		expect(disks.zfsIo.mock.calls.length).toBeGreaterThanOrEqual(5)

		await wrapper.setProps({ active: false })
		const listed = disks.zfs.mock.calls.length
		const counted = disks.zfsIo.mock.calls.length
		await vi.advanceTimersByTimeAsync(120000)
		expect(disks.zfs).toHaveBeenCalledTimes(listed)
		expect(disks.zfsIo).toHaveBeenCalledTimes(counted)

		await wrapper.setProps({ active: true })
		await vi.advanceTimersByTimeAsync(0)
		expect(disks.zfs).toHaveBeenCalledTimes(listed + 1)
		wrapper.unmount()
		await vi.advanceTimersByTimeAsync(120000)
		expect(disks.zfs).toHaveBeenCalledTimes(listed + 1)
	})

	it('asks nothing when it is not the tab on show', async () => {
		const { disks } = panel(overview(), {}, { active: false })
		await flushPromises()
		expect(disks.zfs).not.toHaveBeenCalled()
		expect(disks.zfsIo).not.toHaveBeenCalled()
	})
})

// A key the code uses that a language file lacks would show as the bare English sentence.
describe('the language keys of the zfs code', () => {
	const folder = import.meta.dirname
	const read = file => readFileSync(file, 'utf8')
	const en = JSON.parse(read(join(folder, '../../assets/lang/en_US.json')))
	const fr = JSON.parse(read(join(folder, '../../assets/lang/fr_FR.json')))
	// $t('key') and t('key'), with any of the three quotes (\x60 is the backtick)
	const CALL = /(?:\$t|\bt)\(\s*(['"\x60])((?:\\.|(?!\1)[^\\])*)\1/g
	const used = new Set(['ZFS'])
	for (const file of ['zfs.js', 'ZfsPanel.vue'].map(f => join(folder, f)).filter(existsSync)) {
		for (const [, , key] of read(file).matchAll(CALL)) {
			used.add(key.replace(/\\(.)/g, '$1'))
		}
	}

	it('finds the keys it is made to find', () => {
		expect(used.size).toBeGreaterThan(30)
		expect(used).toContain('State unknown')
		expect(used).toContain('Live: read {read} ({readOps} op/s), write {write} ({writeOps} op/s)')
	})

	it.each([['en_US', en], ['fr_FR', fr]])('are all in %s', (_, file) => {
		expect([...used].filter(k => typeof file[k] !== 'string' || file[k] === '')).toEqual([])
	})

	it('keep the same placeholders in French', () => {
		const names = text => (text.match(/\{\w+\}/g) || []).sort().join()
		expect([...used].filter(k => names(fr[k]) !== names(k))).toEqual([])
	})
})
