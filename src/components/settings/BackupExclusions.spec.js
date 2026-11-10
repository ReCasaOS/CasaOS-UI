// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BackupExclusions from './BackupExclusions.vue'
import i18n from '@/plugins/i18n'

// keys are shown as they are, so the assertions read the English
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const answer = paths => Promise.resolve({ data: { data: { paths } } })

let wrapper

async function open(backup) {
	wrapper = mount(BackupExclusions, {
		global: {
			plugins: [Buefy, i18n],
			mocks: { $api: { backup }, $buefy: { toast: { open() {} } } },
		},
	})
	await flushPromises()
	return wrapper
}

const saveButton = w => w.findAll('button').find(b => b.text() === 'Save')

describe('the folders left out of backups', () => {
	afterEach(() => wrapper?.unmount())

	it('shows the list one folder per line', async () => {
		await open({ getExclusions: () => answer(['/DATA/Media', '/mnt/nas']) })

		expect(wrapper.find('textarea').element.value).toBe('/DATA/Media\n/mnt/nas')
	})

	it('saves the lines that hold something and shows the list as the box keeps it', async () => {
		const saveExclusions = vi.fn(() => answer(['/mnt/nas']))
		await open({ getExclusions: () => answer([]), saveExclusions })

		await wrapper.find('textarea').setValue('  /mnt/nas/ \n\n')
		await saveButton(wrapper).trigger('click')
		await flushPromises()

		expect(saveExclusions).toHaveBeenCalledWith(['/mnt/nas/'])
		expect(wrapper.find('textarea').element.value).toBe('/mnt/nas')
	})

	it('says why the box refused and keeps what was typed', async () => {
		const refusal = { response: { data: { message: 'leaving out / would leave out everything' } } }
		await open({ getExclusions: () => answer([]), saveExclusions: () => Promise.reject(refusal) })

		await wrapper.find('textarea').setValue('/')
		await saveButton(wrapper).trigger('click')
		await flushPromises()

		expect(wrapper.text()).toContain('leaving out / would leave out everything')
		expect(wrapper.find('textarea').element.value).toBe('/')
	})

	it('cannot save over a list that did not load', async () => {
		await open({ getExclusions: () => Promise.reject(new Error('Network Error')) })

		// a key with no translation is shown as written, its {error} included
		expect(wrapper.text()).toContain('The folders left out could not be loaded')
		expect(wrapper.find('textarea').element.disabled).toBe(true)
		expect(saveButton(wrapper).element.disabled).toBe(true)
	})
})
