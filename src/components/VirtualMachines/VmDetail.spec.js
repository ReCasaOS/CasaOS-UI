// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST, aVm } from './__fixtures__/vm'
import VmDetail from './VmDetail.vue'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { hostUSB: vi.fn(), setCDROM: vi.fn() } }))

describe('the detail of a virtual machine', () => {
	let wrapper

	afterEach(() => wrapper?.unmount())

	const open = (props = {}) => {
		wrapper = mount(VmDetail, {
			attachTo: document.body,
			props: { vm: aVm({ state: 'shut-off' }), host: HOST, ...props },
			global: { plugins: [Buefy, i18n] },
		})
		return wrapper
	}

	it('lists as CD-ROM choices the ISOs the service can take, those under /DATA', async () => {
		open({
			images: [
				{ path: '/DATA/VM/iso/alpine.iso', name: 'alpine.iso', kind: 'iso' },
				{ path: '/media/usb/VM/iso/debian.iso', name: 'debian.iso', kind: 'iso' },
				{ path: '/DATA/VM/iso/disk.qcow2', name: 'disk.qcow2', kind: 'disk' },
			],
		})
		await wrapper.setData({ tab: 'storage' })

		const isos = wrapper.findAll('option').map(option => option.element.value).filter(value => value.endsWith('.iso'))
		expect(isos).toEqual(['/DATA/VM/iso/alpine.iso'])
	})

	it('names every button, the plus and minus of the number fields included', () => {
		open()

		const unnamed = wrapper.findAll('button').filter(b => !(b.attributes('aria-label') || b.attributes('title') || b.text()))
		expect(unnamed).toHaveLength(0)
		expect(wrapper.find('button[aria-label="Increase"]').exists()).toBe(true)
	})

	it('keeps the disc in the drive in the list, wherever it is', async () => {
		open({ vm: aVm({ state: 'shut-off', cdrom: '/media/usb/VM/iso/debian.iso' }), images: [] })
		await wrapper.setData({ tab: 'storage' })

		expect(wrapper.findAll('option').map(option => option.element.value)).toContain('/media/usb/VM/iso/debian.iso')
	})

	it('takes a snapshot of a running VM, and goes back to one or deletes it only with the VM off', async () => {
		const snapshots = [{ id: 's1', name: 'before the update', created_at: '2026-11-10T08:00:00Z' }]
		open({ vm: aVm({ state: 'running', snapshots }) })
		await wrapper.setData({ tab: 'snapshots', snapName: 'now' })

		const button = text => wrapper.findAll('button').find(b => b.text() === text)
		expect(wrapper.find('input[placeholder="Snapshot name"]').attributes('disabled')).toBeUndefined()
		expect(button('Take snapshot').attributes('disabled')).toBeUndefined()
		expect(button('Go back').attributes('disabled')).toBeDefined()
		expect(button('Delete').attributes('disabled')).toBeDefined()
		expect(wrapper.text()).toContain('The VM pauses for an instant while the snapshot is taken.')

		await wrapper.setProps({ vm: aVm({ state: 'creating', snapshots }) })
		expect(button('Take snapshot').attributes('disabled')).toBeDefined()
	})
})
