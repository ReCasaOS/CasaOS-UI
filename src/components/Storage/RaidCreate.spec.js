// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import RaidCreate from '@/components/Storage/RaidCreate.vue'
import { RAID_LEVELS, raidEstimate } from '@/components/Storage/raid'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const TB = 1000 * 1000 * 1000 * 1000
const disk = (name, size = 2 * TB) => ({ name, path: `/dev/${name}`, model: 'WD', size })
const avail = [disk('sdb'), disk('sdc'), disk('sdd', 4 * TB), disk('sde')]

function create(api, free = avail) {
	const toast = vi.fn()
	const wrapper = mount(RaidCreate, {
		global: { plugins: [Buefy, i18n], mocks: { $api: { disks: { getDiskList: () => Promise.resolve({ data: { data: { avail: free } } }), ...api } } } },
	})
	wrapper.vm.$buefy.toast.open = toast
	return { wrapper, toast }
}

describe('what an array of some disks holds', () => {
	it.each([
		['raid1', [2, 4], 2, 1],
		['raid1', [2, 2, 4], 2, 2],
		['raid5', [2, 2, 4], 4, 1],
		['raid6', [2, 2, 2, 4], 4, 2],
		['raid10', [2, 2, 2, 4], 4, 1],
		['raid10', [2, 2, 2, 2, 2], 5, 1],
		['raid0', [2, 4], 4, 0],
		['raid0', [2, 2, 4], 6, 0],
	])('%s on %j holds %i and survives %i', (level, sizes, capacity, survives) => {
		expect(raidEstimate(level, sizes.map(s => s * TB))).toEqual({ capacity: capacity * TB, survives })
	})

	it('says nothing for too few disks, and for a level that is not offered', () => {
		expect(raidEstimate('raid5', [TB, TB])).toBeNull()
		expect(raidEstimate('raid10', [TB, TB, TB])).toBeNull()
		expect(raidEstimate('raid0', [TB])).toBeNull()
		expect(raidEstimate('linear', [TB, TB])).toBeNull()
		// raid0 comes last: the level the window starts on is one that survives a failed disk
		expect(Object.keys(RAID_LEVELS)).toEqual(['raid1', 'raid5', 'raid6', 'raid10', 'raid0'])
	})
})

describe('making an array', () => {
	it('offers the levels the blank disks are enough for, and none to start with selected', async () => {
		const { wrapper } = create({}, [avail[0], avail[1], avail[2]])
		await flushPromises()
		expect(wrapper.vm.levels).toEqual(['raid1', 'raid5', 'raid0'])
		expect(wrapper.vm.level).toBe('raid1')
		expect(wrapper.vm.selected).toEqual([])
		expect(wrapper.vm.ready).toBe(false)
	})

	it('goes on only for a valid name typed again and enough disks, and sends what was chosen', async () => {
		const createRaid = vi.fn().mockResolvedValue({})
		const { wrapper, toast } = create({ createRaid })
		await flushPromises()

		wrapper.vm.name = 'pool'
		wrapper.vm.level = 'raid5'
		wrapper.vm.selected = ['/dev/sdb', '/dev/sdc']
		wrapper.vm.typed = 'pool'
		expect(wrapper.vm.ready).toBe(false) // raid5 needs three

		wrapper.vm.selected = ['/dev/sdb', '/dev/sdc', '/dev/sdd']
		expect(wrapper.vm.ready).toBe(true)
		expect(wrapper.vm.estimate).toEqual({ capacity: 4 * TB, survives: 1 })
		wrapper.vm.typed = 'pol'
		expect(wrapper.vm.ready).toBe(false)
		wrapper.vm.typed = 'pool'

		await wrapper.vm.create()
		expect(createRaid).toHaveBeenCalledWith('pool', 'raid5', ['/dev/sdb', '/dev/sdc', '/dev/sdd'], 'pool', false)
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-success' }))
		expect(wrapper.emitted('changed')).toHaveLength(1)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('makes a RAID 0 only once the loss is accepted, and says so to the API', async () => {
		const createRaid = vi.fn().mockResolvedValue({})
		const { wrapper, toast } = create({ createRaid })
		await flushPromises()
		wrapper.vm.name = 'fast'
		wrapper.vm.level = 'raid0'
		wrapper.vm.selected = ['/dev/sdb', '/dev/sdc']
		wrapper.vm.typed = 'fast'
		await wrapper.vm.$nextTick()
		expect(wrapper.vm.estimate).toEqual({ capacity: 4 * TB, survives: 0 })
		expect(wrapper.vm.estimateText).toContain('loses everything')
		expect(wrapper.vm.ready).toBe(false)
		expect(wrapper.text()).toContain('I understand that if one drive fails, everything on fast is lost.')

		wrapper.vm.acceptLoss = true
		expect(wrapper.vm.ready).toBe(true)

		await wrapper.vm.create()
		expect(createRaid).toHaveBeenCalledWith('fast', 'raid0', ['/dev/sdb', '/dev/sdc'], 'fast', true)
		expect(toast.mock.calls[0][0].message).toBe('fast is created.')
	})

	it('forgets the consent when the level changes, and never sends it for another level', async () => {
		const createRaid = vi.fn().mockResolvedValue({})
		const { wrapper } = create({ createRaid })
		await flushPromises()
		wrapper.vm.name = 'pool'
		wrapper.vm.level = 'raid0'
		await wrapper.vm.$nextTick()
		wrapper.vm.acceptLoss = true
		wrapper.vm.level = 'raid1'
		await wrapper.vm.$nextTick()
		expect(wrapper.vm.acceptLoss).toBe(false)
		wrapper.vm.level = 'raid0'
		await wrapper.vm.$nextTick()
		wrapper.vm.selected = ['/dev/sdb', '/dev/sdc']
		wrapper.vm.typed = 'pool'
		expect(wrapper.vm.ready).toBe(false)

		wrapper.vm.acceptLoss = true
		wrapper.vm.level = 'raid1'
		await wrapper.vm.$nextTick()
		wrapper.vm.acceptLoss = true // a stale consent on a level that does not ask for it
		await wrapper.vm.create()
		expect(createRaid).toHaveBeenCalledWith('pool', 'raid1', ['/dev/sdb', '/dev/sdc'], 'pool', false)
	})

	it.each(['', 'my pool', 'pool;', 'école', 'seventeen_letters'])('refuses the name "%s"', async (name) => {
		const { wrapper } = create({})
		await flushPromises()
		wrapper.vm.name = name
		wrapper.vm.selected = ['/dev/sdb', '/dev/sdc']
		wrapper.vm.typed = name
		expect(wrapper.vm.ready).toBe(false)
	})

	it('shows a refusal as text, stays open, and still asks for the lists again', async () => {
		const refusal = Object.assign(new Error('refused'), { response: { data: { message: 'mdadm is <b>not</b> installed' } } })
		const { wrapper, toast } = create({ createRaid: () => Promise.reject(refusal) })
		await flushPromises()
		wrapper.vm.name = 'pool'
		wrapper.vm.selected = ['/dev/sdb', '/dev/sdc']
		wrapper.vm.typed = 'pool'

		await wrapper.vm.create()
		expect(toast.mock.calls[0][0].message).toBe('mdadm is &lt;b&gt;not&lt;/b&gt; installed')
		expect(wrapper.emitted('close')).toBeUndefined()
		expect(wrapper.emitted('changed')).toHaveLength(1)
		expect(wrapper.vm.isCreating).toBe(false)
	})

	it('says so when fewer than two blank disks are left', async () => {
		const { wrapper } = create({}, [avail[0]])
		await flushPromises()
		expect(wrapper.text()).toContain('Plug at least two blank drives')
	})
})

const KEYS = [
	'Create RAID',
	'Plug at least two blank drives to make a RAID.',
	'Create a RAID storage',
	'Name of the storage',
	'Letters, digits and underscores, 16 at most',
	'RAID level',
	'Drives to use',
	'This level needs at least {count} drives.',
	'Holds {size}. One failed drive loses nothing.',
	'Holds {size}. Up to {count} failed drives lose nothing.',
	'RAID 1 - a mirror, from 2 drives',
	'RAID 5 - one drive may fail, from 3 drives',
	'RAID 6 - two drives may fail, from 4 drives',
	'RAID 10 - mirrored pairs, from 4 drives',
	'Everything on the chosen drives is erased. {name} is usable at once, while the RAID synchronizes in the background.',
	'RAID 0 - no protection, from 2 drives',
	'Holds {size}. One failed drive loses everything.',
	'I understand that if one drive fails, everything on {name} is lost.',
	'Everything on the chosen drives is erased. {name} is usable at once.',
	'{name} is created.',
	'No protection',
	'Type {name} to confirm',
	'Erase and create',
	'{name} is created: it synchronizes in the background.',
]

describe('the language files', () => {
	it.each(KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		expect((fr[key].match(/\{\w+\}/g) || []).sort()).toEqual((key.match(/\{\w+\}/g) || []).sort())
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
	})
})
