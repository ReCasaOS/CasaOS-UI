// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import StoragePool from '@/components/Storage/StoragePool.vue'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

function pool(id, verbs) {
	return {
		id,
		name: id,
		backend: 'btrfs',
		layout: { kind: 'mirror', copies: 2, stripe: true },
		layout_known: true,
		state: 'ok',
		mounted: true,
		tolerates: 1,
		size: 8e9,
		used: 1e9,
		action: 'idle',
		members: [{ name: 'vdb', disk: 'vdb', state: 'active', size: 8e9 }],
		verbs,
	}
}
const drives = [{ name: 'vdc', role: 'free', size: 8e9, model: 'A', type: 'SSD', verbs: ['add-disk'] }]

function card(view) {
	const open = vi.fn()
	const wrapper = mount(StoragePool, { props: { view: { drives, jobs: [], ...view } }, global: { plugins: [Buefy, i18n] } })
	wrapper.vm.$buefy.modal.open = open
	return { wrapper, open }
}

describe('the pools of the storage layer', () => {
	it('shows a card per pool, its layout in words, and its actions; deleting one is red', () => {
		const { wrapper } = card({ pools: [pool('data', ['check', 'delete-pool'])], verbs: [] })
		expect(wrapper.findAll('h4').map(h => h.text())).toEqual(['data'])
		expect(wrapper.text()).toContain('Mirror, 2 copies, striped')
		const del = wrapper.findAll('button').find(b => b.text() === 'Delete the pool')
		expect(del.classes()).toContain('is-danger')
		// one pool here: no other pool is offered
		expect(wrapper.findAll('button').filter(b => b.text() === 'Create a pool')).toHaveLength(0)
	})

	it('offers another pool only where the backend says so, and names the pool an action is for', async () => {
		const { wrapper, open } = card({ pools: [pool('a', ['check']), pool('b', ['check'])], verbs: ['create-pool'] })
		expect(wrapper.findAll('h4').map(h => h.text())).toEqual(['a', 'b'])
		expect(wrapper.findAll('button').filter(b => b.text() === 'Create a pool')).toHaveLength(1)
		// a drive's add-disk is ambiguous with two pools: not offered there
		expect(wrapper.findAll('button').filter(b => b.text() === 'Add to the pool')).toHaveLength(0)
		await wrapper.findAll('button').filter(b => b.text() === 'Check now')[1].trigger('click')
		expect(open.mock.calls[0][0].props).toMatchObject({ verb: 'check', pool: { id: 'b' } })
	})

	it('without a pool: made from blank disks when the backend offers it', () => {
		expect(card({ pools: [], verbs: ['create-pool'] }).wrapper.find('button.is-primary').attributes('disabled')).toBeUndefined()
		expect(card({ pools: [], verbs: [] }).wrapper.find('button.is-primary').attributes('disabled')).toBeDefined()
	})
})
