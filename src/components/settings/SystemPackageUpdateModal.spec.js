// @vitest-environment happy-dom
import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SystemPackageUpdateModal from './SystemPackageUpdateModal.vue'
import source from './SystemPackageUpdateModal.vue?raw'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

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
			mocks: { $t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, name) => params[name]) : key), $api: { sys: { getSystemPackageUpdateStatus: answer(idle), ...sys } }, ...mocks },
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
		restarts_docker: true,
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
		expect(w.find('.package-list').text()).toContain('libc6')
	})

	it('says that no newer Docker is offered, with no command, when apt has nothing for a source it can see', async () => {
		for (const origin of ['docker-repository', 'distribution']) {
			const w = await open({ getSystemPackages: check({ docker: { ...docker, origin, updates: [] } }) })

			expect(w.find('.docker-line').text()).toContain('No newer Docker is offered by this machine\'s package sources.')
			expect(w.find('.docker-line').text()).not.toContain('up to date')
			expect(w.find('.docker-line pre').exists()).toBe(false)
			w.unmount()
		}
	})

	it('says a newer Docker exists when it is on hold, and gives the command', async () => {
		const held = { ...docker, updates: [], candidate: '29.8.2', held: true, version: '28.0.4', manual_command: 'sudo apt-get update && sudo apt-get install --only-upgrade --allow-change-held-packages docker-ce' }
		const w = await open({ getSystemPackages: check({ docker: held }) })

		const line = w.find('.docker-line').text()
		expect(line).toContain('A newer Docker, 29.8.2, exists in this machine\'s package sources, but the package is on hold, so no update offers it.')
		expect(line).not.toContain('No newer Docker is offered')
		expect(w.find('pre.docker-command').text()).toContain('--allow-change-held-packages')
	})

	it('says a newer Docker exists when apt keeps it back without a hold', async () => {
		const w = await open({ getSystemPackages: check({ docker: { ...docker, updates: [], candidate: '29.8.2', held: false, version: '28.0.4' } }) })

		const line = w.find('.docker-line').text()
		expect(line).toContain('A newer Docker, 29.8.2, exists in this machine\'s package sources, but apt does not offer it for an update (a hold, or a dependency).')
		expect(line).not.toContain('on hold')
	})

	it('does not say "up to date" of a snap, which apt cannot see, and gives the command', async () => {
		const w = await open({ getSystemPackages: check({ docker: { installed: true, origin: 'snap', updates: [], manual_command: 'sudo snap refresh docker' } }) })

		const line = w.find('.docker-line').text()
		expect(line).toContain('Installed as a snap.')
		expect(line).toContain('ReCasaOS cannot see updates of a snap. Update it with the command below.')
		expect(line).not.toContain('Docker is up to date.')
		expect(w.find('pre.docker-command').text()).toBe('sudo snap refresh docker')
	})

	it('does not say "up to date" of a Docker whose source it does not know, and shows no command', async () => {
		const w = await open({ getSystemPackages: check({ docker: { installed: true, origin: 'unknown', version: '24.0.5', updates: [], manual_command: '' } }) })

		const line = w.find('.docker-line').text()
		expect(line).toContain('Installed from a source ReCasaOS does not recognise.')
		expect(line).toContain('offer no update for it')
		expect(line).not.toContain('Docker is up to date.')
		expect(w.find('.docker-line pre').exists()).toBe(false)
	})

	it('says it has no command when it has updates for a source it does not know', async () => {
		const w = await open({ getSystemPackages: check({ docker: { ...docker, origin: 'unknown', manual_command: '' } }) })

		expect(w.find('.docker-line').text()).toContain('ReCasaOS does not know how Docker was installed here, so it shows no command.')
		expect(w.find('.docker-line pre').exists()).toBe(false)
	})

	it('warns that Docker restarts only when what is pending restarts it', async () => {
		const plugin = { ...docker, restarts_docker: false, updates: [{ name: 'docker-compose-plugin', current_version: '2.40.0', candidate_version: '2.40.1' }] }
		const w = await open({ getSystemPackages: check({ docker: plugin }) })

		expect(w.find('.docker-line').text()).toContain('Docker has updates.')
		expect(w.find('.docker-line').text()).not.toContain('every container stops until it is back')
	})

	it('copes with a Docker object whose updates are null', async () => {
		const w = await open({ getSystemPackages: check({ docker: { ...docker, updates: null } }) })

		expect(w.find('.docker-line').text()).toContain('No newer Docker is offered by this machine\'s package sources.')
	})

	it('has no Docker line when the host reports none', async () => {
		const w = await open({ getSystemPackages: check({}) })

		expect(w.find('.docker-line').exists()).toBe(false)
	})

	it('shows Docker even when nothing else is to update, next to the "no updates" sentence', async () => {
		const w = await open({ getSystemPackages: check({ updates: [], count: 0, docker }) })

		expect(w.text()).toContain('No other system package updates are available.')
		expect(w.find('.docker-line').text()).toContain('docker-ce')
		expect(w.text()).not.toContain('Update packages')
	})

	it('says plainly that nothing is available when Docker has nothing either', async () => {
		const w = await open({ getSystemPackages: check({ updates: [], count: 0, docker: { ...docker, updates: [] } }) })

		expect(w.text()).toContain('No system package updates are available.')
		expect(w.text()).not.toContain('No other')
	})

	it('asks for confirmation of the listed packages and says Docker is not part of it', async () => {
		const confirm = vi.fn()
		const w = await open({ getSystemPackages: check({ docker }) }, { $buefy: { dialog: { confirm } } })

		w.vm.confirmUpdate()

		expect(confirm).toHaveBeenCalledTimes(1)
		expect(confirm.mock.calls[0][0].message).toContain('Docker is not part of this update.')
		expect(confirm.mock.calls[0][0].message).not.toContain('all available')
	})

	it('does not say Docker is not part of the update when the core did not say so', async () => {
		// an older core lists Docker's packages with the rest and installs them: the sentence would be false
		const confirm = vi.fn()
		const w = await open({ getSystemPackages: check({}) }, { $buefy: { dialog: { confirm } } })

		w.vm.confirmUpdate()

		expect(confirm.mock.calls[0][0].message).not.toContain('Docker')
	})

	it('shows the core\'s reason once when the update is refused, and checks the list again', async () => {
		const reason = 'another update or package operation is running on this box: casaos-update is running'
		const refusal = Object.assign(new Error('Request failed with status code 409'), { response: { status: 409, data: { message: reason, data: { ...idle, error: reason } } } })
		const getSystemPackages = vi.fn(check({ docker }))
		const w = await open({ getSystemPackages, startSystemPackageUpdate: () => Promise.reject(refusal) })
		expect(getSystemPackages).toHaveBeenCalledTimes(1)

		await w.vm.startUpdate()
		await flushPromises()

		expect(w.text().split(reason).length - 1).toBe(1)
		expect(getSystemPackages).toHaveBeenCalledTimes(2)
	})
})

// ---- updating Docker from the dialog ---------------------------------------------------------

const planId = 'ab'.repeat(32)
const enginePackages = [
	{ name: 'docker-ce', current_version: '5:28.0.4-1~debian.11~bullseye', candidate_version: '5:29.8.0-1~debian.11~bullseye' },
	{ name: 'containerd.io', current_version: '1.7.27-1', candidate_version: '2.3.6-1' },
]
// packages that are not installed yet: Docker 29 needs nftables, Docker 28 did not
const nftables = { name: 'nftables', current_version: '', candidate_version: '1.0.6-2+deb11u2', new: true }
const libnftables = { name: 'libnftables1', current_version: '', candidate_version: '1.0.6-2+deb11u2', new: true }
const planRefusal = 'The update would go beyond Docker\'s own packages and the few new ones they need, or could not be planned, so ReCasaOS will not run it.'
const dockerIdle = { supported: true, state: 'idle', outcome: '', error: '', error_code: '', exit_code: null, started_at: '', completed_at: '', from: '', to: '', not_returned: [], rollback_command: '', log: '' }
const dockerRun = extra => ({ ...dockerIdle, ...extra })
const running = dockerRun({ state: 'running', from: '28.0.4', started_at: '2026-10-09T10:00:00Z' })
const succeeded = dockerRun({ state: 'succeeded', outcome: 'success', from: '28.0.4', to: '29.8.0', completed_at: '2026-10-09T10:02:00Z' })
const reply = data => ({ data: { success: 200, data } })
const container = (name, restartPolicy, extra = {}) => ({ name, image: 'img', restart_policy: restartPolicy, host_network: false, ports: [], ...extra })
const containersOf = list => answer({ running: true, containers: list })
const translate = (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, name) => params[name]) : key)
// a button that can be pressed and disabled, unlike the stub that only keeps its words
const press = { props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' }

// what GET /v1/sys/packages says on the owner's box: Debian 11, docker-ce 28.0.4, candidate 29.8.0
function dockerPackages(update = {}, docker = {}) {
	return answer({
		supported: true,
		manager: 'apt',
		updates: [],
		count: 0,
		docker: {
			installed: true,
			origin: 'docker-repository',
			version: '28.0.4',
			restarts_docker: true,
			updates: enginePackages,
			manual_command: 'sudo apt-get update && sudo apt-get install --only-upgrade docker-ce',
			update: { available: true, refusal: '', refusal_detail: [], from: '28.0.4', to: '29.8.0', major_jump: true, plan_id: planId, packages: enginePackages, ...update },
			...docker,
		},
	})
}

async function openDocker(sys = {}, mocks = {}) {
	wrapper = mount(SystemPackageUpdateModal, {
		// in the document, so that the focus and the scroll offset mean something
		attachTo: document.body,
		global: {
			mocks: {
				$t: translate,
				$api: {
					sys: {
						getSystemPackageUpdateStatus: answer(idle),
						getDockerUpdateStatus: answer(dockerIdle),
						getSystemPackages: dockerPackages(),
						getDockerContainers: containersOf([]),
						...sys,
					},
				},
				...mocks,
			},
			stubs: { 'b-button': press, 'b-message': withSlot, 'b-tag': withSlot, 'b-icon': true },
		},
	})
	await flushPromises()
	return wrapper
}

async function openConfirmation(w) {
	await w.find('.docker-update-button').trigger('click')
	await flushPromises()
}

// the core's refusals: the reason in `message` and in `data.error`, the code in `data.error_code`
function refused(status, code, reason, more = {}) {
	return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message: reason, data: { ...dockerIdle, error: reason, error_code: code, ...more } } } })
}

describe('the button that updates Docker', () => {
	it('is offered when the core says Docker can be updated, before the command that stays as the fallback', async () => {
		const w = await openDocker()

		const line = w.find('.docker-line')
		expect(line.find('.docker-update-button').text()).toBe('Update Docker')
		expect(line.find('pre.docker-command').text()).toContain('--only-upgrade')
		expect(line.html().indexOf('docker-update-button')).toBeLessThan(line.html().indexOf('docker-command'))
	})

	it('is not offered by a core that does not know the update, and says nothing about it', async () => {
		const w = await openDocker({ getSystemPackages: dockerPackages(undefined, { update: undefined }) })

		expect(w.find('.docker-update-button').exists()).toBe(false)
		expect(w.find('.docker-refusal').exists()).toBe(false)
		expect(w.find('pre.docker-command').exists()).toBe(true)
	})

	it.each([
		['unsupported', 'This machine cannot update Docker from here.'],
		['origin', 'ReCasaOS only updates a Docker installed from Docker\'s own repository, and this one was not.'],
		['held', 'The Docker packages are on hold, and a hold is deliberate: ReCasaOS does not override it. To update anyway, use the command below.'],
		['daemon', 'ReCasaOS cannot reach Docker right now, so it will not update it. Check that Docker is running.'],
		['swarm', 'This machine is part of a Docker swarm, which ReCasaOS does not update.'],
		['plan', planRefusal],
		['disk', 'There is less than 1 GiB of free disk space where the update needs it, so ReCasaOS will not start it. Free some space and check again.'],
		['something-new', 'ReCasaOS did not update Docker.'],
	])('refused with the code "%s": no button, this sentence, and the command to type', async (refusal, sentence) => {
		const w = await openDocker({ getSystemPackages: dockerPackages({ available: false, refusal }) })

		expect(w.find('.docker-update-button').exists()).toBe(false)
		expect(w.find('.docker-refusal').text()).toBe(sentence)
		expect(w.find('pre.docker-command').exists()).toBe(true)
	})

	it('names the packages a refused plan would have touched, as text', async () => {
		const names = ['docker-ce-cli', '<b>evil</b>']
		const w = await openDocker({ getSystemPackages: dockerPackages({ available: false, refusal: 'plan', refusal_detail: names }) })

		expect(w.find('.docker-refusal').text()).toContain('Blocked by: docker-ce-cli, <b>evil</b>.')
		expect(w.find('.docker-refusal b').exists()).toBe(false)
	})

	// the core's detail of a refused plan is package names, or one of its fixed markers in
	// parentheses: both are shown as given, under a label that reads right after either
	it.each([
		[['libc6', 'docker.io'], 'Blocked by: libc6, docker.io.'],
		[['(more than 10 new packages)'], 'Blocked by: (more than 10 new packages).'],
		[['(invalid name)'], 'Blocked by: (invalid name).'],
		[['libc6', '(invalid name)'], 'Blocked by: libc6, (invalid name).'],
	])('a refused plan with the detail %j says %j', async (detail, line) => {
		const w = await openDocker({ getSystemPackages: dockerPackages({ available: false, refusal: 'plan', refusal_detail: detail }) })

		expect(w.find('.docker-refusal').text()).toBe(`${planRefusal} ${line}`)
	})

	it.each([[[]], [null], [undefined], [['']]])('a refused plan with the detail %j is the sentence alone, with no label and no empty list', async (detail) => {
		const w = await openDocker({ getSystemPackages: dockerPackages({ available: false, refusal: 'plan', refusal_detail: detail }) })

		expect(w.find('.docker-refusal').text()).toBe(planRefusal)
	})

	it('is not matched by the core\'s English words: only the code speaks', async () => {
		const w = await openDocker({ getSystemPackages: dockerPackages({ available: false, refusal: 'held', refusal_detail: ['Docker is on hold'] }) })

		expect(w.find('.docker-refusal').text()).toContain('a hold is deliberate')
		expect(w.find('.docker-refusal').text()).not.toContain('Packages concerned')
	})
})

describe('the confirmation before Docker is updated', () => {
	it('is a view of this window, not a dialog, and it reads the containers when it opens', async () => {
		const confirm = vi.fn()
		const getDockerContainers = vi.fn(containersOf([container('web', 'always')]))
		const w = await openDocker({ getDockerContainers }, { $buefy: { dialog: { confirm } } })
		expect(getDockerContainers).not.toHaveBeenCalled()

		await openConfirmation(w)

		expect(confirm).not.toHaveBeenCalled()
		expect(getDockerContainers).toHaveBeenCalledTimes(1)
		const view = w.find('.docker-confirm')
		expect(view.text()).toContain('Docker 28.0.4 → 29.8.0')
		expect(view.text()).toContain('every container stops until it is back')
		expect(view.text()).toContain('docker-ce')
		expect(view.text()).toContain('5:28.0.4-1~debian.11~bullseye')
		expect(view.text()).toContain('5:29.8.0-1~debian.11~bullseye')
		expect(view.text()).toContain('containerd.io')
		expect(view.text()).toContain('web')
		expect(w.find('.docker-line').exists()).toBe(false)
		expect(w.findAll('footer button').map(button => button.text())).toEqual(['Cancel', 'Update Docker to 29.8.0'])
	})

	it('warns hard about a new major version, and only then', async () => {
		const major = await openDocker()
		await openConfirmation(major)
		expect(major.find('.docker-major').text()).toContain('This is a new major version of Docker, from 28.0.4 to 29.8.0.')
		expect(major.find('.docker-major').text()).toContain('Apps that talk to Docker directly may need an update of their own')
		expect(major.find('.docker-major').text()).toContain('not every setup has been tested')
		major.unmount()

		const minor = await openDocker({ getSystemPackages: dockerPackages({ from: '29.2.0', to: '29.8.0', major_jump: false }) })
		await openConfirmation(minor)
		expect(minor.find('.docker-confirm').text()).toContain('Docker 29.2.0 → 29.8.0')
		expect(minor.find('.docker-major').exists()).toBe(false)
		expect(minor.find('.docker-confirm').text()).not.toContain('new major version')
		expect(minor.find('.docker-confirm').text()).toContain('every container stops until it is back')
	})

	it('shows a package that is not installed yet with no current version and a label, and says so under the table', async () => {
		const w = await openDocker({ getSystemPackages: dockerPackages({ packages: [...enginePackages, nftables, libnftables] }) })

		await openConfirmation(w)

		const rows = w.findAll('.docker-packages tbody tr')
		expect(rows.map(row => row.findAll('td').map(cell => cell.text()))).toEqual([
			['docker-ce', '5:28.0.4-1~debian.11~bullseye', '5:29.8.0-1~debian.11~bullseye'],
			['containerd.io', '1.7.27-1', '2.3.6-1'],
			['nftables', 'New package', '1.0.6-2+deb11u2'],
			['libnftables1', 'New package', '1.0.6-2+deb11u2'],
		])
		expect(rows.map(row => row.find('.docker-new-package').exists())).toEqual([false, false, true, true])
		const sentence = w.find('.docker-new-packages')
		expect(sentence.text()).toBe('This Docker version also needs these packages that are not installed yet: nftables, libnftables1.')
		expect(sentence.element.previousElementSibling.classList.contains('docker-packages')).toBe(true)
		expect(w.find('.docker-major').exists()).toBe(true)
	})

	it('says "a package", not "these packages", when one is new', async () => {
		const w = await openDocker({ getSystemPackages: dockerPackages({ packages: [...enginePackages, nftables] }) })

		await openConfirmation(w)

		expect(w.find('.docker-new-packages').text()).toBe('This Docker version also needs a package that is not installed yet: nftables.')
	})

	it('has no label and no sentence when every package is an upgrade, even one with no current version from an older core', async () => {
		const older = { name: 'docker-model-plugin', current_version: '', candidate_version: '1.0.0-1' }
		const w = await openDocker({ getSystemPackages: dockerPackages({ packages: [...enginePackages, older] }) })

		await openConfirmation(w)

		expect(w.find('.docker-new-packages').exists()).toBe(false)
		expect(w.find('.docker-new-package').exists()).toBe(false)
		expect(w.find('.docker-packages').text()).not.toContain('New package')
		expect(w.findAll('.docker-packages tbody tr').map(row => row.findAll('td')[1].text())).toEqual(['5:28.0.4-1~debian.11~bullseye', '1.7.27-1', '—'])
	})

	it('shows the name of a new package as text, never as markup', async () => {
		const evil = '<img src=x onerror=alert(1)>'
		const w = await openDocker({ getSystemPackages: dockerPackages({ packages: [...enginePackages, { ...nftables, name: evil }, libnftables] }) })

		await openConfirmation(w)

		expect(w.find('.docker-confirm img').exists()).toBe(false)
		expect(w.findAll('.docker-packages tbody tr')[2].find('td').text()).toBe(evil)
		expect(w.find('.docker-new-packages').text()).toContain(`${evil}, libnftables1.`)
		expect(w.find('.docker-new-packages img').exists()).toBe(false)
	})

	it('counts the containers that will not come back and puts them first, highlighted', async () => {
		const list = [container('web', 'always'), container('db', 'unless-stopped'), container('cron', 'no'), container('old', ''), container('job', 'on-failure')]
		const w = await openDocker({ getDockerContainers: containersOf(list) })

		await openConfirmation(w)

		expect(w.find('.docker-wont-return-count').text()).toBe('2 running containers will not start again by themselves.')
		const rows = w.findAll('.docker-containers tbody tr')
		expect(rows.map(row => row.find('td').text())).toEqual(['cron', 'old', 'web', 'db', 'job'])
		expect(rows.map(row => row.classes('docker-wont-return'))).toEqual([true, true, false, false, false])
		expect(rows[0].text()).toContain('Stays stopped')
		expect(rows[0].text()).toContain('no')
		expect(rows[2].text()).not.toContain('Stays stopped')
	})

	it('says "one container", not "1 running containers"', async () => {
		const w = await openDocker({ getDockerContainers: containersOf([container('cron', 'no'), container('web', 'always')]) })

		await openConfirmation(w)

		expect(w.find('.docker-wont-return-count').text()).toBe('One running container will not start again by itself.')
	})

	it('has no count when every container comes back by itself', async () => {
		const w = await openDocker({ getDockerContainers: containersOf([container('web', 'always')]) })

		await openConfirmation(w)

		expect(w.find('.docker-wont-return-count').exists()).toBe(false)
		expect(w.find('.docker-wont-return').exists()).toBe(false)
	})

	it.each([
		['port 53', container('dns', 'always', { ports: [{ port: 53, protocol: 'udp', host_port: 53 }] })],
		['port 80', container('proxy', 'always', { ports: [{ port: 80, protocol: 'tcp', host_port: 80 }] })],
		['port 443', container('proxy', 'always', { ports: [{ port: 8443, protocol: 'tcp', host_port: 443 }] })],
		['the host network', container('proxy', 'always', { host_network: true })],
	])('warns that a container on %s may be the machine\'s DNS or web server', async (_, one) => {
		const w = await openDocker({ getDockerContainers: containersOf([container('other', 'always', { ports: [{ port: 3000, protocol: 'tcp', host_port: 3000 }] }), one]) })

		await openConfirmation(w)

		expect(w.find('.docker-exposed').text()).toBe(`Containers that publish port 53, 80 or 443, or use the host network: ${one.name}. That may be this machine's DNS or web server, and it will be down while Docker restarts.`)
	})

	it('does not warn of port 80 inside a container that is published elsewhere, or of no port', async () => {
		const w = await openDocker({ getDockerContainers: containersOf([container('app', 'always', { ports: [{ port: 80, protocol: 'tcp', host_port: 8080 }] }), container('worker', 'always', { ports: null })]) })

		await openConfirmation(w)

		expect(w.find('.docker-exposed').exists()).toBe(false)
	})

	it('shows a container name as text, never as markup', async () => {
		const evil = '<img src=x onerror=alert(1)>'
		const w = await openDocker({ getDockerContainers: containersOf([container(evil, 'no', { ports: [{ port: 80, protocol: 'tcp', host_port: 80 }] })]) })

		await openConfirmation(w)

		expect(w.find('.docker-confirm img').exists()).toBe(false)
		expect(w.find('.docker-containers td').text()).toBe(evil)
		expect(w.find('.docker-exposed').text()).toContain(evil)
		expect(w.find('.docker-exposed img').exists()).toBe(false)
	})

	it('waits for the list before the button works, then lets it through even when the list cannot be read', async () => {
		const w = await openDocker({ getDockerContainers: pending })
		await openConfirmation(w)
		expect(w.text()).toContain('Listing the running containers...')
		expect(w.find('.docker-confirm-button').attributes('disabled')).toBeDefined()
		w.unmount()

		for (const failing of [() => Promise.reject(new Error('Network Error')), answer({ running: false, containers: [] })]) {
			const again = await openDocker({ getDockerContainers: failing })
			await openConfirmation(again)
			expect(again.find('.docker-confirm').text()).toContain('The running containers could not be listed. You can still update.')
			expect(again.find('.docker-confirm-button').attributes('disabled')).toBeUndefined()
			again.unmount()
		}
	})

	it('says so when nothing is running', async () => {
		const w = await openDocker({ getDockerContainers: containersOf([]) })

		await openConfirmation(w)

		expect(w.find('.docker-confirm').text()).toContain('No container is running.')
	})

	it('ignores a list that comes back after the person left and came again', async () => {
		let late
		const first = new Promise((resolve) => {
			late = resolve
		})
		const getDockerContainers = vi.fn()
			.mockReturnValueOnce(first)
			.mockResolvedValue(reply({ running: true, containers: [container('db', 'always')] }))
		const w = await openDocker({ getDockerContainers })
		await openConfirmation(w)
		await w.findAll('footer button')[0].trigger('click')
		await openConfirmation(w)
		expect(w.find('.docker-containers').text()).toContain('db')

		late(reply({ running: true, containers: [container('old', 'always')] }))
		await flushPromises()

		expect(w.find('.docker-containers').text()).toContain('db')
		expect(w.find('.docker-containers').text()).not.toContain('old')
	})

	it('goes back to the Docker line on Cancel without asking the core anything', async () => {
		const startDockerUpdate = vi.fn()
		const w = await openDocker({ startDockerUpdate })
		await openConfirmation(w)

		await w.findAll('footer button')[0].trigger('click')

		expect(w.find('.docker-confirm').exists()).toBe(false)
		expect(w.find('.docker-update-button').exists()).toBe(true)
		expect(startDockerUpdate).not.toHaveBeenCalled()
	})

	it('shows the plan that was confirmed, and sends its plan_id, even if a check lands meanwhile', async () => {
		const startDockerUpdate = vi.fn(answer(dockerRun({ state: 'running' })))
		const w = await openDocker({ startDockerUpdate, getDockerUpdateStatus: vi.fn().mockResolvedValueOnce(reply(dockerIdle)).mockResolvedValue(reply(running)) })
		await openConfirmation(w)

		w.vm.info = { ...w.vm.info, docker: { ...w.vm.info.docker, update: { ...w.vm.info.docker.update, to: '30.0.0', plan_id: 'cd'.repeat(32) } } }
		await flushPromises()
		expect(w.find('.docker-confirm').text()).toContain('Docker 28.0.4 → 29.8.0')
		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(startDockerUpdate).toHaveBeenCalledTimes(1)
		expect(startDockerUpdate).toHaveBeenCalledWith({ plan_id: planId })
	})
})

describe('starting the Docker update', () => {
	it('starts it, shows the run in a state of its own, and takes the footer and the other actions away', async () => {
		const startDockerUpdate = vi.fn(answer(dockerRun({ state: 'running' })))
		const w = await openDocker({ startDockerUpdate, getDockerUpdateStatus: vi.fn().mockResolvedValueOnce(reply(dockerIdle)).mockResolvedValue(reply(running)) })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(startDockerUpdate).toHaveBeenCalledWith({ plan_id: planId })
		expect(w.find('.docker-confirm').exists()).toBe(false)
		expect(w.find('.docker-job').text()).toContain('Updating Docker... apps are restarting')
		expect(w.find('footer').exists()).toBe(false)
		expect(w.find('.docker-update-button').exists()).toBe(false)
		expect(w.find('.docker-line pre.docker-command').exists()).toBe(false)
		// the generic job's own state is untouched
		expect(w.vm.status.state).toBe('idle')
		expect(w.vm.isRunning).toBe(false)
	})

	it('keeps the reason when the plan changed, says what to do, and checks again for the new plan', async () => {
		const reason = 'the Docker update plan changed: reconfirm'
		const startDockerUpdate = vi.fn(() => Promise.reject(refused(409, 'changed', reason)))
		const newPlan = 'cd'.repeat(32)
		const getSystemPackages = vi.fn()
			.mockImplementationOnce(dockerPackages())
			.mockImplementation(dockerPackages({ to: '29.9.0', plan_id: newPlan }))
		const w = await openDocker({ startDockerUpdate, getSystemPackages })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(w.find('.docker-confirm').exists()).toBe(false)
		expect(w.text()).toContain('A newer Docker appeared since this window was opened. Look at the new versions and confirm again.')
		expect(w.text().split(reason).length - 1).toBe(1)
		expect(getSystemPackages).toHaveBeenCalledTimes(2)
		// the person confirms the new plan, not the old one
		await openConfirmation(w)
		expect(w.find('.docker-confirm').text()).toContain('Docker 28.0.4 → 29.9.0')
		startDockerUpdate.mockImplementation(answer(dockerRun({ state: 'running' })))
		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()
		expect(startDockerUpdate).toHaveBeenLastCalledWith({ plan_id: newPlan })
	})

	it.each([
		['nothing', 'Docker has nothing to update.'],
		['held', 'The Docker packages are on hold'],
		['plan', 'The update would go beyond Docker\'s own packages'],
	])('says why for "%s", keeps the core\'s reason once, and checks again', async (code, sentence) => {
		const reason = `english reason for ${code}`
		const getSystemPackages = vi.fn(dockerPackages())
		const w = await openDocker({ getSystemPackages, startDockerUpdate: () => Promise.reject(refused(409, code, reason)) })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(w.text()).toContain(sentence)
		expect(w.text().split(reason).length - 1).toBe(1)
		expect(getSystemPackages).toHaveBeenCalledTimes(2)
	})

	it.each([
		[['libc6'], 'Blocked by: libc6.'],
		[['(more than 10 new packages)'], 'Blocked by: (more than 10 new packages).'],
		[[], ''],
	])('shows the detail %j of a plan refused at the start as given, after the sentence', async (detail, line) => {
		const reason = 'english reason'
		const w = await openDocker({ startDockerUpdate: () => Promise.reject(refused(409, 'plan', reason, { refusal_detail: detail })) })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		const message = w.text()
		expect(message).toContain(line ? `${planRefusal} ${line}` : planRefusal)
		if (!line)
			expect(message).not.toContain('Blocked by')
		expect(message.split(reason).length - 1).toBe(1)
	})

	it.each([
		['maintenance', [], 'Another update or package operation is running on this machine. Try again when it is done.'],
		['apps', ['nextcloud', 'immich'], 'Some apps are busy right now, or ReCasaOS could not check. Try again in a few minutes. Busy apps: nextcloud, immich.'],
		['apps', [], 'Some apps are busy right now, or ReCasaOS could not check. Try again in a few minutes.'],
	])('for "%s" says it is a matter of waiting, with no new check of the packages', async (code, detail, sentence) => {
		const reason = 'english reason'
		const getSystemPackages = vi.fn(dockerPackages())
		const w = await openDocker({ getSystemPackages, startDockerUpdate: () => Promise.reject(refused(409, code, reason, { refusal_detail: detail })) })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(w.text()).toContain(sentence)
		expect(w.text().split(reason).length - 1).toBe(1)
		expect(getSystemPackages).toHaveBeenCalledTimes(1)
		// what is on screen is still true: the button is there for another go
		expect(w.find('.docker-update-button').exists()).toBe(true)
	})

	it('picks up the run it ran into when the core says one is already running', async () => {
		const getSystemPackages = vi.fn(dockerPackages())
		const getDockerUpdateStatus = vi.fn().mockResolvedValueOnce(reply(dockerIdle)).mockResolvedValue(reply(running))
		const w = await openDocker({ getSystemPackages, getDockerUpdateStatus, startDockerUpdate: () => Promise.reject(refused(409, 'running', 'a Docker update is running')) })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(w.find('.docker-job').text()).toContain('Updating Docker... apps are restarting')
		expect(w.text()).not.toContain('An update is already running on this machine.')
		expect(w.find('footer').exists()).toBe(false)
		// apt is busy: no new check
		expect(getSystemPackages).toHaveBeenCalledTimes(1)
	})

	it('keeps a host that cannot do it as it is: the sentence, no new check', async () => {
		const getSystemPackages = vi.fn(dockerPackages())
		const w = await openDocker({ getSystemPackages, startDockerUpdate: () => Promise.reject(refused(501, 'unsupported', 'apt-get was not found on this host.')) })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(w.text()).toContain('This machine cannot update Docker from here.')
		expect(w.text()).toContain('apt-get was not found on this host.')
		expect(getSystemPackages).toHaveBeenCalledTimes(1)
	})

	it('says it could not start when the core did not answer at all', async () => {
		const w = await openDocker({ startDockerUpdate: () => Promise.reject(new Error('Network Error')) })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(w.text()).toContain('Could not start the Docker update.')
		expect(w.text()).not.toContain('Network Error')
		expect(w.find('.docker-confirm').exists()).toBe(false)
		expect(w.find('footer').exists()).toBe(true)
	})

	it('asks the core what became of the update before it says it did not start, when the answer was lost on the way', async () => {
		vi.useFakeTimers()
		try {
			const timeout = Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' })
			const getDockerUpdateStatus = vi.fn().mockResolvedValueOnce(reply(dockerIdle)).mockResolvedValue(reply(running))
			const w = await openDocker({ startDockerUpdate: () => Promise.reject(timeout), getDockerUpdateStatus })
			await openConfirmation(w)

			await w.find('.docker-confirm-button').trigger('click')
			await flushPromises()

			expect(w.text()).not.toContain('Could not start the Docker update.')
			expect(w.find('.docker-job').text()).toContain('Updating Docker... apps are restarting')
			expect(w.find('footer').exists()).toBe(false)
			expect(w.find('.docker-update-button').exists()).toBe(false)
			// and it goes on following it
			const reads = getDockerUpdateStatus.mock.calls.length
			await vi.advanceTimersByTimeAsync(2000)
			expect(getDockerUpdateStatus.mock.calls.length).toBeGreaterThan(reads)
		} finally {
			vi.useRealTimers()
		}
	})

	it('says it could not start when the core shows no run after a lost answer, or cannot be asked', async () => {
		for (const status of [answer(dockerIdle), answer(succeeded), () => Promise.reject(new Error('Network Error'))]) {
			const getDockerUpdateStatus = vi.fn().mockResolvedValueOnce(reply(dockerIdle)).mockImplementation(status)
			const w = await openDocker({ startDockerUpdate: () => Promise.reject(new Error('timeout of 60000ms exceeded')), getDockerUpdateStatus })
			await openConfirmation(w)

			await w.find('.docker-confirm-button').trigger('click')
			await flushPromises()

			expect(w.text()).toContain('Could not start the Docker update.')
			expect(w.find('.docker-update-button').exists()).toBe(true)
			expect(w.vm.dockerRunning).toBe(false)
			w.unmount()
		}
	})

	it('does not ask for the status after a refusal: the core answered', async () => {
		const getDockerUpdateStatus = vi.fn(answer(dockerIdle))
		const w = await openDocker({ startDockerUpdate: () => Promise.reject(refused(409, 'changed', 'a newer version appeared')), getDockerUpdateStatus })
		await openConfirmation(w)

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(getDockerUpdateStatus).toHaveBeenCalledTimes(1)
	})

	it('reads the status again on "Check for updates" when the first read failed, and shows the run it finds', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = vi.fn().mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue(reply(running))
			const getSystemPackages = vi.fn(dockerPackages())
			const w = await openDocker({ getDockerUpdateStatus, getSystemPackages })
			expect(w.find('.docker-job').exists()).toBe(false)
			expect(getSystemPackages).toHaveBeenCalledTimes(1)

			await w.findAll('footer button')[0].trigger('click')
			await flushPromises()

			expect(w.find('.docker-job').text()).toContain('Updating Docker... apps are restarting')
			expect(w.find('footer').exists()).toBe(false)
			// apt is busy with it: no check behind it
			expect(getSystemPackages).toHaveBeenCalledTimes(1)
			const reads = getDockerUpdateStatus.mock.calls.length
			await vi.advanceTimersByTimeAsync(2000)
			expect(getDockerUpdateStatus.mock.calls.length).toBeGreaterThan(reads)
		} finally {
			vi.useRealTimers()
		}
	})

	it('checks as usual on "Check for updates" when the first read of the status worked, or the core has no such route', async () => {
		const missing = Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } })
		for (const [first, reads] of [[answer(dockerIdle), 1], [() => Promise.reject(missing), 2]]) {
			const getDockerUpdateStatus = vi.fn(first)
			const getSystemPackages = vi.fn(dockerPackages())
			const w = await openDocker({ getDockerUpdateStatus, getSystemPackages })

			await w.findAll('footer button')[0].trigger('click')
			await flushPromises()

			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(reads)
			expect(getSystemPackages).toHaveBeenCalledTimes(2)
			w.unmount()
		}
	})
})

describe('following the Docker update', () => {
	// the first read is the one the window makes when it opens, the second the first poll
	const statuses = (...replies) => {
		const status = vi.fn()
		for (const next of replies) {
			status.mockImplementationOnce(next instanceof Error ? () => Promise.reject(next) : () => Promise.resolve(reply(next)))
		}
		return status
	}
	const down = new Error('Network Error')

	it('goes on after errors, says the connection is lost until it comes back, and stops at the end', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = statuses(running, running, down, down, running, succeeded)
			getDockerUpdateStatus.mockResolvedValue(reply(succeeded))
			const getSystemPackages = vi.fn(dockerPackages())
			const w = await openDocker({ getDockerUpdateStatus, getSystemPackages })
			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(2)
			expect(w.text()).not.toContain('Connection lost, retrying...')

			await vi.advanceTimersByTimeAsync(2000)
			expect(w.text()).toContain('Connection lost, retrying...')
			expect(w.text()).toContain('Updating Docker... apps are restarting')
			await vi.advanceTimersByTimeAsync(2000)
			expect(w.text()).toContain('Connection lost, retrying...')
			await vi.advanceTimersByTimeAsync(2000)
			expect(w.text()).not.toContain('Connection lost, retrying...')
			expect(w.text()).toContain('Updating Docker... apps are restarting')
			expect(getSystemPackages).not.toHaveBeenCalled()

			await vi.advanceTimersByTimeAsync(2000)
			expect(w.text()).toContain('Docker was updated to 29.8.0.')
			expect(w.text()).not.toContain('Updating Docker... apps are restarting')
			// the packages are checked again by themselves, so the new version shows
			expect(getSystemPackages).toHaveBeenCalledTimes(1)
			expect(w.vm.info.docker).toBeTruthy()

			const reads = getDockerUpdateStatus.mock.calls.length
			await vi.advanceTimersByTimeAsync(30000)
			expect(getDockerUpdateStatus.mock.calls.length).toBe(reads)
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('asks for the status one at a time: a request that does not answer is not stacked on', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = statuses(running)
			getDockerUpdateStatus.mockImplementation(() => new Promise(() => {}))
			const w = await openDocker({ getDockerUpdateStatus })
			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(2)

			w.vm.startDockerPolling()
			w.vm.startDockerPolling()
			await vi.advanceTimersByTimeAsync(60000)

			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(2)
		} finally {
			vi.useRealTimers()
		}
	})

	it('calls the status unknown after ten minutes without an answer, and stops asking', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = statuses(running, running)
			getDockerUpdateStatus.mockRejectedValue(down)
			const w = await openDocker({ getDockerUpdateStatus })

			await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
			expect(w.text()).toContain('Connection lost, retrying...')
			expect(w.text()).not.toContain('Status unknown, reopen this window.')

			await vi.advanceTimersByTimeAsync(63 * 1000)
			expect(w.text()).toContain('Status unknown, reopen this window.')
			expect(w.text()).not.toContain('Connection lost, retrying...')
			const reads = getDockerUpdateStatus.mock.calls.length
			await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
			expect(getDockerUpdateStatus.mock.calls.length).toBe(reads)
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('starts the ten minutes again from the last answer, not from the first failure of the run', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = statuses(running, running, down)
			// it answers once after eight minutes of silence, then is silent again
			let silent = true
			getDockerUpdateStatus.mockImplementation(() => (silent ? Promise.reject(down) : Promise.resolve(reply(running))))
			const w = await openDocker({ getDockerUpdateStatus })
			await vi.advanceTimersByTimeAsync(8 * 60 * 1000)
			silent = false
			await vi.advanceTimersByTimeAsync(2000)
			expect(w.text()).not.toContain('Connection lost, retrying...')
			silent = true

			await vi.advanceTimersByTimeAsync(9 * 60 * 1000)

			expect(w.text()).not.toContain('Status unknown, reopen this window.')
			expect(w.text()).toContain('Connection lost, retrying...')
		} finally {
			vi.useRealTimers()
		}
	})

	it('stops its timer when the window closes, and ignores an answer that arrives after', async () => {
		vi.useFakeTimers()
		try {
			let late
			const getDockerUpdateStatus = statuses(running)
			getDockerUpdateStatus.mockImplementationOnce(() => Promise.resolve(reply(running)))
			getDockerUpdateStatus.mockImplementationOnce(() => new Promise((resolve) => {
				late = resolve
			}))
			const w = await openDocker({ getDockerUpdateStatus })
			await vi.advanceTimersByTimeAsync(2000)
			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(3)

			w.unmount()
			late(reply(running))
			await vi.advanceTimersByTimeAsync(60000)

			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(3)
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('stops at once when the window closes between two polls', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = vi.fn(() => Promise.resolve(reply(running)))
			const w = await openDocker({ getDockerUpdateStatus })
			expect(vi.getTimerCount()).toBeGreaterThan(0)

			w.unmount()

			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('shows a run that is being finished, and goes on', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = vi.fn(() => Promise.resolve(reply(dockerRun({ state: 'finalizing' }))))
			const w = await openDocker({ getDockerUpdateStatus })

			expect(w.find('.docker-job').text()).toContain('Finishing the Docker update...')
			expect(w.find('footer').exists()).toBe(false)
			await vi.advanceTimersByTimeAsync(2000)
			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(3)
		} finally {
			vi.useRealTimers()
		}
	})

	it('shows the versions once the core knows both', async () => {
		const w = await openDocker({ getDockerUpdateStatus: answer(dockerRun({ state: 'running', from: '28.0.4', to: '29.8.0' })) })

		expect(w.find('.docker-job').text()).toContain('28.0.4 → 29.8.0')
	})

	it('resumes a run that was going when the window was closed, without checking the packages behind it', async () => {
		const getSystemPackages = vi.fn(dockerPackages())
		const w = await openDocker({ getDockerUpdateStatus: vi.fn(answer(running)), getSystemPackages })

		expect(w.find('.docker-job').text()).toContain('Updating Docker... apps are restarting')
		expect(w.find('footer').exists()).toBe(false)
		expect(getSystemPackages).not.toHaveBeenCalled()
		expect(w.text()).not.toContain('No system package updates are available.')
	})

	it('shows the last result when the window opens after a run, and checks the packages as usual', async () => {
		const getSystemPackages = vi.fn(dockerPackages())
		const w = await openDocker({ getDockerUpdateStatus: answer(succeeded), getSystemPackages })

		expect(w.find('.docker-job').text()).toContain('Docker was updated to 29.8.0.')
		expect(getSystemPackages).toHaveBeenCalledTimes(1)
		expect(w.find('footer').exists()).toBe(true)
	})

	it('reads an older core that has no such route as nothing to show', async () => {
		const missing = Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } })
		const w = await openDocker({ getDockerUpdateStatus: () => Promise.reject(missing) })

		expect(w.find('.docker-job').exists()).toBe(false)
		expect(w.find('.docker-line').exists()).toBe(true)
	})
})

describe('what the Docker update ended with', () => {
	const ended = extra => openDocker({ getDockerUpdateStatus: answer({ ...succeeded, ...extra }) })

	it('lists the containers that did not come back, with their policy, and what to do about each kind', async () => {
		const w = await ended({ not_returned: [{ name: 'cron', restart_policy: 'no' }, { name: 'slow', restart_policy: 'always' }, { name: 'old', restart_policy: '' }] })

		const job = w.find('.docker-job')
		expect(job.text()).toContain('3 containers did not come back.')
		expect(job.findAll('.docker-not-returned tbody tr').map(row => row.findAll('td').map(cell => cell.text()))).toEqual([['cron', 'no'], ['slow', 'always'], ['old', 'no']])
		expect(job.text()).toContain('A container with no restart policy never starts again by itself: start it from the dashboard.')
		expect(job.text()).toContain('A container with a restart policy was not running yet when the update ended. Give it a moment, then check it from the dashboard.')
	})

	it('says one container, and gives only the hint that fits it', async () => {
		const none = await ended({ not_returned: [{ name: 'cron', restart_policy: 'no' }] })
		expect(none.find('.docker-job').text()).toContain('One container did not come back.')
		expect(none.find('.docker-job').text()).toContain('never starts again by itself')
		expect(none.find('.docker-job').text()).not.toContain('was not running yet')
		none.unmount()

		const slow = await ended({ not_returned: [{ name: 'slow', restart_policy: 'unless-stopped' }] })
		expect(slow.find('.docker-job').text()).toContain('was not running yet')
		expect(slow.find('.docker-job').text()).not.toContain('never starts again by itself')
	})

	it('shows a name as text and does not show a list when all came back', async () => {
		const evil = '<img src=x onerror=1>'
		const w = await ended({ not_returned: [{ name: evil, restart_policy: 'no' }] })
		expect(w.find('.docker-not-returned td').text()).toBe(evil)
		expect(w.find('.docker-job img').exists()).toBe(false)
		w.unmount()

		const clean = await ended({ not_returned: [] })
		expect(clean.find('.docker-not-returned').exists()).toBe(false)
	})

	it('shows when it finished and no log of a clean run', async () => {
		const w = await ended({ log: 'Setting up docker-ce' })

		expect(w.find('.docker-job').text()).toContain('Finished')
		expect(w.find('.docker-job .package-log').exists()).toBe(false)
	})

	it('asks for a restart of Docker, with the command, when the old one is still running', async () => {
		const w = await ended({ outcome: 'restart_pending', log: 'policy-rc.d denied dockerd', not_returned: [] })

		const job = w.find('.docker-job')
		expect(job.text()).toContain('Docker is updated, but the old version is still running. Restart it to finish the update.')
		expect(job.text()).toContain('Restarting Docker stops every container until it is back.')
		expect(job.find('pre.docker-command').text()).toBe('sudo systemctl restart docker')
		expect(job.text()).not.toContain('Docker was updated to')
		expect(job.find('.package-log').text()).toBe('policy-rc.d denied dockerd')
	})

	it.each([
		['guard', 'The last check before the update failed, so nothing was changed.', false],
		['plan', 'The update would have gone beyond Docker\'s own packages and the few new ones they need, so it was stopped before anything changed.', false],
		['download', 'The new packages could not be downloaded, so nothing was changed. Check the internet connection and the free disk space, then try again.', false],
		['install', 'The new packages could not be installed. Docker may be half updated: read the log below.', true],
		['daemon', 'The new packages were installed, but Docker did not start again, so every container is stopped. Read the log below.', true],
		['no_result', 'The update stopped without reporting a result. Read the log below and check Docker before trying again.', true],
	])('failed with "%s": this sentence, the log, and the way back only if something may have changed', async (code, sentence, wayBack) => {
		const command = 'sudo apt-get install --allow-downgrades docker-ce=5:28.0.4-1~debian.11~bullseye containerd.io=1.7.27-1'
		const w = await ended({ state: 'failed', outcome: 'failed', error: 'english words', error_code: code, exit_code: 1, rollback_command: command, log: 'E: something broke' })

		const job = w.find('.docker-job')
		expect(job.text()).toContain('The Docker update failed.')
		expect(job.text()).toContain(sentence)
		expect(job.text()).not.toContain('english words')
		expect(job.find('.package-log').text()).toBe('E: something broke')
		expect(job.find('pre.docker-command').exists()).toBe(wayBack)
		if (wayBack) {
			expect(job.find('pre.docker-command').text()).toBe(command)
			expect(job.text()).toContain('This has not been tested after a major version change.')
		} else {
			expect(job.text()).not.toContain('This has not been tested after a major version change.')
		}
	})

	it('gives the core\'s words when it fails with a code the window does not know', async () => {
		const w = await ended({ state: 'failed', outcome: 'failed', error: 'something new went wrong', error_code: 'brand-new' })

		expect(w.find('.docker-job').text()).toContain('The Docker update failed.')
		expect(w.find('.docker-job').text()).toContain('something new went wrong')
	})

	it('can be dismissed, and the Docker line is there again', async () => {
		const w = await ended({ state: 'failed', outcome: 'failed', error_code: 'download' })

		await w.find('.docker-job button').trigger('click')

		expect(w.find('.docker-job').exists()).toBe(false)
		expect(w.find('.docker-update-button').exists()).toBe(true)
	})
})

describe('moving from one view of the Docker update to the next', () => {
	const bodyOf = w => w.find('.modal-card-body').element
	const focused = w => document.activeElement === w.find('.docker-job .docker-title').element

	it('opens the confirmation at its top, with the focus on its heading, even when the window was scrolled to the button', async () => {
		const w = await openDocker()
		bodyOf(w).scrollTop = 118

		await openConfirmation(w)

		expect(bodyOf(w).scrollTop).toBe(0)
		expect(document.activeElement).toBe(w.find('.docker-confirm .docker-title').element)
		expect(w.find('.docker-confirm .docker-title').attributes('tabindex')).toBe('-1')
	})

	it('keeps the scroll offset on Cancel and gives the focus back to the button that opened the confirmation', async () => {
		const w = await openDocker()
		await openConfirmation(w)
		bodyOf(w).scrollTop = 118

		await w.findAll('footer button')[0].trigger('click')
		await flushPromises()

		expect(bodyOf(w).scrollTop).toBe(118)
		expect(document.activeElement).toBe(w.find('.docker-update-button').element)
	})

	it('puts the focus on the heading of the run when it starts', async () => {
		const w = await openDocker({ startDockerUpdate: answer(dockerRun({ state: 'running' })), getDockerUpdateStatus: vi.fn().mockResolvedValueOnce(reply(dockerIdle)).mockResolvedValue(reply(running)) })
		await openConfirmation(w)
		bodyOf(w).scrollTop = 40

		await w.find('.docker-confirm-button').trigger('click')
		await flushPromises()

		expect(focused(w)).toBe(true)
		expect(bodyOf(w).scrollTop).toBe(0)
		expect(w.find('.docker-job .docker-title').attributes('tabindex')).toBe('-1')
	})

	it('keeps the log out of every live region, so a growing log is not read again and again', async () => {
		const w = await openDocker({ getDockerUpdateStatus: answer({ ...running, log: 'Get:1 https://download.docker.com bullseye/stable docker-ce' }) })

		expect(w.find('.docker-job .package-log').text()).toContain('Get:1')
		expect(w.find('.docker-job').attributes('role')).toBeUndefined()
		expect(w.find('.package-log').element.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull()
	})

	it('has one live region from the start, which says the run, its trouble and its end', async () => {
		vi.useFakeTimers()
		try {
			const getDockerUpdateStatus = vi.fn()
				.mockResolvedValueOnce(reply(dockerIdle))
				.mockResolvedValueOnce(reply(running))
				.mockRejectedValueOnce(new Error('Network Error'))
				.mockResolvedValue(reply(dockerRun({ ...succeeded, log: 'Setting up docker-ce' })))
			const startDockerUpdate = answer(dockerRun({ state: 'running' }))
			const w = await openDocker({ getDockerUpdateStatus, startDockerUpdate })
			const live = () => w.find('[role="status"]')
			expect(live().exists()).toBe(true)
			expect(live().text()).toBe('')

			await openConfirmation(w)
			await w.find('.docker-confirm-button').trigger('click')
			await flushPromises()
			expect(w.findAll('[role="status"]').length).toBe(1)
			expect(live().text()).toContain('Updating Docker... apps are restarting')

			await vi.advanceTimersByTimeAsync(2000)
			expect(live().text()).toContain('Connection lost, retrying...')

			await vi.advanceTimersByTimeAsync(2000)
			expect(live().text()).toBe('Docker was updated to 29.8.0.')
			expect(live().text()).not.toContain('Setting up docker-ce')
		} finally {
			vi.useRealTimers()
		}
	})

	it('says a failure in the live region, with what it means', async () => {
		const w = await openDocker({ getDockerUpdateStatus: answer(dockerRun({ ...succeeded, state: 'failed', outcome: 'failed', error_code: 'download' })) })

		expect(w.find('[role="status"]').text()).toContain('The Docker update failed.')
		expect(w.find('[role="status"]').text()).toContain('The new packages could not be downloaded')
	})
})

describe('a window that has been closed', () => {
	it('does not follow a run whose answer arrives after it closed, and checks nothing', async () => {
		vi.useFakeTimers()
		try {
			let started
			const startDockerUpdate = vi.fn(() => new Promise((resolve) => {
				started = resolve
			}))
			const getDockerUpdateStatus = vi.fn().mockResolvedValueOnce(reply(dockerIdle)).mockResolvedValue(reply(succeeded))
			const getSystemPackages = vi.fn(dockerPackages())
			const w = await openDocker({ startDockerUpdate, getDockerUpdateStatus, getSystemPackages })
			await openConfirmation(w)
			await w.find('.docker-confirm-button').trigger('click')
			const reads = getDockerUpdateStatus.mock.calls.length
			const checks = getSystemPackages.mock.calls.length

			w.unmount()
			started(reply(dockerRun({ state: 'running' })))
			await vi.advanceTimersByTimeAsync(30000)

			expect(getDockerUpdateStatus.mock.calls.length).toBe(reads)
			expect(getSystemPackages.mock.calls.length).toBe(checks)
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('does not follow, or check, after the first read of the status answers late', async () => {
		vi.useFakeTimers()
		try {
			let answered
			const getDockerUpdateStatus = vi.fn(() => new Promise((resolve) => {
				answered = resolve
			}))
			const getSystemPackages = vi.fn(dockerPackages())
			const w = await openDocker({ getDockerUpdateStatus, getSystemPackages })
			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(1)

			w.unmount()
			answered(reply(running))
			await vi.advanceTimersByTimeAsync(30000)

			expect(getDockerUpdateStatus).toHaveBeenCalledTimes(1)
			expect(getSystemPackages).not.toHaveBeenCalled()
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('does not follow the other update either when its status answers late', async () => {
		vi.useFakeTimers()
		try {
			let answered
			const getSystemPackageUpdateStatus = vi.fn(() => new Promise((resolve) => {
				answered = resolve
			}))
			const getDockerUpdateStatus = vi.fn(answer(dockerIdle))
			const w = await openDocker({ getSystemPackageUpdateStatus, getDockerUpdateStatus })

			w.unmount()
			answered(reply({ ...idle, state: 'running' }))
			await vi.advanceTimersByTimeAsync(30000)

			expect(getSystemPackageUpdateStatus).toHaveBeenCalledTimes(1)
			expect(getDockerUpdateStatus).not.toHaveBeenCalled()
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('does not check the packages when a refusal answers after it closed', async () => {
		let refuse
		const startDockerUpdate = vi.fn(() => new Promise((resolve, reject) => {
			refuse = reject
		}))
		const getSystemPackages = vi.fn(dockerPackages())
		const w = await openDocker({ startDockerUpdate, getSystemPackages })
		await openConfirmation(w)
		await w.find('.docker-confirm-button').trigger('click')

		w.unmount()
		refuse(refused(409, 'changed', 'a newer version appeared'))
		await flushPromises()

		expect(getSystemPackages).toHaveBeenCalledTimes(1)
	})
})

describe('the two updates do not run together', () => {
	it('takes the generic update away while Docker runs, and refuses it if it is asked anyway', async () => {
		const confirm = vi.fn()
		const startSystemPackageUpdate = vi.fn(answer({ ...idle, state: 'running' }))
		const w = await openDocker({ getDockerUpdateStatus: answer(running), startSystemPackageUpdate }, { $buefy: { dialog: { confirm } } })

		expect(w.text()).not.toContain('Update packages')
		w.vm.confirmUpdate()
		await w.vm.startUpdate()

		expect(confirm).not.toHaveBeenCalled()
		expect(startSystemPackageUpdate).not.toHaveBeenCalled()
	})

	it('disables the Docker button while the generic update runs, and refuses Docker if it is asked anyway', async () => {
		const startDockerUpdate = vi.fn()
		const w = await openDocker({
			startDockerUpdate,
			startSystemPackageUpdate: answer({ ...idle, state: 'running' }),
			getSystemPackageUpdateStatus: vi.fn().mockResolvedValueOnce(reply(idle)).mockResolvedValue(reply({ ...idle, state: 'running' })),
		})
		expect(w.find('.docker-update-button').attributes('disabled')).toBeUndefined()
		await openConfirmation(w)
		await w.findAll('footer button')[0].trigger('click')

		await w.vm.startUpdate()
		await flushPromises()

		expect(w.vm.isRunning).toBe(true)
		expect(w.find('.docker-update-button').attributes('disabled')).toBeDefined()
		w.vm.openDockerConfirm()
		expect(w.vm.dockerConfirming).toBe(false)
		w.vm.dockerPlan = { plan_id: planId }
		await w.vm.startDockerUpdate()
		expect(startDockerUpdate).not.toHaveBeenCalled()
	})
})

describe('the Docker update\'s words', () => {
	it.each([
		'Update Docker',
		'Update Docker to {version}',
		'Docker update',
		'This is a new major version of Docker, from {from} to {to}. Apps that talk to Docker directly may need an update of their own, and not every setup has been tested with it.',
		'Running containers',
		'Listing the running containers...',
		'The running containers could not be listed. You can still update.',
		'No container is running.',
		'One running container will not start again by itself.',
		'{n} running containers will not start again by themselves.',
		'Containers that publish port 53, 80 or 443, or use the host network: {names}. That may be this machine\'s DNS or web server, and it will be down while Docker restarts.',
		'Stays stopped',
		'Finishing the Docker update...',
		'Updating Docker... apps are restarting',
		'Status unknown, reopen this window.',
		'Connection lost, retrying...',
		'Docker is updated, but the old version is still running. Restart it to finish the update.',
		'Restarting Docker stops every container until it is back.',
		'Command to restart Docker',
		'Docker was updated to {version}.',
		'Docker was updated.',
		'The Docker update failed.',
		'To put the previous version back, run this in a terminal on this machine.',
		'Command to put the previous Docker version back',
		'This has not been tested after a major version change.',
		'One container did not come back.',
		'{n} containers did not come back.',
		'A container with no restart policy never starts again by itself: start it from the dashboard.',
		'A container with a restart policy was not running yet when the update ended. Give it a moment, then check it from the dashboard.',
		'Finished {date}',
		'Dismiss',
		'Could not start the Docker update.',
		'New package',
		'This Docker version also needs a package that is not installed yet: {names}.',
		'This Docker version also needs these packages that are not installed yet: {names}.',
		'Blocked by: {names}.',
		'The update would go beyond Docker\'s own packages and the few new ones they need, or could not be planned, so ReCasaOS will not run it.',
		'The update would have gone beyond Docker\'s own packages and the few new ones they need, so it was stopped before anything changed.',
	])('says "%s" in English and French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		// French sets a space before : ; ? ! (\s covers the no-break spaces too)
		expect(fr[key]).not.toMatch(/\S[:;?!]/)
		for (const param of key.match(/\{\w+\}/g) || [])
			expect(fr[key]).toContain(param)
	})

	// the refusals and the failures are looked up by code: a sentence added to a table without its
	// translation would show in English only, and nothing else would notice
	it('has both languages for every sentence of the refusal and failure tables, and every direct $t of the file', () => {
		const tables = source.slice(source.indexOf('const DOCKER_REFUSALS'), source.indexOf('// a failure that stops before'))
		const sentences = [...tables.matchAll(/^\t\w+: '((?:[^'\\]|\\.)*)',\r?$/gm)].map(match => match[1])
		const direct = [...source.matchAll(/\$t\(\s*'((?:[^'\\]|\\.)*)'/g)].map(match => match[1])
		expect(sentences.length).toBeGreaterThanOrEqual(20)
		for (const raw of [...sentences, ...direct]) {
			const key = raw.replace(/\\'/g, '\'')
			expect(en[key], key).toBeTruthy()
			expect(fr[key], key).toBeTruthy()
			// a word that is the same in both languages ("Docker") has nothing to translate
			if (/\s/.test(key))
				expect(fr[key], key).not.toBe(key)
			for (const param of key.match(/\{\w+\}/g) || [])
				expect(fr[key], key).toContain(param)
		}
	})
})
