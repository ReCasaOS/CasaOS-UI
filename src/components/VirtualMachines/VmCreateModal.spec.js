// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST } from './__fixtures__/vm'
import VmCreateModal from './VmCreateModal.vue'
import vmApi from './api'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { images: vi.fn(), create: vi.fn() } }))

// what axios throws on an answer that is not a success
const failed = (status, message) => () => Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message } } }))

describe('the create dialog', () => {
	let wrapper

	beforeEach(() => {
		vi.clearAllMocks()
		vmApi.images.mockResolvedValue({ data: { data: [] } })
	})
	afterEach(() => wrapper?.unmount())

	// named and sent
	const create = async (answer) => {
		vmApi.create.mockImplementation(answer)
		wrapper = mount(VmCreateModal, { attachTo: document.body, props: { host: HOST }, global: { plugins: [Buefy, i18n] } })
		await flushPromises()
		await wrapper.find('input[maxlength="128"]').setValue('Debian')
		await wrapper.findAll('button').find(b => b.text() === 'Create').trigger('click')
		await flushPromises()
	}

	it('closes when the service made the VM and could not start it, instead of offering to make another', async () => {
		await create(failed(409, 'cannot start: not enough memory'))

		expect(vmApi.create).toHaveBeenCalledTimes(1)
		expect(wrapper.emitted('notStarted')).toEqual([['Debian', 'cannot start: not enough memory']])
		expect(wrapper.emitted('close')).toHaveLength(1)
		expect(wrapper.emitted('created')).toBeUndefined()
	})

	it('stays open, with the reason, when the VM was not made', async () => {
		await create(failed(400, 'image is not under /DATA'))

		expect(wrapper.emitted('close')).toBeUndefined()
		expect(wrapper.emitted('notStarted')).toBeUndefined()
		expect(wrapper.find('.message-body').text()).toBe('image is not under /DATA')
	})

	it('hands over the VM it made', async () => {
		const vm = { id: 'vm-2', title: 'Debian' }
		await create(() => Promise.resolve({ status: 201, data: { data: vm } }))

		expect(wrapper.emitted('created')).toEqual([[vm, false]])
		expect(wrapper.emitted('close')).toHaveLength(1)
	})
})

// The service reads images from /DATA only, wherever the disks of the VMs go.
describe('the images the create dialog suggests', () => {
	let wrapper

	afterEach(() => wrapper?.unmount())

	it('leave out those the service would refuse', async () => {
		vmApi.images.mockResolvedValue({
			data: {
				data: [
					{ path: '/DATA/VM/iso/alpine.iso', name: 'alpine.iso', kind: 'iso', size_bytes: 1 },
					{ path: '/media/usb/VM/iso/debian.iso', name: 'debian.iso', kind: 'iso', size_bytes: 1 },
				],
			},
		})
		wrapper = mount(VmCreateModal, { attachTo: document.body, props: { host: HOST }, global: { plugins: [Buefy, i18n] } })
		await flushPromises()

		expect(wrapper.vm.suggestions.map(image => image.path)).toEqual(['/DATA/VM/iso/alpine.iso'])
	})
})
