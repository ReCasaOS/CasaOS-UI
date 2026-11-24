// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TreeListItem from './TreeListItem.vue'
import { usageOf } from './MountList.vue'

const t = (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key)

function line(item) {
	return mount(TreeListItem, {
		props: { item: { name: 'Disk', path: '/media/disk', visible: true, icon: 'storage-other', pack: 'casa', ...item } },
		global: { plugins: [Buefy], provide: { filePanel: { getFileList() {} } }, mocks: { $t: t, $store: { state: { currentPath: '/' } } } },
	})
}

describe('a drive\'s room in the sidebar (CasaOS#184)', () => {
	it('reads the storage list\'s byte counts, which come as strings', () => {
		expect(usageOf({ size: '1000', avail: '250' })).toEqual({ free: 250, size: 1000 })
		expect(usageOf({ size: '0', avail: '0' })).toBeNull()
		expect(usageOf({ size: '', avail: '10' })).toBeNull()
		expect(usageOf({ size: 'n/a', avail: '10' })).toBeNull()
		expect(usageOf({})).toBeNull()
	})

	it('fills the bar with what is used, says the room left on hover, and warns when nearly full', () => {
		let wrapper = line({ usage: { free: 300 * 1024 * 1024, size: 1024 * 1024 * 1024 } })
		const bar = wrapper.find('[data-usage-bar]')
		expect(bar.attributes('title')).toBe('300 MB free of 1 GB')
		expect(bar.find('span').attributes('style')).toContain('width: 71%')
		expect(bar.find('span').classes()).not.toContain('is-full')
		wrapper.unmount()

		wrapper = line({ usage: { free: 5, size: 100 } })
		expect(wrapper.find('[data-usage-bar] span').classes()).toContain('is-full')
		wrapper.unmount()
	})

	it('draws no bar for a folder, a remote, or numbers that do not add up', () => {
		for (const usage of [undefined, null, { free: 10, size: 0 }, { free: 20, size: 10 }]) {
			const wrapper = line({ usage })
			expect(wrapper.find('[data-usage-bar]').exists()).toBe(false)
			wrapper.unmount()
		}
	})
})
