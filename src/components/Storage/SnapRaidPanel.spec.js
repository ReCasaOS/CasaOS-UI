// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import SnapRaidPanel from '@/components/Storage/SnapRaidPanel.vue'
import { snapraidTag, snapraidWhen } from '@/components/Storage/snapraid'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name])
const config = { data: [{ name: 'd1', path: '/media/a' }, { name: 'd2', path: '/media/b' }], parity: ['/media/p'], max_removed: 40, hour: 3 }
const ok = at => ({ at, ok: true })
const candidates = [{ name: 'Parity', size: 4000000000000, mount_point: '/media/p' }, { name: 'Spare', size: 2000000000000, mount_point: '/media/s' }, { name: 'Third', size: 2000000000000, mount_point: '/media/t' }]

function panel(state, api = {}) {
	const snapraid = vi.fn(() => Promise.resolve({ data: { data: state } }))
	const wrapper = mount(SnapRaidPanel, {
		props: { candidates },
		global: { plugins: [Buefy, i18n], mocks: { $api: { disks: { snapraid, setSnapraid: vi.fn(() => Promise.resolve({})), runSnapraid: vi.fn(() => Promise.resolve({})), stopSnapraid: vi.fn(() => Promise.resolve({})), ...api } } } },
	})
	return { wrapper, snapraid }
}

describe('what the tag says', () => {
	it('puts what needs a person before what is only late', () => {
		const set = { configured: true, config }
		expect(snapraidTag({ ...set, last: {} }, t)).toEqual({ type: 'is-warning', text: 'Not synced yet' })
		expect(snapraidTag({ ...set, last: { sync: ok('2026-11-01T03:00:00Z') } }, t)).toEqual({ type: 'is-success', text: 'Protected' })
		expect(snapraidTag({ ...set, last: { sync: { at: '2026-11-01T03:00:00Z', ok: false, blocked: true } } }, t).text).toBe('Sync held back')
		expect(snapraidTag({ ...set, last: { sync: { at: '2026-11-01T03:00:00Z', ok: false } } }, t).text).toBe('The last sync failed')
		expect(snapraidTag({ ...set, last: { sync: ok('2026-11-01T03:00:00Z'), scrub: { at: '2026-11-01T04:00:00Z', ok: false } } }, t).text).toBe('The last check found a problem')
		expect(snapraidTag({ ...set, missing: ['d2'], last: { sync: ok('2026-11-01T03:00:00Z') } }, t).type).toBe('is-danger')
		expect(snapraidTag({ ...set, job: { action: 'sync', percent: 42 }, missing: ['d2'], last: {} }, t)).toEqual({ type: 'is-info', text: 'Syncing 42 %' })
	})

	it('knows a time Go never set', () => {
		expect(snapraidWhen('0001-01-01T00:00:00Z')).toBe('')
		expect(snapraidWhen(undefined)).toBe('')
		expect(snapraidWhen('2026-11-01T03:00:00Z')).not.toBe('')
	})
})

describe('the panel', () => {
	it('stays out of the way on a box that has no SnapRAID', async () => {
		const { wrapper } = panel(null, { snapraid: () => Promise.reject(new Error('404')) })
		await flushPromises()
		expect(wrapper.text()).toBe('')
	})

	it('offers the storages of their own as parity, at most two, and sets up with the ones ticked', async () => {
		const setSnapraid = vi.fn(() => Promise.resolve({}))
		const { wrapper, snapraid } = panel({ installed: false, configured: false, last: {} }, { setSnapraid })
		await flushPromises()
		expect(wrapper.text()).toContain('Parity')
		const boxes = wrapper.findAll('input[type=checkbox]')
		expect(boxes).toHaveLength(3)
		expect(wrapper.find('button.is-link').attributes('disabled')).toBeDefined()
		await boxes[0].setValue(true)
		await boxes[1].setValue(true)
		await flushPromises()
		expect(boxes[2].attributes('disabled')).toBeDefined()
		await wrapper.find('button.is-link').trigger('click')
		await flushPromises()
		expect(setSnapraid).toHaveBeenCalledWith('/DATA', ['/media/p', '/media/s'])
		expect(snapraid).toHaveBeenCalledTimes(2)
	})

	it('says a storage of its own is needed when there is none', async () => {
		const wrapper = mount(SnapRaidPanel, {
			props: { candidates: [] },
			global: { plugins: [Buefy, i18n], mocks: { $api: { disks: { snapraid: () => Promise.resolve({ data: { data: { configured: false, last: {} } } }) } } } },
		})
		await flushPromises()
		expect(wrapper.text()).toContain('A storage of its own is needed')
		expect(wrapper.find('button').exists()).toBe(false)
	})

	it('shows how it stands, and lets a held back sync go on', async () => {
		const runSnapraid = vi.fn(() => Promise.resolve({}))
		const state = {
			installed: true,
			configured: true,
			config,
			last: {
				sync: { at: '2026-11-01T03:00:00Z', ok: false, blocked: true, message: '41 files were removed since the last sync' },
				diff: { at: '2026-11-01T09:00:00Z', ok: true, diff: { added: 3, removed: 41, updated: 2 } },
			},
		}
		const { wrapper } = panel(state, { runSnapraid })
		await flushPromises()
		const text = wrapper.text().replace(/\s+/g, ' ')
		expect(text).toContain('Sync held back')
		expect(text).toContain('41 files were removed since the last sync')
		expect(text).toContain('Since the last sync: 3 added, 41 removed, 2 changed.')
		await wrapper.findAll('button').find(b => b.text() === 'Sync anyway').trigger('click')
		expect(runSnapraid).toHaveBeenCalledWith('sync', { force: true })
	})

	it('reads again while something is at work, and offers to stop it', async () => {
		vi.useFakeTimers()
		try {
			const stopSnapraid = vi.fn(() => Promise.resolve({}))
			const { wrapper, snapraid } = panel({ configured: true, config, job: { action: 'scrub', percent: 12 }, last: {} }, { stopSnapraid })
			await vi.advanceTimersByTimeAsync(0)
			const text = wrapper.text().replace(/\s+/g, ' ')
			expect(text).toContain('Checking the disks 12 %')
			expect(text).not.toContain('Sync now')
			await vi.advanceTimersByTimeAsync(3000)
			expect(snapraid).toHaveBeenCalledTimes(2)
			await wrapper.findAll('button').find(b => b.text() === 'Stop').trigger('click')
			expect(stopSnapraid).toHaveBeenCalled()
			wrapper.unmount()
		} finally {
			vi.useRealTimers()
		}
	})

	it('asks for the disk to be typed again before it repairs, and sends it as confirmation', async () => {
		const runSnapraid = vi.fn(() => Promise.resolve({}))
		const { wrapper } = panel({ configured: true, config, last: { sync: ok('2026-11-01T03:00:00Z') } }, { runSnapraid })
		await flushPromises()
		let prompt
		wrapper.vm.$buefy.dialog.prompt = (options) => {
			prompt = options
		}
		await wrapper.findAll('button').find(b => b.text() === 'Repair…').trigger('click')
		expect(prompt.message).toContain('d1 (/media/a), d2 (/media/b)')
		await prompt.onConfirm(' d2 ')
		expect(runSnapraid).toHaveBeenLastCalledWith('fix', { disk: 'd2', confirm: 'd2' })
		await prompt.onConfirm('all')
		expect(runSnapraid).toHaveBeenLastCalledWith('fix', { confirm: 'all' })
	})
})

describe('the words', () => {
	it('are all in French as well', () => {
		const keys = [
			'Disk failure protection (SnapRAID)',
			'Protect the merged storage',
			'Sync now',
			'Look for changes',
			'Check the disks',
			'Repair…',
			'Remove protection',
			'Sync anyway',
			'Not synced yet',
			'A disk is missing',
			'Sync held back',
			'The last sync failed',
			'The last check found a problem',
			'Looking for changes',
			'Syncing',
			'Repairing',
		]
		for (const key of keys) {
			expect(en[key], key).toBeDefined()
			expect(fr[key], key).toBeDefined()
		}
	})
})
