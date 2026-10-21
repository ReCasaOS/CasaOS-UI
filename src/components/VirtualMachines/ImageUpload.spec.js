// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageUpload from './ImageUpload.vue'
import vmApi from './api'
import { UPLOAD_ERRORS, UPLOAD_RESERVE_BYTES, uploadErrorCode, uploadProgress, uploadRefusal } from './vms'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { images: vi.fn(), host: vi.fn(), uploadImage: vi.fn() } }))

const GIB = 1024 ** 3
// a file of the size the test says, without the bytes
const aFile = (name, size = 1024) => Object.defineProperty(new File([''], name), 'size', { value: size })
const anImage = (name, fields = {}) => ({ path: `/DATA/VM/iso/${name}`, name, kind: 'iso', size_bytes: 1024, sha256: 'a'.repeat(64), ...fields })
// what axios throws on an answer that is not a success, and on no answer at all
const refused = (status, code) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message: code } } })
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

// an answer the test gives when it likes
function deferred() {
	let resolve, reject
	const promise = new Promise((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe('what the dialog checks before sending a file', () => {
	const images = [anImage('Debian-12.iso'), anImage('café.iso'), { ...anImage('elsewhere.iso'), path: '/DATA/Downloads/elsewhere.iso' }]
	const storagePath = '/DATA/VM'

	it('refuses the name of a file already in the iso folder, as the service compares it', () => {
		expect(uploadRefusal(aFile('Debian-12.iso'), { images, storagePath })).toBe('exists')
		// the service's file system tells the case apart
		expect(uploadRefusal(aFile('debian-12.ISO'), { images, storagePath })).toBe('')
		// the name the service writes is NFC: a decomposed é is the same file
		expect(uploadRefusal(aFile('café.iso'), { images, storagePath })).toBe('exists')
		// an image of that name somewhere else is not in the way
		expect(uploadRefusal(aFile('elsewhere.iso'), { images, storagePath })).toBe('')
		// without the folder, the service decides
		expect(uploadRefusal(aFile('Debian-12.iso'), { images })).toBe('')
	})

	it.each([
		['a/b.iso', 'a slash'],
		['a\\b.iso', 'a backslash'],
		['a\u0000b.iso', 'a NUL'],
		['a\nb.iso', 'a newline'],
		['a‮osi.exe.iso', 'a bidi override'],
		['a​b.iso', 'a zero-width space'],
		['.hidden.iso', 'a leading dot'],
		['a.iso.', 'a trailing dot'],
		['a.iso ', 'a trailing space'],
		[' a.iso', 'a leading space'],
		['CON.iso', 'a Windows device'],
		['nul.qcow2.xz', 'a Windows device with two extensions'],
		['com1.iso', 'a COM port'],
		['LPT9.img', 'an LPT port'],
		[`${'é'.repeat(124)}.iso`, 'more than 250 bytes of UTF-8'],
	])('refuses %j, with %s, as the service does', (name) => {
		expect(uploadRefusal(aFile(name))).toBe('bad_name')
	})

	it.each(['console.iso', 'com10.iso', 'lpt0.iso', `${'é'.repeat(123)}.iso`, 'a b (1).iso'])('takes %j, which the service takes', (name) => {
		expect(uploadRefusal(aFile(name))).toBe('')
	})

	it('refuses a file too large for the free space, keeping 1 GiB free', () => {
		expect(UPLOAD_RESERVE_BYTES).toBe(GIB)
		expect(uploadRefusal(aFile('a.iso', 4 * GIB), { freeBytes: 5 * GIB })).toBe('')
		expect(uploadRefusal(aFile('a.iso', 4 * GIB + 1), { freeBytes: 5 * GIB })).toBe('insufficient_storage')
		// a host that does not say: the service decides
		expect(uploadRefusal(aFile('a.iso', 4 * GIB), {})).toBe('')
	})

	it.each(['notes.txt', 'a.iso.txt', 'disk.tar', 'a.xz', 'win.exe', '.iso'])('refuses the extension of %j', (name) => {
		expect(uploadRefusal(aFile(name))).toBe('bad_name')
	})

	it.each(['a.iso', 'B.QCOW2', 'c.img', 'd.raw', 'e.vmdk', 'f.vdi', 'g.qcow2.xz', 'h.img.gz', 'i.zip'])('takes %j', (name) => {
		expect(uploadRefusal(aFile(name))).toBe('')
	})

	it('refuses a checksum that is not 64 hex digits', () => {
		expect(uploadRefusal(aFile('a.iso'), { sha256: 'abc' })).toBe('bad_sha256')
		expect(uploadRefusal(aFile('a.iso'), { sha256: `${'a'.repeat(63)}g` })).toBe('bad_sha256')
		expect(uploadRefusal(aFile('a.iso'), { sha256: 'aB'.repeat(32) })).toBe('')
	})
})

describe('the progress of an upload', () => {
	it('gives the percent, the speed and the time left', () => {
		expect(uploadProgress({ loaded: 50 * 1048576, total: 200 * 1048576 }, 0, 10_000)).toEqual({
			percent: 25,
			loaded: 50 * 1048576,
			total: 200 * 1048576,
			speed: 5 * 1048576,
			remaining: 30,
		})
	})

	it('has no speed before there is anything to measure', () => {
		expect(uploadProgress({ loaded: 0, total: 100 }, 0, 0)).toEqual({ percent: 0, loaded: 0, total: 100, speed: null, remaining: null })
	})

	it('does not go past 100', () => {
		expect(uploadProgress({ loaded: 120, total: 100 }, 0, 1000).percent).toBe(100)
	})
})

describe('what an error of the upload says', () => {
	const CODES = ['bad_name', 'bad_sha256', 'incomplete', 'too_long', 'stalled', 'exists', 'length_required', 'too_large', 'checksum_mismatch', 'bad_image', 'busy', 'insufficient_storage', 'conflict']

	it('says what too_long and conflict mean, and does not promise a fixed reserve', () => {
		expect(UPLOAD_ERRORS.too_long).toBe('More data arrived than announced. Try again.')
		expect(fr[UPLOAD_ERRORS.too_long]).toBe('Plus de données sont arrivées qu\'annoncé. Réessayez.')
		expect(UPLOAD_ERRORS.conflict).toBe('Another transfer touched this file. Try again.')
		expect(fr[UPLOAD_ERRORS.conflict]).toBe('Un autre transfert a touché ce fichier. Réessayez.')
		expect(uploadErrorCode(refused(500, 'conflict'))).toBe('conflict')
		expect(UPLOAD_ERRORS.insufficient_storage).not.toMatch(/1 GB/)
		expect(UPLOAD_ERRORS.insufficient_storage).toMatch(/Some free space is always kept for the system/)
	})

	it.each(CODES)('has a sentence of its own for %s, in English and in French', (code) => {
		expect(uploadErrorCode(refused(400, code))).toBe(code)
		const sentence = UPLOAD_ERRORS[code]
		expect(en[sentence]).toBe(sentence)
		expect(fr[sentence]).toBeTruthy()
		expect(fr[sentence]).not.toBe(sentence)
	})

	it('never shows what the service wrote when it is not a code', () => {
		expect(uploadErrorCode(refused(500, '<b>panic</b> in handler'))).toBe('failed')
		expect(uploadErrorCode(refused(400, 'constructor'))).toBe('failed')
	})

	it('says the upload was refused or interrupted when no answer came', () => {
		expect(uploadErrorCode(networkError())).toBe('network')
		expect(UPLOAD_ERRORS.network).toBe('The upload was refused or interrupted.')
	})
})

describe('the upload of an image', () => {
	let wrapper

	beforeEach(() => {
		vi.clearAllMocks()
		vmApi.images.mockResolvedValue({ data: { data: [anImage('debian.iso')] } })
		vmApi.host.mockResolvedValue({ data: { data: { storage_path: '/DATA/VM', storage_free_bytes: 100 * GIB } } })
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.useRealTimers()
	})

	const open = () => {
		wrapper = mount(ImageUpload, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	}
	const choose = async (file) => {
		const input = wrapper.find('input[type="file"]')
		Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
		await input.trigger('change')
	}
	const button = text => wrapper.findAll('button').find(b => b.text() === text)
	const send = async (file, sha) => {
		await choose(file)
		if (sha !== undefined) {
			await wrapper.find('.vm-upload-sha input').setValue(sha)
		}
		await button('Upload').trigger('click')
		await flushPromises()
	}
	const live = () => wrapper.find('[aria-live="polite"]').text()
	const shown = () => wrapper.find('.vm-upload-error').text()

	it('is a button, with a hidden file input, for the keyboard', async () => {
		open()
		const pick = button('Upload an image')
		expect(pick.element.tagName).toBe('BUTTON')
		const click = vi.spyOn(wrapper.find('input[type="file"]').element, 'click')
		await pick.trigger('click')
		expect(click).toHaveBeenCalled()
	})

	it('shows the name and the size of the file chosen, and sends it with the checksum when given', async () => {
		vmApi.uploadImage.mockResolvedValue(anImage('alpine.iso'))
		open()
		await choose(aFile('alpine.iso', 3 * 1048576))
		expect(wrapper.find('.vm-upload-file').text()).toContain('alpine.iso')
		expect(wrapper.find('.vm-upload-file').text()).toContain('3.0 MB')

		await wrapper.find('.vm-upload-sha input').setValue(` ${'AB'.repeat(32)} `)
		await button('Upload').trigger('click')
		await flushPromises()

		expect(vmApi.uploadImage).toHaveBeenCalledTimes(1)
		const [file, options] = vmApi.uploadImage.mock.calls[0]
		expect(file.name).toBe('alpine.iso')
		expect(options.sha256).toBe('ab'.repeat(32))
		expect(options.signal).toBeInstanceOf(AbortSignal)
	})

	it('takes one file dropped on it, and not two', async () => {
		open()
		const zone = wrapper.find('.vm-upload-zone')
		await zone.trigger('drop', { dataTransfer: { files: [aFile('a.iso'), aFile('b.iso')] } })
		expect(wrapper.find('.vm-upload-file').exists()).toBe(false)
		expect(shown()).toBe('Drop one file at a time.')

		await zone.trigger('drop', { dataTransfer: { files: [aFile('b.iso')] } })
		expect(wrapper.find('.vm-upload-file').text()).toContain('b.iso')
	})

	describe('does not send', () => {
		it('a name the folder already has', async () => {
			open()
			await send(aFile('debian.iso'))
			expect(vmApi.uploadImage).not.toHaveBeenCalled()
			expect(shown()).toBe(UPLOAD_ERRORS.exists)
		})

		it('a file larger than the free space', async () => {
			vmApi.host.mockResolvedValue({ data: { data: { storage_free_bytes: 2 * GIB } } })
			open()
			await send(aFile('big.iso', 1.5 * GIB))
			expect(vmApi.uploadImage).not.toHaveBeenCalled()
			expect(shown()).toBe(UPLOAD_ERRORS.insufficient_storage)
		})

		it('a file of another kind', async () => {
			open()
			await choose(aFile('notes.txt'))
			expect(button('Upload')).toBeUndefined()
			expect(shown()).toBe(UPLOAD_ERRORS.bad_name)
			expect(vmApi.uploadImage).not.toHaveBeenCalled()
		})

		it('a checksum that is not one', async () => {
			open()
			await send(aFile('a.iso'), 'not-a-sum')
			expect(vmApi.uploadImage).not.toHaveBeenCalled()
			expect(shown()).toBe(UPLOAD_ERRORS.bad_sha256)
		})
	})

	it('cancels during the checks: nothing is sent', async () => {
		const checks = deferred()
		vmApi.images.mockReturnValue(checks.promise)
		open()
		await choose(aFile('a.iso'))
		await button('Upload').trigger('click')
		expect(wrapper.find('.vm-upload-progress').text()).toBe('Checking…')

		await button('Cancel').trigger('click')
		checks.resolve({ data: { data: [] } })
		await flushPromises()

		expect(vmApi.uploadImage).not.toHaveBeenCalled()
		expect(wrapper.emitted('busy')).toEqual([[true], [false]])
		expect(live()).toBe('Upload canceled.')
	})

	it('cancelled once the file was in: does not select it, and asks for the list again', async () => {
		const pending = deferred()
		vmApi.uploadImage.mockReturnValue(pending.promise)
		open()
		await send(aFile('a.iso'))
		await button('Cancel').trigger('click')
		// the answer was already on its way
		pending.resolve(anImage('a.iso'))
		await flushPromises()

		expect(wrapper.emitted('uploaded')).toBeUndefined()
		expect(wrapper.emitted('refresh')).toHaveLength(1)
		expect(live()).not.toBe('a.iso is uploaded and selected.')
	})

	it('maps the progress to the bar, a few times a second, not at every event', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(0)
		const pending = deferred()
		vmApi.uploadImage.mockReturnValue(pending.promise)
		open()
		await send(aFile('a.iso', 100 * 1048576))
		const { onProgress } = vmApi.uploadImage.mock.calls[0][1]
		const bar = () => wrapper.find('[role="progressbar"]')

		expect(bar().attributes()).toMatchObject({ 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' })
		vi.setSystemTime(10_000)
		onProgress({ loaded: 50 * 1048576, total: 100 * 1048576 })
		await flushPromises()
		expect(bar().attributes('aria-valuenow')).toBe('50')
		expect(wrapper.find('.vm-upload-progress').text()).toBe('50% · 50 MB / 100 MB · 5.0 MB/s · 10 s left')

		// 100 ms later: not drawn again
		vi.setSystemTime(10_100)
		onProgress({ loaded: 60 * 1048576, total: 100 * 1048576 })
		await flushPromises()
		expect(bar().attributes('aria-valuenow')).toBe('50')
		// the live region says it started, not every percent
		expect(live()).toBe('Uploading a.iso…')
		pending.resolve(anImage('a.iso'))
	})

	it('cancels: aborts the request, and nothing of a success happens', async () => {
		const pending = deferred()
		vmApi.uploadImage.mockReturnValue(pending.promise)
		open()
		await send(aFile('a.iso'))
		const { signal } = vmApi.uploadImage.mock.calls[0][1]
		expect(wrapper.emitted('busy')).toEqual([[true]])

		await button('Cancel').trigger('click')
		expect(signal.aborted).toBe(true)
		pending.reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }))
		await flushPromises()

		expect(wrapper.emitted('uploaded')).toBeUndefined()
		expect(wrapper.emitted('busy')).toEqual([[true], [false]])
		expect(wrapper.find('.vm-upload-error').exists()).toBe(false)
		expect(live()).toBe('Upload canceled.')
	})

	it.each(Object.keys(UPLOAD_ERRORS).filter(code => !['network', 'failed', 'many'].includes(code)))('says the sentence of %s, never the text of the service', async (code) => {
		vmApi.uploadImage.mockRejectedValue(refused(400, code))
		open()
		await send(aFile('a.iso'))
		expect(shown()).toBe(UPLOAD_ERRORS[code])
		expect(live()).toBe(UPLOAD_ERRORS[code])
		expect(wrapper.emitted('uploaded')).toBeUndefined()
	})

	it('says the upload was refused or interrupted when no answer came, and asks for the list again', async () => {
		vmApi.uploadImage.mockRejectedValue(networkError())
		open()
		await send(aFile('a.iso', 50 * 1048576))
		expect(shown()).toBe('The upload was refused or interrupted.')
		expect(wrapper.emitted('refresh')).toHaveLength(1)
	})

	it('hands over the image it made, and says when it does not look bootable', async () => {
		const image = anImage('a.iso', { warning: 'iso_signature_missing' })
		vmApi.uploadImage.mockResolvedValue(image)
		open()
		await send(aFile('a.iso'))
		expect(wrapper.emitted('uploaded')).toEqual([[image]])
		expect(wrapper.find('.vm-upload-warning').text()).toBe('This file does not look like a bootable ISO, check it.')
		expect(live()).toBe('a.iso is uploaded and selected.')
	})

	it('shows a hostile file name as text', async () => {
		const name = '<img src=x onerror=1>.iso'
		const pending = deferred()
		vmApi.uploadImage.mockReturnValue(pending.promise)
		open()
		await send(aFile(name))
		expect(wrapper.find('.vm-upload-file').text()).toContain(name)
		expect(live()).toBe(`Uploading ${name}…`)
		expect(document.querySelector('.vm-upload img')).toBeNull()
		pending.resolve(anImage(name))
		await flushPromises()
		expect(live()).toBe(`${name} is uploaded and selected.`)
		expect(document.querySelector('.vm-upload img')).toBeNull()
	})

	it('warns before the page is left while it uploads, and not after', async () => {
		const pending = deferred()
		vmApi.uploadImage.mockReturnValue(pending.promise)
		open()
		await send(aFile('a.iso'))
		const leaving = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(leaving)
		expect(leaving.defaultPrevented).toBe(true)

		pending.resolve(anImage('a.iso'))
		await flushPromises()
		const later = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(later)
		expect(later.defaultPrevented).toBe(false)
	})

	it('aborts the upload when it is taken off the page', async () => {
		const pending = deferred()
		vmApi.uploadImage.mockReturnValue(pending.promise)
		open()
		await send(aFile('a.iso'))
		const { signal } = vmApi.uploadImage.mock.calls[0][1]

		wrapper.unmount()
		wrapper = null
		expect(signal.aborted).toBe(true)
		const leaving = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(leaving)
		expect(leaving.defaultPrevented).toBe(false)
	})

	it('does not start the upload when it is taken off the page during the checks', async () => {
		const checks = deferred()
		vmApi.images.mockReturnValue(checks.promise)
		open()
		await choose(aFile('a.iso'))
		await button('Upload').trigger('click')
		wrapper.unmount()
		wrapper = null
		checks.resolve({ data: { data: [] } })
		await flushPromises()
		expect(vmApi.uploadImage).not.toHaveBeenCalled()
	})
})
