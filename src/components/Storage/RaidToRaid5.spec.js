// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import RaidToRaid5 from '@/components/Storage/RaidToRaid5.vue'
import RaidStatus from '@/components/Storage/RaidStatus.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const mirror = { name: 'md0', level: 'raid1', state: 'ok', action: 'idle', disks: 2, missing: 0, component_size: 1000, size: 1000, members: [{ name: 'sdb', disk: 'sdb', state: 'active' }, { name: 'sdc', disk: 'sdc', state: 'active' }] }
const raid5 = { ...mirror, level: 'raid5', disks: 3, size: 2000 }
const avail = [{ name: 'sdd', path: '/dev/sdd', model: 'WD', size: 2000 }, { name: 'sde', path: '/dev/sde', model: 'small', size: 999 }]

function change(api) {
	const toast = vi.fn()
	const wrapper = mount(RaidToRaid5, { props: { array: mirror }, global: { plugins: [Buefy, i18n], mocks: { $api: { disks: api } } } })
	wrapper.vm.$buefy.toast.open = toast
	return { wrapper, toast }
}

describe('changing a mirror to RAID 5', () => {
	const getDiskList = () => Promise.resolve({ data: { data: { avail } } })

	it('offers only the blank disks big enough, and goes only once the disk name is typed again', async () => {
		const raidToRaid5 = vi.fn().mockResolvedValue({})
		const { wrapper, toast } = change({ getDiskList, raidToRaid5 })
		await flushPromises()

		expect(wrapper.vm.candidates.map(d => d.path)).toEqual(['/dev/sdd'])
		expect(wrapper.vm.ready).toBe(false)
		wrapper.vm.typed = 'sde'
		expect(wrapper.vm.ready).toBe(false)
		wrapper.vm.typed = 'sdd'
		expect(wrapper.vm.ready).toBe(true)

		await wrapper.vm.change()
		expect(raidToRaid5).toHaveBeenCalledWith('md0', '/dev/sdd', 'sdd')
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-success' }))
		expect(wrapper.emitted('changed')).toHaveLength(1)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('says when no disk is big enough, and shows a refusal as text, reading the list again as the disk may be erased', async () => {
		const refusal = Object.assign(new Error('refused'), { response: { data: { message: 'only a RAID 1 of <b>two</b> disks' } } })
		const { wrapper, toast } = change({ getDiskList: () => Promise.resolve({ data: { data: { avail: [avail[1]] } } }), raidToRaid5: () => Promise.reject(refusal) })
		await flushPromises()
		expect(wrapper.text()).toContain('No blank disk is big enough')

		wrapper.vm.path = '/dev/sde'
		await wrapper.vm.change()
		expect(toast.mock.calls[0][0].message).toBe('only a RAID 1 of &lt;b&gt;two&lt;/b&gt; disks')
		expect(wrapper.emitted('changed')).toHaveLength(1)
		expect(wrapper.emitted('close')).toBeUndefined()
	})
})

describe('the buttons of a whole array', () => {
	function status(array, fsSize, api = {}) {
		const wrapper = mount(RaidStatus, { props: { array, fsSize }, global: { plugins: [Buefy, i18n], mocks: { $api: { disks: api } } } })
		wrapper.vm.$buefy.toast.open = vi.fn()
		return wrapper
	}
	const buttons = wrapper => wrapper.findAll('button').map(b => b.text())

	it('offer RAID 5 on a whole mirror, and the new room once a RAID 5 holds more than its filesystem', () => {
		expect(buttons(status(mirror, 940))).toEqual(['Change to RAID 5'])
		expect(buttons(status(raid5, 940))).toEqual(['Use the new space'])
		expect(buttons(status(raid5, 1900))).toEqual([])
		expect(buttons(status({ ...raid5, state: 'reshaping', action: 'reshape' }, 940))).toEqual([])
	})

	it('grow the filesystem by the array name, and ask for the list again', async () => {
		const growRaidFilesystem = vi.fn().mockResolvedValue({})
		const wrapper = status(raid5, 940, { growRaidFilesystem })
		await wrapper.vm.growFilesystem()
		expect(growRaidFilesystem).toHaveBeenCalledWith('md0')
		expect(wrapper.emitted('changed')).toHaveLength(1)
		expect(wrapper.vm.isGrowing).toBe(false)
	})

	it('show a refusal as text and stop loading', async () => {
		const refusal = Object.assign(new Error('refused'), { response: { data: { message: 'wait until <i>it</i> is over' } } })
		const wrapper = status(raid5, 940, { growRaidFilesystem: () => Promise.reject(refusal) })
		await wrapper.vm.growFilesystem()
		expect(wrapper.vm.$buefy.toast.open.mock.calls[0][0].message).toBe('wait until &lt;i&gt;it&lt;/i&gt; is over')
		expect(wrapper.vm.isGrowing).toBe(false)
		expect(wrapper.emitted('changed')).toBeUndefined()
	})
})

const KEYS = [
	'Change to RAID 5',
	'Use the new space',
	'Change {name} to RAID 5',
	'The mirror becomes a RAID 5 of three drives: it holds twice as much and still survives one failed drive. It stays usable while it reorganizes onto the new drive, which takes hours for large drives, so do not switch the box off before it is over.',
	'Everything on {disk} is erased.',
	'Erase and change',
	'{name} is changing to RAID 5: it reorganizes in the background.',
	'Reshaping {percent} %',
	'The filesystem now uses the room of {name}.',
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
