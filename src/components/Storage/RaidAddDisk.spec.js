// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import RaidAddDisk from '@/components/Storage/RaidAddDisk.vue'
import RaidStatus from '@/components/Storage/RaidStatus.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const degraded = {
	name: 'md0',
	level: 'raid1',
	state: 'degraded',
	missing: 1,
	component_size: 1000,
	members: [{ name: 'sdb1', disk: 'sdb', state: 'active' }, { name: 'sdc1', disk: 'sdc', state: 'faulty' }],
}

function addDisk(api) {
	const toast = vi.fn()
	const wrapper = mount(RaidAddDisk, {
		props: { array: degraded },
		global: { plugins: [Buefy, i18n], mocks: { $api: { disks: api } } },
	})
	wrapper.vm.$buefy.toast.open = toast
	return { wrapper, toast }
}

describe('adding a disk to an array', () => {
	const avail = [{ name: 'sdd', path: '/dev/sdd', model: 'WD', size: 2000 }, { name: 'sde', path: '/dev/sde', model: 'small', size: 999 }]

	it('offers only the blank disks big enough, and adds one only once its name is typed again', async () => {
		const addToRaid = vi.fn().mockResolvedValue({})
		const { wrapper, toast } = addDisk({ getDiskList: () => Promise.resolve({ data: { data: { avail } } }), addToRaid })
		await flushPromises()

		expect(wrapper.vm.candidates.map(d => d.path)).toEqual(['/dev/sdd'])
		expect(wrapper.vm.ready).toBe(false)
		wrapper.vm.typed = 'sde'
		expect(wrapper.vm.ready).toBe(false)
		wrapper.vm.typed = 'sdd'
		expect(wrapper.vm.ready).toBe(true)

		await wrapper.vm.add()
		expect(addToRaid).toHaveBeenCalledWith('md0', '/dev/sdd', 'sdd')
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-success' }))
		expect(wrapper.emitted('added')).toHaveLength(1)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('says when no disk is big enough, and shows a refusal as text', async () => {
		const refusal = Object.assign(new Error('refused'), { response: { data: { message: 'mdadm is <b>not</b> installed' } } })
		const { wrapper, toast } = addDisk({ getDiskList: () => Promise.resolve({ data: { data: { avail: [avail[1]] } } }), addToRaid: () => Promise.reject(refusal) })
		await flushPromises()
		expect(wrapper.text()).toContain('No blank disk is big enough')

		wrapper.vm.path = '/dev/sde'
		await wrapper.vm.add()
		expect(toast.mock.calls[0][0].message).toBe('mdadm is &lt;b&gt;not&lt;/b&gt; installed')
		expect(wrapper.emitted('added')).toBeUndefined()
	})
})

describe('the repair buttons of an array', () => {
	function status(array, api = {}) {
		return mount(RaidStatus, { props: { array }, global: { plugins: [Buefy, i18n], mocks: { $api: { disks: api } } } })
	}

	it('offer a disk where one is lacking or failed, never on a whole or stopped array', () => {
		expect(status(degraded).vm.canAdd).toBe(true)
		expect(status({ ...degraded, missing: 0 }).vm.canAdd).toBe(true) // the failed disk is still in it
		expect(status({ ...degraded, missing: 0, members: [{ name: 'sdb1', disk: 'sdb', state: 'active' }] }).vm.canAdd).toBe(false)
		expect(status({ ...degraded, state: 'inactive' }).vm.canAdd).toBe(false)
	})

	it('take a failed disk out by its member name, and ask for the list again', async () => {
		const removeFromRaid = vi.fn().mockResolvedValue({})
		const wrapper = status(degraded, { removeFromRaid })
		expect(wrapper.findAll('a').map(a => a.text())).toEqual(['Take out']) // on the failed disk only

		await wrapper.vm.takeOut(degraded.members[1])
		expect(removeFromRaid).toHaveBeenCalledWith('md0', 'sdc1')
		expect(wrapper.emitted('changed')).toHaveLength(1)
	})
})

const KEYS = [
	'Add a disk',
	'Take out',
	'Add a disk to {name}',
	'No blank disk is big enough: it must hold at least {size}.',
	'Everything on {disk} is erased, then {name} rebuilds onto it.',
	'Type {disk} to confirm',
	'Erase and add',
	'{disk} is added: {name} rebuilds onto it.',
	'Take {disk} out of {name}?',
	'It has failed: the array goes on with its other disks. You can then unplug it.',
	'{disk} is taken out of {name}.',
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
