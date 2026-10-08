// @vitest-environment happy-dom
import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SystemPackageUpdateModal from './SystemPackageUpdateModal.vue'

const answer = data => () => Promise.resolve({ data: { success: 200, data } })
const pending = () => new Promise(() => {})
const idle = { supported: true, manager: 'apt', state: 'idle', reboot_required: false }
// Buttons and messages keep their words, which is what is checked.
const withSlot = {
	render() {
		return h('div', this.$slots.default?.())
	},
}

let wrapper
afterEach(() => wrapper?.unmount())

async function open(sys, mocks = {}) {
	wrapper = mount(SystemPackageUpdateModal, {
		global: {
			mocks: { $t: key => key, $api: { sys: { getSystemPackageUpdateStatus: answer(idle), ...sys } }, ...mocks },
			stubs: { 'b-button': withSlot, 'b-message': withSlot, 'b-icon': true },
		},
	})
	await flushPromises()
	return wrapper
}

describe('system packages', () => {
	it('a failed check says so, with the core\'s words, and not that nothing is to update', async () => {
		const failure = Object.assign(new Error('Request failed with status code 500'), { response: { data: { message: 'E: Could not get lock /var/lib/apt/lists/lock' } } })
		const w = await open({ getSystemPackages: () => Promise.reject(failure) })

		expect(w.text()).toContain('Could not check for system package updates.')
		expect(w.text()).toContain('E: Could not get lock /var/lib/apt/lists/lock')
		expect(w.text()).not.toContain('No system package updates are available.')
		expect(w.text()).not.toContain('Request failed with status code 500')
	})

	it('an unsupported host gets the translated sentence, the core\'s reason below, and no footer', async () => {
		const w = await open({ getSystemPackages: answer({ supported: false, reason: 'apt-get was not found on this host.', updates: [], count: 0 }) })

		expect(w.text()).toContain('System package updates are not supported on this host.')
		expect(w.text()).toContain('apt-get was not found on this host.')
		expect(w.find('footer').exists()).toBe(false)
	})

	it('shows no footer while the update runs', async () => {
		const w = await open({
			getSystemPackageUpdateStatus: answer({ ...idle, state: 'running', log: 'Reading package lists...' }),
			getSystemPackages: pending,
		})

		expect(w.find('footer').exists()).toBe(false)
		expect(w.find('pre').text()).toBe('Reading package lists...')
	})
})

describe('docker on a line of its own', () => {
	const docker = {
		installed: true,
		origin: 'docker-repository',
		version: '29.8.1',
		updates: [{ name: 'docker-ce', current_version: '5:29.8.1-1', candidate_version: '5:29.8.2-1' }],
		manual_command: 'sudo apt-get update && sudo apt-get install --only-upgrade docker-ce docker-ce-cli containerd.io',
	}
	const check = extra => answer({
		supported: true,
		manager: 'apt',
		updates: [{ name: 'libc6', current_version: '2.35-1', candidate_version: '2.35-2' }],
		count: 1,
		...extra,
	})

	it('shows its version and where it came from, what it has, the warning and the command to type', async () => {
		const w = await open({ getSystemPackages: check({ docker }) })

		const line = w.find('.docker-line')
		expect(line.exists()).toBe(true)
		expect(line.text()).toContain('Docker')
		expect(line.text()).toContain('29.8.1')
		expect(line.text()).toContain('Installed from Docker\'s own repository.')
		expect(line.text()).toContain('Docker has updates. This update leaves it alone.')
		expect(line.text()).toContain('docker-ce')
		expect(line.text()).toContain('every container stops until it is back')
		expect(line.find('pre.docker-command').text()).toBe(docker.manual_command)
		// and Docker's package is not among the ones the button installs
		expect(w.find('.package-list').text()).toContain('libc6')
		expect(w.find('.package-list').text()).not.toContain('docker-ce')
	})

	it('says it is up to date, with no command, when nothing is on offer', async () => {
		const w = await open({ getSystemPackages: check({ docker: { ...docker, updates: [] } }) })

		expect(w.find('.docker-line').text()).toContain('Docker is up to date.')
		expect(w.find('.docker-line pre').exists()).toBe(false)
	})

	it('shows no command for a Docker whose origin it does not know, and says so', async () => {
		const w = await open({ getSystemPackages: check({ docker: { ...docker, origin: 'unknown', manual_command: '' } }) })

		expect(w.find('.docker-line').text()).toContain('Installed from a source ReCasaOS does not recognise.')
		expect(w.find('.docker-line').text()).toContain('ReCasaOS does not know how Docker was installed here, so it shows no command.')
		expect(w.find('.docker-line pre').exists()).toBe(false)
	})

	it('has no Docker line when the host reports none', async () => {
		const w = await open({ getSystemPackages: check({}) })

		expect(w.find('.docker-line').exists()).toBe(false)
	})

	it('shows Docker even when nothing else is to update, next to the "no updates" sentence', async () => {
		const w = await open({ getSystemPackages: check({ updates: [], count: 0, docker }) })

		expect(w.text()).toContain('No system package updates are available.')
		expect(w.find('.docker-line').text()).toContain('docker-ce')
		expect(w.text()).not.toContain('Update packages')
	})

	it('asks for confirmation of the listed packages and says Docker is not part of it', async () => {
		const confirm = vi.fn()
		const w = await open({ getSystemPackages: check({ docker }) }, { $buefy: { dialog: { confirm } } })

		w.vm.confirmUpdate()

		expect(confirm).toHaveBeenCalledTimes(1)
		expect(confirm.mock.calls[0][0].message).toContain('Docker is not part of this update.')
		expect(confirm.mock.calls[0][0].message).not.toContain('all available')
	})
})
