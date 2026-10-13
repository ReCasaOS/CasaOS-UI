// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST } from './__fixtures__/vm'
import StorageSettingsModal from './StorageSettingsModal.vue'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { storageFolder: vi.fn(), setStorage: vi.fn() } }))

const warning = 'the service only takes images from /DATA'

describe('the settings of the virtual machines', () => {
	let wrapper

	afterEach(() => wrapper?.unmount())

	const open = storagePath => (wrapper = mount(StorageSettingsModal, {
		attachTo: document.body,
		props: { host: { ...HOST, storage_path: storagePath } },
		global: { plugins: [Buefy, i18n] },
	}))

	it('say nothing about a folder under /DATA', () => {
		open('/DATA/VM')
		expect(wrapper.text()).not.toContain(warning)
	})

	it('say that the images kept in a folder elsewhere cannot be used yet', () => {
		open('/media/usb/VM')
		expect(wrapper.text()).toContain(warning)
	})
})
