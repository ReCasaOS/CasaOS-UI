// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import Disks from '@/widgets/Disks.vue'
import DriveItem from '@/components/Storage/DriveItem.vue'

// require.context has no Vite equivalent. The real en_US table stands in for it, so
// the reclaim strings below are checked against the keys that actually ship.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
// The widget imports the Storage manager for its settings button, and lottie-web
// paints into a canvas on import - happy-dom has no 2d context.
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

/**
 * On a virtual disk smartctl answers without a `smart_status` object, and
 * LocalStorage used to read the zero value as "failed": the home widget showed
 * Damage while the Storage manager called the same disk healthy. LocalStorage
 * now sends `smart_status` ("passed" / "failed" / "unavailable"); an older
 * LocalStorage only sends the `health` Boolean, which still decides.
 */
const cases = [
	['a passed disk', { health: true, smart_status: 'passed' }, 'Healthy'],
	['a failed disk', { health: false, smart_status: 'failed' }, 'Damaged'],
	['a disk without SMART data', { health: true, smart_status: 'unavailable' }, 'No SMART data'],
	['an older LocalStorage without smart_status', { health: true }, 'Healthy'],
	['an older LocalStorage reporting a failure', { health: false }, 'Damaged'],
]

const danglingImages = vi.fn()
const pruneDanglingImages = vi.fn()
const $openAPI = { appManagement: { image: { danglingImages, pruneDanglingImages } } }

function mountWidget(sys_disk) {
	const $store = { state: { hardwareInfo: { sys_disk: { size: 100, used: 40, ...sys_disk }, sys_usb: [] } } }
	return mount(Disks, { global: { plugins: [Buefy, i18n], mocks: { $store, $openAPI } } })
}

describe('storage widget', () => {
	beforeEach(() => {
		danglingImages.mockReset().mockResolvedValue({ data: { data: { count: 0, size: 0 } } })
		pruneDanglingImages.mockReset().mockResolvedValue({ data: { data: { count: 0, size: 0 } } })
	})

	// mounted() reads the store after the first render: the tag settles a tick later.
	it.each(cases)('tags %s', async (_label, sys_disk, tag) => {
		const wrapper = mountWidget(sys_disk)
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.tag').text()).toBe(tag)
		wrapper.unmount()
	})

	it('follows the next utilization sample', async () => {
		const wrapper = mountWidget({ health: true, smart_status: 'passed' })
		const onUtilization = wrapper.vm.$options.sockets['casaos:system:utilization']
		onUtilization.call(wrapper.vm, { Properties: {
			sys_disk: JSON.stringify({ size: 100, used: 40, health: true, smart_status: 'unavailable' }),
			sys_usb: '[]',
		} })
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.tag').text()).toBe('No SMART data')
		wrapper.unmount()
	})
})

describe('drive item', () => {
	const rows = [
		['a passed disk', { health: true, smart_status: 'passed' }, 'Healthy'],
		['a failed disk', { health: false, smart_status: 'failed' }, 'Damaged'],
		['a disk without SMART data', { health: true, smart_status: 'unavailable' }, 'N/A'],
		['an older LocalStorage sending health as the string "true"', { health: 'true' }, 'Healthy'],
		['an older LocalStorage sending health as the string "false"', { health: 'false' }, 'Damaged'],
		['an older LocalStorage without smart_status', { health: true }, 'Healthy'],
	]

	it.each(rows)('reads the health of %s', (_label, disk, text) => {
		const item = { name: 'sda', model: 'QEMU HARDDISK', size: 100, disk_type: 'HDD', temperature: 0, ...disk }
		const wrapper = mount(DriveItem, { props: { item }, global: { plugins: [Buefy, i18n] } })
		expect(wrapper.find('p b').text()).toBe(text)
		wrapper.unmount()
	})
})

describe('reclaimable disk space', () => {
	beforeEach(() => {
		danglingImages.mockReset().mockResolvedValue({ data: { data: { count: 0, size: 0 } } })
		pruneDanglingImages.mockReset().mockResolvedValue({ data: { data: { count: 0, size: 0 } } })
	})

	// The dialog is opened programmatically and lands in document.body, not the wrapper.
	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('offers nothing when there is nothing to reclaim', async () => {
		const wrapper = mountWidget({ health: true })
		await flushPromises()
		expect(wrapper.text()).not.toContain('Old app versions')
		wrapper.unmount()
	})

	it('stays quiet when the daemon cannot be reached', async () => {
		danglingImages.mockRejectedValue(new Error('no docker socket'))
		const wrapper = mountWidget({ health: true })
		await flushPromises()
		expect(wrapper.text()).not.toContain('Old app versions')
		wrapper.unmount()
	})

	it('names the count and the size before asking, and the dialog says what goes', async () => {
		danglingImages.mockResolvedValue({ data: { data: { count: 3, size: 4509715660 } } })
		const wrapper = mountWidget({ health: true })
		await flushPromises()
		expect(wrapper.text()).toContain('Old app versions: 3')
		expect(wrapper.text()).toContain('4.2 GB')

		await wrapper.find('button').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('Free up 4.2 GB')
		expect(document.body.textContent).toContain('Old versions to delete: 3')
		expect(pruneDanglingImages).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it('prunes on confirmation and re-reads what is left', async () => {
		danglingImages.mockResolvedValue({ data: { data: { count: 3, size: 4509715660 } } })
		pruneDanglingImages.mockResolvedValue({ data: { data: { count: 3, size: 4509715660 } } })
		const wrapper = mountWidget({ health: true })
		await flushPromises()
		await wrapper.find('button').trigger('click')
		await flushPromises()

		const buttons = document.querySelectorAll('.modal-card-foot button')
		danglingImages.mockResolvedValue({ data: { data: { count: 0, size: 0 } } })
		buttons[buttons.length - 1].click()
		await flushPromises()

		expect(pruneDanglingImages).toHaveBeenCalledTimes(1)
		expect(danglingImages).toHaveBeenCalledTimes(2)
		expect(wrapper.text()).not.toContain('Old app versions')
		wrapper.unmount()
	})
})

describe('the RAID tag of the storage widget', () => {
	function mountWith(arrays) {
		const $store = { state: { hardwareInfo: { sys_disk: { size: 100, used: 40, health: true, smart_status: 'passed' }, sys_usb: [] } } }
		const $api = { disks: { raid: vi.fn().mockResolvedValue({ data: { data: arrays } }) } }
		return mount(Disks, { global: { plugins: [Buefy, i18n], mocks: { $store, $openAPI, $api } } })
	}

	beforeEach(() => {
		danglingImages.mockReset().mockResolvedValue({ data: { data: { count: 0, size: 0 } } })
	})

	it('names an array that lacks a disk, and stays quiet about healthy ones', async () => {
		const wrapper = mountWith([
			{ name: 'md0', level: 'raid1', state: 'ok', progress: -1 },
			{ name: 'md1', level: 'raid5', state: 'rebuilding', progress: 42.7 },
		])
		await flushPromises()
		expect(wrapper.find('.raid-tag').text()).toBe('RAID: Rebuilding 42 %')
		wrapper.unmount()
	})

	it('shows nothing when every array is fine, or when LocalStorage has no such route', async () => {
		const fine = mountWith([{ name: 'md0', level: 'raid1', state: 'checking', progress: 10 }])
		await flushPromises()
		expect(fine.find('.raid-tag').exists()).toBe(false)
		fine.unmount()

		const older = mountWidget({ health: true }) // no $api: the call throws, and is ignored
		await flushPromises()
		expect(older.find('.raid-tag').exists()).toBe(false)
		older.unmount()
	})
})
