// @vitest-environment happy-dom
import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppAutoUpdateModal from './AppAutoUpdateModal.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import pt from '@/assets/lang/pt_BR.json'

const GRID = [
	{ name: 'jellyfin', title: { en_us: 'Jellyfin' }, app_type: 'v2app', icon: '' },
	{ name: 'immich', title: { en_us: 'Immich' }, app_type: 'v2app', icon: '' },
	// built from a repository: it deploys by itself already
	{ name: 'myapp', title: { en_us: 'My app' }, app_type: 'v2app', git: { state: 'deployed' } },
	// not a compose app
	{ name: 'files', title: { en_us: 'Files' }, app_type: 'system' },
]

const answer = data => vi.fn(() => Promise.resolve({ data: { data } }))

async function open({ view = { apps: [], min_days: 3, runs: [] }, setAutoUpdate, setAutoUpdateWait, setAutoUpdateScan } = {}) {
	const updates = {
		autoUpdate: answer(view),
		setAutoUpdateScan,
		setAutoUpdateWait: setAutoUpdateWait || vi.fn(days => Promise.resolve({ data: { data: { ...view, min_days: days } } })),
		setAutoUpdate: setAutoUpdate || vi.fn((name, on) => Promise.resolve({ data: { data: { apps: on ? [name] : [], next: on ? '2026-11-21T03:00:00Z' : undefined, runs: [] } } })),
	}
	const wrapper = mount(AppAutoUpdateModal, {
		global: {
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$api: { updates },
				$openAPI: { appGrid: { getAppGrid: answer(GRID) } },
			},
			stubs: {
				'b-button': true,
				'b-message': { render() { return h('div', this.$slots.default()) } },
				'b-select': {
					props: ['modelValue', 'disabled'],
					emits: ['update:modelValue'],
					render() { return h('select', { 'value': this.modelValue, 'data-value': String(this.modelValue), 'onChange': event => this.$emit('update:modelValue', Number(event.target.value)) }, this.$slots.default?.()) },
				},
				// as Buefy's: it keeps what was clicked, and follows the prop only when it changes
				'b-switch': {
					props: ['modelValue', 'disabled'],
					emits: ['update:modelValue'],
					data() { return { on: this.modelValue } },
					watch: { modelValue(value) { this.on = value } },
					render() {
						return h('button', { 'data-on': String(this.on), 'disabled': this.disabled, 'onClick': () => {
							this.on = !this.on
							this.$emit('update:modelValue', this.on)
						} })
					},
				},
			},
		},
	})
	await flushPromises()
	return { wrapper, updates }
}

describe('the automatic app updates window', () => {
	it('lists the compose apps, sorted, without the ones built from a repository, all off', async () => {
		const { wrapper } = await open()

		const apps = wrapper.findAll('[data-app]')
		expect(apps.map(app => app.attributes('data-app'))).toEqual(['immich', 'jellyfin'])
		expect(apps.map(app => app.find('button').attributes('data-on'))).toEqual(['false', 'false'])
		// nothing turned on, so no night is due
		expect(wrapper.find('[data-next]').exists()).toBe(false)
		expect(wrapper.find('[data-row="runs"]').text()).toContain('No night has run yet.')
		wrapper.unmount()
	})

	it('shows the default icon for an app without one, or whose icon does not load', async () => {
		const { wrapper } = await open()

		const icon = wrapper.find('[data-app="jellyfin"] [data-icon]')
		expect(icon.attributes('src')).toBe(wrapper.vm.defaultIcon)
		icon.element.src = 'https://example.invalid/broken.png'
		await icon.trigger('error')
		expect(icon.element.getAttribute('src')).toBe(wrapper.vm.defaultIcon)
		wrapper.unmount()
	})

	it('turns an app on, and says the night the box answers', async () => {
		const { wrapper, updates } = await open()

		await wrapper.find('[data-app="jellyfin"] button').trigger('click')
		await flushPromises()

		expect(updates.setAutoUpdate).toHaveBeenCalledWith('jellyfin', true)
		expect(wrapper.find('[data-app="jellyfin"] button').attributes('data-on')).toBe('true')
		expect(wrapper.find('[data-next]').exists()).toBe(true)
		wrapper.unmount()
	})

	it('puts the switch back as the box holds it when the box refuses', async () => {
		const setAutoUpdate = vi.fn(() => Promise.reject(Object.assign(new Error('404'), { response: { data: { message: '`jellyfin` is not an app the night can update' } } })))
		const { wrapper } = await open({ setAutoUpdate })

		await wrapper.find('[data-app="jellyfin"] button').trigger('click')
		await flushPromises()

		expect(wrapper.find('[data-app="jellyfin"] button').attributes('data-on')).toBe('false')
		expect(wrapper.text()).toContain('is not an app the night can update')
		wrapper.unmount()
	})

	it('says what became of each app the last nights', async () => {
		const view = {
			apps: ['immich', 'jellyfin'],
			min_days: 3,
			next: '2026-11-21T03:00:00Z',
			runs: [
				{ at: '2026-11-20T03:00:05Z', apps: [
					{ id: 'immich', state: 'failed', message: 'the app did not start' },
					{ id: 'jellyfin', state: 'updated' },
					{ id: 'plex', state: 'queued', message: 'waiting: a new version was found on 2026-11-19; applied from 2026-11-22' },
				] },
				{ at: '2026-11-19T03:00:05Z', apps: [] },
			],
		}
		const { wrapper } = await open({ view })

		const runs = wrapper.findAll('[data-run]').map(run => run.text())
		expect(runs[0]).toContain('Immich · Failed — the app did not start')
		expect(runs[0]).toContain('Jellyfin · Updated')
		expect(runs[0]).toContain('plex · Waiting — waiting: a new version was found on 2026-11-19; applied from 2026-11-22')
		expect(runs[1]).toContain('Nothing to do.')
		expect(wrapper.find('[data-next]').exists()).toBe(true)
		wrapper.unmount()
	})

	it('holds every switch while one is saved', async () => {
		let answer
		const setAutoUpdate = vi.fn(() => new Promise((resolve) => {
			answer = resolve
		}))
		const { wrapper } = await open({ setAutoUpdate })

		await wrapper.find('[data-app="jellyfin"] button').trigger('click')
		expect(wrapper.find('[data-app="immich"] button').attributes('disabled')).toBeDefined()

		answer({ data: { data: { apps: ['jellyfin'], runs: [] } } })
		await flushPromises()
		expect(wrapper.find('[data-app="immich"] button').attributes('disabled')).toBeUndefined()
		wrapper.unmount()
	})

	it('shows the wait the box holds, and sets another', async () => {
		const { wrapper, updates } = await open()

		const select = wrapper.find('[data-action="wait"]')
		expect(select.attributes('data-value')).toBe('3')
		expect(select.findAll('option').map(option => option.text())).toEqual(['No wait', '1 day', '3 days', '7 days'])
		await select.setValue('7')
		await flushPromises()

		expect(updates.setAutoUpdateWait).toHaveBeenCalledWith(7)
		expect(wrapper.find('[data-action="wait"]').attributes('data-value')).toBe('7')
		wrapper.unmount()
	})

	it('has no check switch when the scan module is not there', async () => {
		const { wrapper } = await open()

		expect(wrapper.find('[data-row="scan"]').exists()).toBe(false)
		wrapper.unmount()
	})

	it('shows the check as the box holds it, and turns it off', async () => {
		const view = { apps: [], min_days: 3, runs: [], scan_available: true, scan_before_update: true }
		const setAutoUpdateScan = vi.fn(on => Promise.resolve({ data: { data: { ...view, scan_before_update: on } } }))
		const { wrapper, updates } = await open({ view, setAutoUpdateScan })

		expect(wrapper.find('[data-row="scan"] button').attributes('data-on')).toBe('true')
		await wrapper.find('[data-row="scan"] button').trigger('click')
		await flushPromises()

		expect(updates.setAutoUpdateScan).toHaveBeenCalledWith(false)
		expect(wrapper.find('[data-row="scan"] button').attributes('data-on')).toBe('false')
		wrapper.unmount()
	})

	it('puts the check switch back when the box refuses', async () => {
		const view = { apps: [], min_days: 3, runs: [], scan_available: true, scan_before_update: true }
		const setAutoUpdateScan = vi.fn(() => Promise.reject(Object.assign(new Error('500'), { response: { data: { message: 'cannot save' } } })))
		const { wrapper } = await open({ view, setAutoUpdateScan })

		await wrapper.find('[data-row="scan"] button').trigger('click')
		await flushPromises()

		expect(wrapper.find('[data-row="scan"] button').attributes('data-on')).toBe('true')
		expect(wrapper.text()).toContain('cannot save')
		wrapper.unmount()
	})

	it('says a night blocked an update, in warning colour, with the reason', async () => {
		const view = { apps: ['jellyfin'], min_days: 3, runs: [
			{ at: '2026-11-21T02:00:07Z', apps: [{ id: 'jellyfin', state: 'blocked', message: 'the new version has 2 more critical vulnerabilities than the one installed' }] },
		] }
		const { wrapper } = await open({ view })

		const entry = wrapper.find('[data-run] .has-text-warning')
		expect(entry.text()).toContain('Jellyfin · Blocked — the new version has 2 more critical vulnerabilities')
		wrapper.unmount()
	})

	it('has its sentences in English and in French', () => {
		for (const key of ['Automatic app updates', 'Last nights', 'Next night: {date}', 'No night has run yet.']) {
			expect(en[key], key).toBe(key)
			expect(fr[key], key).toBeTruthy()
			expect(fr[key], key).not.toBe(key)
		}
	})

	it('has the check sentences in English, French and Portuguese', () => {
		for (const key of ['Check the new version before an update', 'An update whose new version has more critical vulnerabilities than the installed one is blocked.', 'Blocked']) {
			expect(en[key], key).toBe(key)
			for (const lang of [fr, pt]) {
				expect(lang[key], key).toBeTruthy()
				expect(lang[key], key).not.toBe(key)
			}
		}
	})
})
