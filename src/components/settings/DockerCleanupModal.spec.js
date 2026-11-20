// @vitest-environment happy-dom
import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DockerCleanupModal from './DockerCleanupModal.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

const GIB = 1073741824

// GET /cleanup as the box answers it.
function report(fields = {}) {
	return {
		build_cache: GIB,
		held: '',
		images: [
			{ id: 'sha256:1', tags: ['immich-server:v1'], size: GIB, created: 1760000000 },
			{ id: 'sha256:2', tags: ['alpine:3.20'], size: 1024, created: 1750000000 },
		],
		volumes: [
			{ name: 'immich_pgdata', app: 'immich', size: 5 * GIB, created: '2026-08-02T10:00:00Z' },
			{ name: 'scratch', size: -1 },
		],
		...fields,
	}
}
const answer = data => vi.fn(() => Promise.resolve({ data: { data } }))
const freed = (fields = {}) => answer({ removed: [], refused: {}, size: GIB, ...fields })

// cleanup: the slice of $api.cleanup the test drives. The dialog confirms at once unless told not to.
async function open(cleanup = {}, { confirms = true, old = { count: 4, size: 2 * GIB } } = {}) {
	const confirm = vi.fn(options => confirms && options.onConfirm())
	const api = { get: answer(report()), pruneBuildCache: freed(), removeImages: freed(), removeVolumes: freed(), removeOrphans: freed({ size: 0, removed: ['gone'] }), getSchedule: vi.fn(() => Promise.reject(new Error('404'))), setSchedule: answer({ weekly: true, next: '2026-11-22T04:00:00Z', runs: [] }), ...cleanup }
	const image = {
		danglingImages: old ? answer(old) : vi.fn(() => Promise.reject(new Error('404'))),
		pruneDanglingImages: answer({ count: 4, size: 2 * GIB }),
	}
	const wrapper = mount(DockerCleanupModal, {
		global: {
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$api: { cleanup: api },
				$openAPI: { appManagement: { image } },
				$buefy: { dialog: { confirm } },
			},
			stubs: {
				'b-button': { props: ['disabled'], emits: ['click'], render() { return h('button', { disabled: this.disabled, onClick: () => this.$emit('click') }, this.$slots.default?.()) } },
				'b-message': { render() { return h('div', this.$slots.default()) } },
				'b-switch': {
					props: ['modelValue', 'disabled'],
					emits: ['update:modelValue'],
					render() { return h('button', { 'data-on': String(this.modelValue), 'disabled': this.disabled, 'onClick': () => this.$emit('update:modelValue', !this.modelValue) }) },
				},
				'b-checkbox': {
					props: ['modelValue', 'nativeValue'],
					emits: ['update:modelValue'],
					render() {
						const ticked = this.modelValue.includes(this.nativeValue)
						return h('label', { 'data-ticked': String(ticked), 'onClick': () => this.$emit('update:modelValue', ticked ? this.modelValue.filter(v => v !== this.nativeValue) : [...this.modelValue, this.nativeValue]) }, this.$slots.default?.())
					},
				},
			},
		},
	})
	await flushPromises()
	return { wrapper, api, image, confirm }
}

async function click(wrapper, action) {
	await wrapper.find(`[data-action="${action}"]`).trigger('click')
	await flushPromises()
}

describe('the Docker cleanup window', () => {
	it('says what each row would free', async () => {
		const { wrapper } = await open()

		expect(wrapper.find('[data-row="old"]').text()).toContain('Images replaced by an update: 4 · 2 GB')
		expect(wrapper.find('[data-row="cache"]').text()).toContain('1 GB kept to build faster')
		expect(wrapper.find('[data-row="images"]').text()).toContain('Images no container uses: 2')
		// a volume whose driver cannot measure it adds nothing to the total
		expect(wrapper.find('[data-row="volumes"]').text()).toContain('Volumes no container uses: 2 · 5 GB')
		wrapper.unmount()
	})

	it('opens the images with all of them ticked, and deletes the ticked ones only', async () => {
		const { wrapper, api } = await open()
		await click(wrapper, 'review-images')

		const boxes = wrapper.findAll('[data-row="images"] label')
		expect(boxes.map(box => box.attributes('data-ticked'))).toEqual(['true', 'true'])
		await boxes[1].trigger('click')
		await click(wrapper, 'delete-images')

		expect(api.removeImages).toHaveBeenCalledWith(['sha256:1'])
		expect(wrapper.find('[data-done]').text()).toContain('Freed 1 GB')
		// the lists are read again after a deletion
		expect(api.get).toHaveBeenCalledTimes(2)
		wrapper.unmount()
	})

	it('opens the volumes with none ticked: a volume is data, and each one is a choice', async () => {
		const { wrapper, api } = await open()
		await click(wrapper, 'review-volumes')

		const row = wrapper.find('[data-row="volumes"]')
		expect(row.findAll('label').map(box => box.attributes('data-ticked'))).toEqual(['false', 'false'])
		expect(row.text()).toContain('made by immich')
		expect(row.text()).toContain('size unknown')
		expect(wrapper.find('[data-action="delete-volumes"]').attributes('disabled')).toBeDefined()

		await row.findAll('label')[0].trigger('click')
		await click(wrapper, 'delete-volumes')
		expect(api.removeVolumes).toHaveBeenCalledWith(['immich_pgdata'])
		wrapper.unmount()
	})

	it('names the volumes in the question, and deletes nothing when the answer is no', async () => {
		const { wrapper, api, confirm } = await open({}, { confirms: false })
		await click(wrapper, 'review-volumes')
		await wrapper.findAll('[data-row="volumes"] label')[0].trigger('click')
		await click(wrapper, 'delete-volumes')

		expect(confirm.mock.calls[0][0].message).toContain('cannot be recovered')
		expect(confirm.mock.calls[0][0].message).toContain('immich_pgdata')
		expect(api.removeVolumes).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it('says what the box kept, with its reason', async () => {
		const removeVolumes = freed({ size: 0, refused: { immich_pgdata: 'volume is in use' } })
		const { wrapper } = await open({ removeVolumes })
		await click(wrapper, 'review-volumes')
		await wrapper.findAll('[data-row="volumes"] label')[0].trigger('click')
		await click(wrapper, 'delete-volumes')

		expect(wrapper.find('[data-kept]').text()).toContain('immich_pgdata: volume is in use')
		// nothing was freed, so nothing says so
		expect(wrapper.find('[data-done]').exists()).toBe(false)
		wrapper.unmount()
	})

	it('offers nothing while an app is busy', async () => {
		const { wrapper } = await open({ get: answer(report({ held: 'busy', images: [], volumes: [] })) })

		expect(wrapper.find('[data-held]').text()).toContain('Something runs on an app')
		expect(wrapper.find('[data-row="images"]').exists()).toBe(false)
		expect(wrapper.find('[data-row="volumes"]').exists()).toBe(false)
		// the two other rows are shown and held too: a build uses the cache, and an
		// install has just pulled an image nothing holds yet
		expect(wrapper.find('[data-action="free-old"]').attributes('disabled')).toBeDefined()
		expect(wrapper.find('[data-action="free-cache"]').attributes('disabled')).toBeDefined()
		wrapper.unmount()
	})

	it('says so when an app cannot be read', async () => {
		const { wrapper } = await open({ get: answer(report({ held: 'unreadable', detail: 'compose file of `odd`: yaml', images: [], volumes: [] })) })

		expect(wrapper.find('[data-held]').text()).toContain('cannot be read')
		// which one, or nobody can mend it
		expect(wrapper.find('[data-held]').text()).toContain('compose file of `odd`')
		// the build cache holds the data of no app: it can still be freed
		expect(wrapper.find('[data-action="free-cache"]').attributes('disabled')).toBeUndefined()
		expect(wrapper.find('[data-action="free-old"]').attributes('disabled')).toBeDefined()
		wrapper.unmount()
	})

	it('frees the old versions and the build cache, each after a question', async () => {
		const { wrapper, api, image, confirm } = await open()

		await click(wrapper, 'free-old')
		await click(wrapper, 'free-cache')

		expect(confirm).toHaveBeenCalledTimes(2)
		expect(image.pruneDanglingImages).toHaveBeenCalledTimes(1)
		expect(api.pruneBuildCache).toHaveBeenCalledTimes(1)
		wrapper.unmount()
	})

	it('leaves the old versions row out when the box does not answer for it', async () => {
		const { wrapper } = await open({}, { old: null })

		expect(wrapper.find('[data-row="old"]').exists()).toBe(false)
		expect(wrapper.find('[data-row="cache"]').exists()).toBe(true)
		wrapper.unmount()
	})

	it('says why the report could not be read', async () => {
		const get = vi.fn(() => Promise.reject(Object.assign(new Error('403'), { response: { data: { message: 'only the owner can do this' } } })))
		const { wrapper } = await open({ get })

		expect(wrapper.text()).toContain('only the owner can do this')
		expect(wrapper.find('[data-row="cache"]').exists()).toBe(false)
		wrapper.unmount()
	})

	it('keeps the words of a deletion the box refused, through the reload that follows', async () => {
		const removeImages = vi.fn(() => Promise.reject(Object.assign(new Error('409'), { response: { data: { message: 'busy' } } })))
		const { wrapper, api } = await open({ removeImages })
		await click(wrapper, 'review-images')
		await click(wrapper, 'delete-images')

		expect(api.get).toHaveBeenCalledTimes(2)
		expect(wrapper.text()).toContain('busy')
		wrapper.unmount()
	})

	it('keeps what was unticked when the images are closed and opened again', async () => {
		const { wrapper } = await open()
		await click(wrapper, 'review-images')
		await wrapper.findAll('[data-row="images"] label')[1].trigger('click')
		await click(wrapper, 'review-images')
		await click(wrapper, 'review-images')

		expect(wrapper.findAll('[data-row="images"] label').map(box => box.attributes('data-ticked'))).toEqual(['true', 'false'])
		wrapper.unmount()
	})

	it('shows no folder row on a box that lists none', async () => {
		const { wrapper } = await open()

		expect(wrapper.find('[data-row="orphans"]').exists()).toBe(false)
		wrapper.unmount()
	})

	it('lists the folders of apps that are gone even when an app cannot be read, and moves the ticked ones aside', async () => {
		const get = answer(report({ held: 'unreadable', detail: 'compose file of `gone`: yaml', images: [], volumes: [], orphans: ['gone', 'other'] }))
		const { wrapper, api, confirm } = await open({ get })
		await click(wrapper, 'review-orphans')

		const boxes = wrapper.findAll('[data-row="orphans"] label')
		// nothing ticked: each folder is a choice
		expect(boxes.map(box => box.attributes('data-ticked'))).toEqual(['false', 'false'])
		await boxes[0].trigger('click')
		await click(wrapper, 'move-orphans')

		// the question says it is moved, not deleted, and names it
		expect(confirm.mock.calls[0][0].message).toContain('not deleted')
		expect(confirm.mock.calls[0][0].message).toContain('gone')
		expect(api.removeOrphans).toHaveBeenCalledWith(['gone'])
		// a move frees nothing: it says what moved
		expect(wrapper.find('[data-done]').text()).toContain('Moved aside: gone')
		wrapper.unmount()
	})

	it('leaves the weekly card out on a box that does not answer for it', async () => {
		const { wrapper } = await open()

		expect(wrapper.find('[data-row="weekly"]').exists()).toBe(false)
		wrapper.unmount()
	})

	it('shows the weekly switch off, with what the last cleanups freed', async () => {
		const getSchedule = answer({
			weekly: false,
			runs: [
				{ at: '2026-11-15T04:00:10Z', what: 'weekly', scheduled: true, count: 4, size: 2 * GIB },
				{ at: '2026-11-12T10:00:00Z', what: 'volumes', scheduled: false, count: 1, size: GIB },
				{ at: '2026-11-08T04:00:10Z', what: 'weekly', scheduled: true, count: 0, size: 0, error: 'compose file of `odd`: yaml' },
			],
		})
		const { wrapper } = await open({ getSchedule })

		const card = wrapper.find('[data-row="weekly"]')
		expect(card.find('[data-action="weekly"]').attributes('data-on')).toBe('false')
		// no date for a run nothing has scheduled
		expect(card.find('[data-next]').exists()).toBe(false)
		const runs = card.findAll('[data-run]').map(run => run.text())
		expect(runs[0]).toContain('Weekly cleanup (automatic)')
		expect(runs[0]).toContain('Freed 2 GB')
		expect(runs[1]).toContain('Volumes')
		expect(runs[1]).not.toContain('automatic')
		expect(runs[2]).toContain('failed: compose file of `odd`')
		wrapper.unmount()
	})

	it('turns the weekly cleanup on, and says when the first run is', async () => {
		const getSchedule = answer({ weekly: false, runs: [] })
		const { wrapper, api } = await open({ getSchedule })

		await click(wrapper, 'weekly')

		expect(api.setSchedule).toHaveBeenCalledWith(true)
		expect(wrapper.find('[data-action="weekly"]').attributes('data-on')).toBe('true')
		expect(wrapper.find('[data-next]').exists()).toBe(true)
		expect(wrapper.find('[data-row="weekly"]').text()).toContain('Nothing has been freed yet.')
		wrapper.unmount()
	})

	it('puts the switch back when the box refuses', async () => {
		const getSchedule = answer({ weekly: false, runs: [] })
		const setSchedule = vi.fn(() => Promise.reject(Object.assign(new Error('500'), { response: { data: { message: 'cannot write' } } })))
		const { wrapper } = await open({ getSchedule, setSchedule })

		await click(wrapper, 'weekly')

		expect(wrapper.find('[data-action="weekly"]').attributes('data-on')).toBe('false')
		expect(wrapper.text()).toContain('cannot write')
		wrapper.unmount()
	})

	it('has every one of its sentences in English and in French', () => {
		for (const key of ['Docker cleanup', 'Images of no installed app', 'Volumes of no installed app', 'Delete the ticked volumes ({count})', 'made by {app}', 'size unknown', 'Review']) {
			expect(en[key], key).toBe(key)
			expect(fr[key], key).toBeTruthy()
			expect(fr[key], key).not.toBe(key)
		}
	})
})
