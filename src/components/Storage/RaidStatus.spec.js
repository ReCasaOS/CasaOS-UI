// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import RaidStatus from '@/components/Storage/RaidStatus.vue'
import StorageManagerPanel from '@/components/Storage/StorageManagerPanel.vue'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

describe('the state of an array', () => {
	it('names its level, its disks and what is wrong with them', () => {
		const array = {
			name: 'md1',
			level: 'raid5',
			state: 'rebuilding',
			action: 'recover',
			progress: 42.7,
			remaining: 4800,
			missing: 1,
			members: [{ name: 'sdb1', disk: 'sdb', state: 'active' }, { name: 'sdc1', disk: 'sdc', state: 'faulty' }, { name: 'sdd', disk: 'sdd', state: 'rebuilding' }],
		}
		const wrapper = mount(RaidStatus, { props: { array }, global: { plugins: [Buefy, i18n] } })
		const text = wrapper.text().replace(/\s+/g, ' ')
		expect(text).toContain('Rebuilding 42 %')
		expect(text).toContain('RAID 5 · md1')
		expect(text).toContain('1 h 20 min left')
		expect(text).toContain('sdb')
		expect(text).toContain('sdc (Faulty)')
		expect(text).toContain('sdd (Rebuilding)')
		expect(text).toContain('Missing: 1')
	})
})

describe('the storage manager', () => {
	it('lists on their own the arrays no storage is mounted on', () => {
		const mounted = { path: '/dev/md0' }
		const stopped = { path: '/dev/md1' }
		const unmounted = StorageManagerPanel.computed.unmountedArrays.call({ raidArrays: [mounted, stopped], storageData: [{ raid: mounted }, { raid: undefined }] })
		expect(unmounted).toEqual([stopped])
	})
})
