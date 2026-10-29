// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import StoragePlan from '@/components/Storage/StoragePlan.vue'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const drives = [
	{ name: 'vdb', role: 'free', size: 8e9, model: 'A' },
	{ name: 'vdc', role: 'free', size: 8e9, model: 'B' },
	{ name: 'vda', role: 'system', size: 8e9, model: 'S' },
]
const layouts = [
	{ layout: { kind: 'none' }, tolerates: 0, capacity: 16e9, possible: true, min_disks: 1 },
	{ layout: { kind: 'mirror', copies: 2 }, tolerates: 1, capacity: 8e9, possible: true, min_disks: 2 },
	{ layout: { kind: 'parity', parity: 1 }, tolerates: 1, capacity: 0, possible: false, min_disks: 3 },
]
const plan = {
	id: 'p1',
	summary: 'Create the pool on vdb, vdc',
	steps: ['Make the filesystem', 'Mount the pool'],
	commands: [['mkfs.btrfs', '-d', 'raid1', '--', '/dev/vdb', '/dev/vdc']],
	effects: { capacity_before: 0, capacity_after: 8e9, tolerates_before: 0, tolerates_after: 1, erases: ['vdb', 'vdc'], notes: [] },
	confirm: 'vdb vdc',
}

function dialog(props, pools) {
	const toast = vi.fn()
	const wrapper = mount(StoragePlan, { props, global: { plugins: [Buefy, i18n], mocks: { $api: { pools } } } })
	wrapper.vm.$buefy.toast.open = toast
	return { wrapper, toast }
}

describe('a storage plan', () => {
	it('creates a pool: disks, then the most protective layout they allow, a preview, the typed confirmation', async () => {
		const api = {
			layouts: vi.fn().mockResolvedValue({ data: { data: layouts } }),
			plan: vi.fn().mockResolvedValue({ data: { data: plan } }),
			apply: vi.fn().mockResolvedValue({ data: { data: { id: 'p1', state: 'running' } } }),
		}
		const { wrapper, toast } = dialog({ verb: 'create-pool', drives }, api)
		await flushPromises()
		expect(wrapper.vm.disks.map(d => d.name)).toEqual(['vdb', 'vdc']) // never the system disk
		expect(wrapper.vm.chosen).toBe(false)

		wrapper.vm.diskNames = ['vdb', 'vdc']
		await flushPromises()
		expect(api.layouts).toHaveBeenLastCalledWith(['vdb', 'vdc'])
		expect(wrapper.vm.chosenLayout).toEqual({ kind: 'mirror', copies: 2 })

		await wrapper.vm.preview()
		expect(api.plan).toHaveBeenCalledWith({ verb: 'create-pool', disks: ['vdb', 'vdc'], layout: { kind: 'mirror', copies: 2 } })
		expect(wrapper.text()).toContain('Everything on vdb, vdc is erased.')
		expect(wrapper.text()).toContain('Show the commands')
		expect(wrapper.vm.showCommands).toBe(false) // folded until asked
		expect(wrapper.vm.confirmed).toBe(false)
		wrapper.vm.typed = 'vdb'
		expect(wrapper.vm.confirmed).toBe(false)
		wrapper.vm.typed = 'vdb vdc'
		expect(wrapper.vm.confirmed).toBe(true)

		await wrapper.vm.apply()
		expect(api.apply).toHaveBeenCalledWith('p1', 'vdb vdc')
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-success' }))
		expect(wrapper.emitted('applied')).toHaveLength(1)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('shows a refusal as text and stays on the choice', async () => {
		const refusal = Object.assign(new Error('409'), { response: { status: 409, data: { message: 'vdb cannot be used: it is <b>in use</b>' } } })
		const api = { layouts: vi.fn().mockResolvedValue({ data: { data: layouts } }), plan: vi.fn().mockRejectedValue(refusal) }
		const { wrapper } = dialog({ verb: 'add-disk', pool: { backend: 'btrfs', members: [] }, drives, disk: drives[0] }, api)
		await flushPromises()
		await wrapper.vm.preview()
		expect(wrapper.vm.plan).toBe(null)
		expect(wrapper.html()).toContain('&lt;b&gt;in use&lt;/b&gt;')
	})

	it('goes straight to the preview when there is nothing to choose', async () => {
		const api = { plan: vi.fn().mockResolvedValue({ data: { data: { ...plan, confirm: '', effects: { ...plan.effects, erases: [] } } } }) }
		const { wrapper } = dialog({ verb: 'check', pool: { backend: 'btrfs', members: [] }, drives }, api)
		await flushPromises()
		expect(api.plan).toHaveBeenCalledWith({ verb: 'check' })
		expect(wrapper.vm.confirmed).toBe(true)
	})

	it('chooses again when the storage changed before apply', async () => {
		const stale = Object.assign(new Error('409'), { response: { status: 409, data: { message: 'the storage changed' } } })
		const api = { plan: vi.fn().mockResolvedValue({ data: { data: { ...plan, confirm: '' } } }), apply: vi.fn().mockRejectedValue(stale) }
		const { wrapper, toast } = dialog({ verb: 'check', pool: { backend: 'btrfs', members: [] }, drives }, api)
		await flushPromises()
		await wrapper.vm.apply()
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-danger' }))
		expect(wrapper.vm.plan).toBe(null)
	})
})
