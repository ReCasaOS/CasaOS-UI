// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import AppCard from '@/components/Apps/AppCard.vue'
import BackupAppModal from '@/components/Apps/BackupAppModal.vue'

// Seven defects on this distribution began with one app: a compose file written
// by hand, with no `x-casaos` block, so no title, no icon, no tips, no author,
// no category. Each screen had assumed the block, and each one was found by a
// person. This is the app, as the API returns it, taken through the screens
// that touch it, so the eighth is found here. The first run of this file found
// one: the card showed no name at all.

vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const handwritten = {
	name: 'handwritten',
	app_type: 'v2app',
	status: 'running',
	// what a compose file without x-casaos gives: nothing of the below
	title: undefined,
	icon: undefined,
	tips: undefined,
	store_info: undefined,
}

const globals = {
	plugins: [Buefy, i18n],
	provide: { homeShowFiles: () => {}, openAppStore: () => {} },
	mocks: { $baseIp: 'localhost' },
}

describe('an app with no x-casaos', () => {
	it('is a card on the grid, under its own name', async () => {
		const wrapper = mount(AppCard, { props: { item: handwritten }, global: globals, attachTo: document.body })
		await nextTick()
		expect(wrapper.text()).toContain('handwritten')
		wrapper.unmount()
	})

	it('can be backed up, with its name for a title', () => {
		const wrapper = mount(BackupAppModal, {
			props: { appId: handwritten.name, appName: '' },
			global: { ...globals, mocks: { ...globals.mocks, $api: { backup: { getDestinations: () => Promise.resolve({ data: { data: ['offsite'] } }) } } } },
		})
		expect(wrapper.text()).toContain('Back up')
		wrapper.unmount()
	})
})
