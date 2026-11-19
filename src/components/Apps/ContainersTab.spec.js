// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ContainersTab from './ContainersTab.vue'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; an empty table makes $t return its key.
// A key with a value to fill is listed: a missing key comes back unfilled.
vi.mock('@/assets/lang', () => ({
	default: {
		en_us: Object.fromEntries([
			'Every {interval} s, {timeout} s allowed per run. Failed runs in a row before it is unhealthy: {retries}.',
			'Failed runs in the first {start} s do not count.',
			'failed ({code})',
		].map(key => [key, key])),
	},
}))

const DATA = {
	main: 'jellyfin',
	containers: {
		jellyfin: [{
			ID: 'j1',
			Name: 'media-jellyfin-1',
			Image: 'jellyfin/jellyfin:10.9',
			State: 'running',
			Status: 'Up 2 minutes (healthy)',
			Health: 'healthy',
			ExitCode: 0,
			Publishers: [{ URL: '0.0.0.0', TargetPort: 8096, PublishedPort: 8096, Protocol: 'tcp' }],
		}],
		backup: [{
			ID: 'b1',
			Name: 'media-backup-1',
			Image: 'alpine',
			State: 'exited',
			Status: 'Exited (137) 5 minutes ago',
			Health: '',
			ExitCode: 137,
			Publishers: [],
		}],
		worker: [
			{ ID: 'w1', Name: 'media-worker-1', Image: 'worker:1', State: 'running', Status: 'Up 3 hours', Health: '', ExitCode: 0, Publishers: [] },
			{ ID: 'w2', Name: 'media-worker-2', Image: 'worker:1', State: 'running', Status: 'Up 3 hours', Health: '', ExitCode: 0, Publishers: [] },
		],
		idle: [],
	},
}

const HEALTH = {
	status: 'healthy',
	failing_streak: 0,
	command: 'curl -f http://localhost:8096/health',
	interval: 30,
	timeout: 5,
	retries: 3,
	start_period: 0,
	checks: [
		{ started_at: '2026-11-19T18:40:37Z', exit_code: 1, output: 'connection refused' },
		{ started_at: '2026-11-19T18:40:07Z', exit_code: 0, output: '' },
	],
}

async function setup(response = { data: { data: DATA } }, overrides = {}) {
	const composeAppContainers = vi.fn().mockResolvedValue(response)
	const setContainerStatus = overrides.setContainerStatus || vi.fn().mockResolvedValue({})
	const getContainerStats = overrides.getContainerStats || vi.fn().mockResolvedValue({ data: { data: [] } })
	const getContainerHealth = overrides.getContainerHealth || vi.fn().mockResolvedValue({ data: { data: HEALTH } })
	const toast = overrides.toast
	const wrapper = mount(ContainersTab, {
		props: { appId: 'jellyfin', ...(overrides.props || {}) },
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				$openAPI: { appManagement: { compose: { composeAppContainers } } },
				$api: { container: { setContainerStatus, getContainerStats, getContainerHealth } },
				...(toast ? { $buefy: { toast: { open: toast } } } : {}),
			},
		},
	})
	await flushPromises()
	return { wrapper, composeAppContainers, setContainerStatus, getContainerStats, getContainerHealth }
}

describe('containersTab', () => {
	it('shows one row per container, the main service first, with its state and ports', async () => {
		const { wrapper, composeAppContainers } = await setup()
		expect(composeAppContainers).toHaveBeenCalledWith('jellyfin')

		const rows = wrapper.findAll('tbody tr')
		// jellyfin, backup, idle, and BOTH workers -- five containers, four services.
		expect(rows).toHaveLength(5)
		expect(rows[0].text()).toContain('jellyfin')
		expect(rows[0].text()).toContain('Running')
		expect(rows[0].text()).toContain('8096 -> 8096/tcp')
		expect(rows[0].text()).toContain('2 minutes')
		expect(rows[1].text()).toContain('Stopped')
		expect(rows[1].text()).toContain('137')
		wrapper.unmount()
	})

	it('names the containers of a scaled service, and only those', async () => {
		const { wrapper } = await setup()
		const rows = wrapper.findAll('tbody tr')

		expect(rows[3].text()).toContain('media-worker-1')
		expect(rows[4].text()).toContain('media-worker-2')
		// The name would be noise on the services that have exactly one container,
		// which is nearly every row.
		expect(rows[0].text()).not.toContain('media-jellyfin-1')
		wrapper.unmount()
	})

	it('shows a service Docker runs nothing for, with nothing to open on it', async () => {
		const { wrapper } = await setup()
		const idle = wrapper.findAll('tbody tr')[2]

		expect(idle.text()).toContain('idle')
		expect(idle.text()).toContain('No container')
		idle.findAll('button').forEach(button => expect(button.attributes('disabled')).toBeDefined())
		wrapper.unmount()
	})

	it('asks for the logs of the container that was clicked, and for its terminal', async () => {
		const { wrapper } = await setup()
		// by name, not by position: the row grew start/stop/restart buttons in front
		// of these two, and an index would have moved with them
		const row = wrapper.findAll('tbody tr')[4]

		await row.find('[data-action="logs"]').trigger('click')
		await row.find('[data-action="terminal"]').trigger('click')
		// The second replica: naming the service alone would have opened the first one.
		expect(wrapper.emitted('open')).toEqual([
			[{ service: 'worker', containerId: 'w2', tab: 'logs' }],
			[{ service: 'worker', containerId: 'w2', tab: 'terminal' }],
		])
		wrapper.unmount()
	})

	it('offers no terminal on a service that is not running', async () => {
		const { wrapper } = await setup()
		const stopped = wrapper.findAll('tbody tr')[1]

		expect(stopped.find('[data-action="logs"]').attributes('disabled')).toBeUndefined()
		expect(stopped.find('[data-action="terminal"]').attributes('disabled')).toBeDefined()
		wrapper.unmount()
	})

	it('acts on one container rather than on the whole stack', async () => {
		const { wrapper, composeAppContainers, setContainerStatus } = await setup()

		await wrapper.findAll('tbody tr')[0].find('[data-action="restart"]').trigger('click')
		await flushPromises()

		// the container's own id, not the service name: a scaled service holds several
		expect(setContainerStatus).toHaveBeenCalledWith('jellyfin', 'j1', 'restart')
		// and the row has to show what happened, so the tab re-reads instead of guessing
		expect(composeAppContainers).toHaveBeenCalledTimes(2)
		wrapper.unmount()
	})

	it('offers stop to a running container and start to a stopped one', async () => {
		const { wrapper } = await setup()
		const rows = wrapper.findAll('tbody tr')

		expect(rows[0].find('[data-action="stop"]').exists()).toBe(true)
		expect(rows[0].find('[data-action="start"]').exists()).toBe(false)
		expect(rows[1].find('[data-action="start"]').exists()).toBe(true)
		expect(rows[1].find('[data-action="stop"]').exists()).toBe(false)
		// a service Docker runs no container for has nothing to act on
		expect(rows[2].find('[data-action="restart"]').exists()).toBe(false)
		wrapper.unmount()
	})

	it('says why an action failed rather than leaving the row unchanged and silent', async () => {
		const toast = vi.fn()
		const setContainerStatus = vi.fn().mockRejectedValue({ response: { data: { message: 'container is being removed' } } })
		const { wrapper } = await setup(undefined, { setContainerStatus, toast })

		await wrapper.findAll('tbody tr')[0].find('[data-action="stop"]').trigger('click')
		await flushPromises()

		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'container is being removed' }))
		wrapper.unmount()
	})

	it('shows what a container is using, and nothing for one the daemon could not sample', async () => {
		const getContainerStats = vi.fn().mockResolvedValue({
			data: {
				data: [{ container_id: 'j1', service: 'jellyfin', cpu_percent: 212.34, memory_used: 268435456, memory_limit: 8589934592 }],
			},
		})
		const { wrapper } = await setup(undefined, { getContainerStats })
		await flushPromises()
		const rows = wrapper.findAll('tbody tr')

		// percent of ONE cpu, like docker stats: two whole cores reads over 100
		expect(rows[0].text()).toContain('212.3%')
		expect(rows[0].text()).toContain('256 MB / 8 GB')
		// `backup` is stopped, so it was never sampled -- and "not measured" is not
		// the same answer as "using nothing"
		expect(rows[1].text()).not.toContain('0.0%')
		wrapper.unmount()
	})

	it('stops sampling once the tab is gone', async () => {
		vi.useFakeTimers()
		try {
			const { wrapper, getContainerStats } = await setup()
			const before = getContainerStats.mock.calls.length

			wrapper.unmount()
			vi.advanceTimersByTime(60_000)

			// an interval outliving its component is how this dashboard once made
			// people log in twice
			expect(getContainerStats.mock.calls.length).toBe(before)
		} finally {
			vi.useRealTimers()
		}
	})

	it('says so when the containers could not be read, instead of showing an empty app', async () => {
		const composeAppContainers = vi.fn().mockRejectedValue({ response: { data: { message: 'compose app `x` not found' } } })
		const wrapper = mount(ContainersTab, {
			props: { appId: 'x' },
			global: {
				plugins: [Buefy, i18n],
				mocks: { $openAPI: { appManagement: { compose: { composeAppContainers } } } },
			},
		})
		await flushPromises()
		expect(wrapper.text()).toContain('compose app `x` not found')
		expect(wrapper.find('table').exists()).toBe(false)
		wrapper.unmount()
	})
	it('opens the health check behind a chip: its command, its timings and its last runs', async () => {
		const { wrapper, getContainerHealth } = await setup()
		expect(wrapper.find('[data-health-detail]').exists()).toBe(false)

		await wrapper.findAll('tbody tr')[0].find('[data-action="health"]').trigger('click')
		await flushPromises()

		expect(getContainerHealth).toHaveBeenCalledWith('jellyfin', 'j1')
		const detail = wrapper.find('[data-health-detail]')
		expect(detail.text()).toContain('curl -f http://localhost:8096/health')
		expect(detail.text()).toContain('Every 30 s, 5 s allowed per run. Failed runs in a row before it is unhealthy: 3.')
		// no start period, no sentence about one
		expect(detail.text()).not.toContain('do not count')
		expect(detail.text()).toContain('failed (1) — connection refused')
		expect(detail.text()).toContain('passed')

		// the chip closes what it opened
		await wrapper.findAll('tbody tr')[0].find('[data-action="health"]').trigger('click')
		expect(wrapper.find('[data-health-detail]').exists()).toBe(false)
		wrapper.unmount()
	})

	it('offers no health check to open on a container that has none', async () => {
		const { wrapper } = await setup()

		// only jellyfin declares one
		expect(wrapper.findAll('[data-action="health"]')).toHaveLength(1)
		wrapper.unmount()
	})

	it('shows no command line to an account the box sent none to', async () => {
		const getContainerHealth = vi.fn().mockResolvedValue({ data: { data: { ...HEALTH, command: '', start_period: 60 } } })
		const { wrapper } = await setup(undefined, { getContainerHealth })

		await wrapper.find('[data-action="health"]').trigger('click')
		await flushPromises()

		const detail = wrapper.find('[data-health-detail]')
		expect(detail.text()).not.toContain('Command')
		expect(detail.text()).toContain('Failed runs in the first 60 s do not count.')
		wrapper.unmount()
	})

	it('says why a health check could not be read', async () => {
		const getContainerHealth = vi.fn().mockRejectedValue({ response: { data: { message: 'compose app `jellyfin` has no container `j1`' } } })
		const { wrapper } = await setup(undefined, { getContainerHealth })

		await wrapper.find('[data-action="health"]').trigger('click')
		await flushPromises()

		expect(wrapper.find('[data-health-detail]').text()).toContain('has no container')
		wrapper.unmount()
	})

	it('sends to the Compose tab and to the logs from an open health check', async () => {
		const { wrapper } = await setup()
		await wrapper.find('[data-action="health"]').trigger('click')
		await flushPromises()

		await wrapper.find('[data-action="edit-check"]').trigger('click')
		await wrapper.find('[data-action="check-logs"]').trigger('click')

		expect(wrapper.emitted('compose')).toHaveLength(1)
		expect(wrapper.emitted('open')).toEqual([{ service: 'jellyfin', containerId: 'j1', tab: 'logs' }].map(e => [e]))
		wrapper.unmount()
	})

	it('offers no Compose tab for an app whose compose file is not edited here', async () => {
		const { wrapper } = await setup(undefined, { props: { canEditCompose: false } })
		await wrapper.find('[data-action="health"]').trigger('click')
		await flushPromises()

		expect(wrapper.find('[data-action="edit-check"]').exists()).toBe(false)
		expect(wrapper.find('[data-action="check-logs"]').exists()).toBe(true)
		wrapper.unmount()
	})
	it('closes an open health check when its container stops: the chip that closes it is gone', async () => {
		const { wrapper, composeAppContainers } = await setup()
		await wrapper.find('[data-action="health"]').trigger('click')
		await flushPromises()
		expect(wrapper.find('[data-health-detail]').exists()).toBe(true)

		const stopped = { ...DATA.containers.jellyfin[0], State: 'exited', Status: 'Exited (0) 1 second ago', Health: '' }
		composeAppContainers.mockResolvedValue({ data: { data: { ...DATA, containers: { ...DATA.containers, jellyfin: [stopped] } } } })
		await wrapper.vm.load()
		await flushPromises()

		expect(wrapper.find('[data-action="health"]').exists()).toBe(false)
		expect(wrapper.find('[data-health-detail]').exists()).toBe(false)
		wrapper.unmount()
	})
})
