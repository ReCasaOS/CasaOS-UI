// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import DriveItem from './DriveItem.vue'

function mountItem(props) {
	return shallowMount(DriveItem, {
		props,
		global: {
			mocks: { $t: key => key },
			stubs: { 'b-icon': true },
		},
	})
}

describe('what a drive row says it carries', () => {
	it('lists the mount points of its partitions', () => {
		const text = mountItem({ item: { path: '/dev/sda', children: [{ mount_point: '/media/a' }] }, free: false }).find('._carries').text()
		expect(text).toBe('/media/a')
	})

	it('falls back to the storages on it when its partitions show no mount', () => {
		const text = mountItem({ item: { path: '/dev/nvme0n1', children: [{ mount_point: '' }] }, free: false, storageMounts: ['/'] }).find('._carries').text()
		expect(text).toBe('/')
	})

	it('says "In use" for a drive that is not offered and shows no mount', () => {
		expect(mountItem({ item: { path: '/dev/mmcblk2' }, free: false }).find('._carries').text()).toBe('In use')
	})

	it('says "Free drive" for a drive the box offers', () => {
		expect(mountItem({ item: { path: '/dev/sdb' }, free: true }).find('._carries').text()).toBe('Free drive')
	})
})
