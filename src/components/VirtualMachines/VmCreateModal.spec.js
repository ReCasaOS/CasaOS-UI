// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST } from './__fixtures__/vm'
import VmCreateModal from './VmCreateModal.vue'
import vmApi from './api'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { images: vi.fn(), host: vi.fn(), create: vi.fn(), uploadImage: vi.fn() } }))

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

// An image sent from the browser, in the middle of making a VM
describe('the upload in the create dialog', () => {
	let wrapper

	beforeEach(() => {
		vi.clearAllMocks()
		vmApi.images.mockResolvedValue({ data: { data: [] } })
		vmApi.host.mockResolvedValue({ data: { data: HOST } })
	})
	afterEach(() => {
		wrapper?.unmount()
		document.querySelectorAll('.dialog').forEach(dialog => dialog.closest('.modal')?.remove())
	})

	const open = async () => {
		wrapper = mount(VmCreateModal, { attachTo: document.body, props: { host: HOST }, global: { plugins: [Buefy, i18n] } })
		await flushPromises()
	}
	const button = text => wrapper.findAll('button').find(b => b.text() === text)
	const upload = async (name) => {
		const input = wrapper.find('input[type="file"]')
		Object.defineProperty(input.element, 'files', { value: [new File(['x'], name)], configurable: true })
		await input.trigger('change')
		await button('Upload').trigger('click')
		await flushPromises()
	}

	it('selects the image it uploaded, and lists it at once', async () => {
		const image = { path: '/DATA/VM/iso/alpine-3.20.iso', name: 'alpine-3.20.iso', kind: 'iso', size_bytes: 1, sha256: 'a'.repeat(64) }
		vmApi.uploadImage.mockResolvedValue(image)
		await open()
		await upload('alpine-3.20.iso')

		expect(wrapper.vm.form.image_path).toBe(image.path)
		expect(wrapper.vm.form.title).toBe('alpine-3.20')
		expect(wrapper.vm.suggestions.map(i => i.path)).toContain(image.path)
	})

	it('reads the list again when no answer came: the file may be there', async () => {
		vmApi.uploadImage.mockRejectedValue(new Error('Network Error'))
		await open()
		expect(vmApi.images).toHaveBeenCalledTimes(1)
		await upload('a.iso')

		// once for the checks, once after
		expect(vmApi.images).toHaveBeenCalledTimes(3)
		expect(wrapper.find('.vm-upload-error').text()).toBe('The upload was refused or interrupted.')
	})

	it('asks before closing while it uploads, with a sentence of its own, and does not make a VM meanwhile', async () => {
		vmApi.uploadImage.mockReturnValue(new Promise(() => {}))
		await open()
		await upload('<img src=x onerror=1>.iso')
		expect(button('Create').attributes('disabled')).toBeDefined()

		// the dialog's own Cancel, not the upload's
		await wrapper.findAll('footer button').find(b => b.text() === 'Cancel').trigger('click')
		await flushPromises()
		expect(wrapper.emitted('close')).toBeUndefined()
		const dialog = document.querySelector('.dialog')
		expect(dialog.querySelector('.media-content').textContent.trim()).toBe('An image is still uploading. Close and stop the upload?')
		expect(dialog.querySelector('img')).toBeNull()

		dialog.querySelectorAll('button').forEach(b => b.textContent.trim() === 'Stop the upload' && b.click())
		await flushPromises()
		expect(vmApi.uploadImage.mock.calls[0][1].signal.aborted).toBe(true)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('closes at once when nothing uploads', async () => {
		await open()
		await button('Cancel').trigger('click')
		expect(wrapper.emitted('close')).toHaveLength(1)
		expect(document.querySelector('.dialog')).toBeNull()
	})
})
