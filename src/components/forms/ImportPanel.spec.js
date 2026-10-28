// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import i18n from '@/plugins/i18n'
import ImportPanel from '@/components/forms/ImportPanel.vue'
import AppPanel from '@/components/Apps/AppPanel.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('composerize', () => ({ default: () => '' }))
// AppPanel imports lottie-web, which paints into a canvas on import; happy-dom has none
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

const stack = `x-php: &php
  image: vecto-php:latest
  env_file: [.env]
services:
  app:
    <<: *php
  queue:
    <<: *php
`

function panel() {
	return mount(ImportPanel, { global: { plugins: [Buefy, i18n] } })
}

describe('importing a compose with its .env', () => {
	it('installs it as written, with a name when it has none, and its .env', async () => {
		const wrapper = panel()
		await wrapper.setData({ dockerComposeCommands: stack, envText: 'DB_PASSWORD=secret\n' })
		expect(wrapper.vm.needsName).toBe(true)
		expect(wrapper.vm.canInstallAsWritten).toBe(false)
		await wrapper.setData({ appName: 'Vecto' }) // not a compose project name
		expect(wrapper.vm.canInstallAsWritten).toBe(false)
		await wrapper.setData({ appName: 'vecto' })
		expect(wrapper.vm.canInstallAsWritten).toBe(true)

		wrapper.vm.emitInstall()
		const [[text]] = wrapper.emitted('install')
		expect(text).toContain('<<: *php') // as written: the anchors stay
		const doc = parse(text, { merge: true })
		expect(doc.name).toBe('vecto')
		expect(doc['x-casaos-env']).toBe('DB_PASSWORD=secret\n')
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('hands the .env to the form with the compose', async () => {
		const wrapper = panel()
		await wrapper.setData({ dockerComposeCommands: 'name: web\nservices:\n  web:\n    image: nginx\n', envText: 'A=1\n' })
		expect(wrapper.vm.needsName).toBe(false)
		wrapper.vm.emitSubmit()
		const [[compose, env]] = wrapper.emitted('update')
		expect(parse(compose).services.web.image).toBe('nginx')
		expect(env).toBe('A=1\n')
	})

	it('says what is wrong with text that is not compose', async () => {
		const wrapper = panel()
		await wrapper.setData({ dockerComposeCommands: 'hello' })
		wrapper.vm.emitInstall()
		expect(wrapper.vm.errors).toContain('no services')
		expect(wrapper.emitted('install')).toBeUndefined()
	})
})

describe('the app panel', () => {
	it('installs as written and says a refusal as text', async () => {
		const refusal = Object.assign(new Error('refused'), { response: { data: { message: '.env: TZ is set by <b>CasaOS</b>' } } })
		const installComposeApp = vi.fn().mockRejectedValue(refusal)
		const vm = {
			installStarted: false,
			isLoading: false,
			$openAPI: { appManagement: { compose: { installComposeApp } } },
			$buefy: { toast: { open: vi.fn() } },
		}

		await AppPanel.methods.installAsWritten.call(vm, 'name: x\n')

		expect(installComposeApp).toHaveBeenCalledWith('name: x\n', false, true)
		expect(vm.installStarted).toBe(false)
		expect(vm.isLoading).toBe(false)
		expect(vm.$buefy.toast.open.mock.calls[0][0].message).toBe('.env: TZ is set by &lt;b&gt;CasaOS&lt;/b&gt;')
	})
})

const KEYS = [
	'optional',
	'KEY=value, one per line: installed with the app as its .env',
	'Drop the .env file here or click to upload',
	'The compose file has no name: installing it as written needs one (lowercase letters, digits, - and _).',
	'Install as written skips the form, which keeps only part of each service.',
	'Install as written',
]

describe('the language files', () => {
	it.each(KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
	})
})
