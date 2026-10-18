import { api, instance } from './service.js'

const PREFIX = '/sys'

// The name of a module is a path element of the core's routes: only the core's own rule goes into an address.
const MODULE_NAME = /^[a-z][a-z0-9-]{0,31}$/
function moduleName(name) {
	if (typeof name !== 'string' || !MODULE_NAME.test(name))
		throw new Error('not the name of a module')
	return name
}

const sys = {

	// Get websocket port
	getSocketPort() {
		return api.get(`${PREFIX}/socket-port`)
	},

	// Check if need init
	guideCheck() {
		return api.get(`${PREFIX}/state`)
	},

	// check system version
	getVersion() {
		return api.get(`${PREFIX}/version`)
	},

	// Hardware Info
	hardwareInfo() {
		return api.get(`${PREFIX}/hardware`)
	},

	// get cpu info
	getCpuInfo() {
		return api.get(`${PREFIX}/cpu`)
	},

	// get disk info
	getDiskInfo() {
		return api.get(`${PREFIX}/disk`)
	},

	// get memory info
	getMemoryInfo() {
		return api.get(`${PREFIX}/mem`)
	},

	// get network info
	getNetworkInfo() {
		return api.get(`${PREFIX}/network`)
	},

	// get logs
	getLogs() {
		return api.get(`${PREFIX}/logs`)
	},

	// Get Debug Info
	getDebugInfo() {
		return api.get(`${PREFIX}/debug`)
	},

	// get system utilization
	getUtilization() {
		return api.get(`${PREFIX}/utilization`)
	},

	// proxy request
	getProxyRequestContent(url) {
		return api.get(`${PREFIX}/proxy?url=${url}`)
	},

	// get casaos server port
	getServerPort() {
		return api.get(`/gateway/port`)
	},

	// edit casaos server port
	editServerPort(data) {
		return api.put(`/gateway/port`, data)
	},

	// get usb status
	getUsbStatus() {
		return api.get(`/usb/usb-auto-mount`)
	},

	// Toggle usb auto-mount
	toggleUsbAutoMount(data) {
		return api.put(`/usb/usb-auto-mount`, data)
	},

	// update CasaOS
	updateCasaOS() {
		return api.post(`${PREFIX}/update`)
	},

	// Check for operating system package updates
	getSystemPackages() {
		return api.get(`${PREFIX}/packages`)
	},

	// Start operating system package updates
	startSystemPackageUpdate() {
		return api.post(`${PREFIX}/packages/update`)
	},

	// Get operating system package update status
	getSystemPackageUpdateStatus() {
		return api.get(`${PREFIX}/packages/update/status`)
	},

	// The containers running now, for the confirmation before a Docker update:
	// { running, containers: [{ name, image, restart_policy, host_network, ports: [{ port, protocol, host_port }] }] }.
	// Answers fast and never waits for apt.
	getDockerContainers() {
		return api.get(`${PREFIX}/docker/containers`)
	},

	// Update Docker's packages. data: { plan_id, allow_held? } from `docker.update` of getSystemPackages:
	// the core refuses (409, the code in data.error_code) when it is no longer the plan it computes.
	// `allow_held: true` is the person's word that the update may go ahead although Docker's packages
	// are on hold (`docker.update.held`); without it the core refuses a held plan with `held`.
	startDockerUpdate(data) {
		return api.post(`${PREFIX}/docker/update`, data)
	},

	// The Docker update's status, read from its log and its unit: it answers while Docker is down.
	getDockerUpdateStatus() {
		return api.get(`${PREFIX}/docker/update/status`)
	},

	// The operating system and the end of its security updates: { id, version_id, codename,
	// pretty_name, arch, known, variant?, support: { state, ends, precision,
	// extended: { name, ends, precision? }, source }, next: { id, version_id, codename,
	// pretty_name, state } }. `variant` (raspberrypi, armbian...) is a system that says
	// debian or ubuntu and is not: no support claim. Read-only: it reads
	// /etc/os-release and a dated table, with no apt and no network. A core older than the
	// feature answers 404.
	getOs() {
		return api.get(`${PREFIX}/os`)
	},

	// Whether this machine could be upgraded to the next release, and why not:
	// { checked_at, state, hop: { from, to }, counts, checks: [{ code, severity, title, detail,
	// data, action }], text }. `text` is the same report as plain text, for "Copy the report".
	// Read-only: no write, no apt update, no network. The core answers within 20 seconds, so
	// the call waits 30. A core older than the feature answers 404. Through the instance: api.get
	// takes its second argument as the query string, not as a request config.
	getOsReadiness() {
		return instance.get(`/v1${PREFIX}/os/readiness`, { timeout: 30000 })
	},

	// Starts the plan of the upgrade (what apt would do, with the machine unchanged): 202 with
	// { state: 'running', phase } when a job began, 200 with already_running when one runs, 409 with
	// data.error_code (not_root, hop_not_planned, identity_unsupported, busy, no_room) when none can.
	// Sends nothing, and answers at once. The token goes in the Authorization header, which the
	// instance sets. A core older than the feature answers 404.
	startOsPlan() {
		return instance.post(`/v1${PREFIX}/os/upgrade/plan`, undefined, { timeout: 15000 })
	},

	// How the plan is going, or how it went: { plannable, reason?, state: idle|running|done|failed,
	// phase, started_at, finished_at, expires_at, expired?, error?: { code, phase, detail, data },
	// plan? }. It runs no apt and answers in milliseconds, but asks who the machine is, which the core
	// bounds at 30 seconds.
	getOsPlan() {
		return instance.get(`/v1${PREFIX}/os/upgrade/plan`, { timeout: 30000 })
	},

	// The text with which to do the hop by hand, written from the plan that is there:
	// { plan_id, hop, text, blocks: [{ id, title, reboot, point_of_no_return }] }, or 409 with
	// data.error_code no_plan (data.data.reason) or no_runbook. It holds the lines of the machine's
	// package sources as the files have them, so the token goes in the Authorization header.
	getOsRunbook() {
		return instance.get(`/v1${PREFIX}/os/upgrade/runbook`, { timeout: 15000 })
	},

	// The upgrade of the operating system itself, on the core's own routes. The token goes in the Authorization header, which the
	// instance sets, and never in the address. Every POST sends one JSON object, `{}` when it has nothing to say: the core refuses a body
	// that is not an object (400 bad_request). A refusal is a 409 with the code in data.error_code, and what makes it precise in data.data;
	// a restart or a close that the machine could not carry out is a 500 with its code. A core older than the feature answers 404.

	// How the upgrade is going: always 200 with the status ({ beta_enabled, state, actions, block, pnr, busy, failure, hint, barrier,
	// findings, ack_word, after_reboot_hint, log_tail... }), whatever the switch says. It runs no apt and is safe to ask every few
	// seconds. It waits 10 seconds and not the 60 of the shared client: a core that restarts does not answer, and the next ask is
	// the page's to make.
	getOsUpgradeStatus() {
		return instance.get(`/v1${PREFIX}/os/upgrade/status`, { timeout: 10000 })
	},

	// Switches the feature on or off: 200 { beta_enabled }, or 409 run_open when a run is open.
	setOsUpgradeBeta(enabled) {
		return instance.post(`/v1${PREFIX}/os/upgrade/beta`, { enabled: enabled === true }, { timeout: 15000 })
	},

	// Brings the release the machine runs to its last state (the plan is made after it). `accept` is the person's word that a repository
	// whose release information changed is to be taken: only a refresh that stopped for it (failure.hint releaseinfo_change) is asked
	// again with it. 202 with the status. The core reads the readiness report before it starts, which takes a while: the call waits as
	// long as the core does (5 minutes), and a call that was cut short may have started the run all the same.
	startOsRefresh(accept) {
		return instance.post(`/v1${PREFIX}/os/upgrade/refresh`, { accept_releaseinfo_change: accept === true }, { timeout: 300000 })
	},

	// Starts the upgrade or its rehearsal. data: { plan_id, rehearsal, safety_net, hostname, accept_removals, paused_sources, acks }, as
	// startBody of osUpgrade.js builds it: the core refuses (409, data.error_code) a body that is not the plan's, and 400 a field that
	// is not valid. 202 with the status. It waits as long as the core does (5 minutes), as the refresh does.
	startOsUpgrade(data) {
		return instance.post(`/v1${PREFIX}/os/upgrade/start`, data, { timeout: 300000 })
	},

	// The restart of a machine that waits for it; going on with a run that stopped after its point of no return; calling off a run that
	// has not reached it. 202 with the status.
	rebootOsUpgrade() {
		return instance.post(`/v1${PREFIX}/os/upgrade/reboot`, {}, { timeout: 60000 })
	},
	resumeOsUpgrade() {
		return instance.post(`/v1${PREFIX}/os/upgrade/resume`, {}, { timeout: 60000 })
	},
	abortOsUpgrade() {
		return instance.post(`/v1${PREFIX}/os/upgrade/abort`, {}, { timeout: 60000 })
	},

	// The person's word on a run that is not running. data: { action: 'acknowledge' | 'discard' | 'manual', word }, `word` being the
	// ack_word of the status when the run needs it. 200 with the status. Closing a run puts its backup folder away (copied and removed
	// when it is on another file system), which can take a while.
	ackOsUpgrade(data) {
		return instance.post(`/v1${PREFIX}/os/upgrade/ack`, data, { timeout: 120000 })
	},

	// The text with which to finish the run that is open by hand: { plan_id, hop, text, blocks, from_run }, or 409 no_run or
	// run_unreadable. It holds the lines of the machine's package sources as the files have them, so the token goes in the header.
	getOsUpgradeRunbook() {
		return instance.get(`/v1${PREFIX}/os/upgrade/runbook?run=current`, { timeout: 15000 })
	},

	// The modules of this release, which the core installs and removes with its module assistant. Every POST sends one JSON object (`{}` when
	// it has nothing to say) and the token goes in the Authorization header, which the instance sets, and never in the address. A refusal is a
	// 409 with the code in data.error_code, and what makes it precise in data.data; a field that is not valid is a 400 bad_request, and a job that
	// could not be started a 500 start_failed. A core older than the feature answers 404.

	// What the catalogue of this release offers, joined with what is installed: { catalogue: { ok, error? }, modules: [{ name, title, description,
	// tier, tag, installed: { version } | null, system: { supported, reasons }, broken?, catalogue }] }. It runs no apt.
	getModules() {
		return instance.get(`/v1${PREFIX}/modules`, { timeout: 35000 })
	},

	// The plan of an install, with the machine unchanged: always 200, with `refused` set when it cannot go ahead. The core makes it for up to a
	// minute (a simulation of apt), so the call waits a little longer; `signal` lets the person cancel the wait.
	planModule(name, signal) {
		return instance.post(`/v1${PREFIX}/modules/${moduleName(name)}/plan`, {}, { timeout: 70000, signal })
	},

	// Installs the module for the plan that the person read: data is { plan_id }, and nothing else is sent. 202 with { job, status }, or 409 with
	// plan_changed when the plan is no longer the one that was read. The core makes the plan again before it starts, which can take a minute.
	installModule(name, data) {
		return instance.post(`/v1${PREFIX}/modules/${moduleName(name)}/install`, { plan_id: data?.plan_id }, { timeout: 130000 })
	},

	// Removes the module: its service and the files it put down. Never its packages or its data. 202 with { job, status }.
	removeModule(name) {
		return instance.post(`/v1${PREFIX}/modules/${moduleName(name)}/remove`, {}, { timeout: 70000 })
	},

	// How the job of the module is going, or how it went: { job: { name, kind, state, step, code, undo, kept_packages, started_at, ended_at, log_tail },
	// status: { installed, version, unit, route } }. It runs no apt and is safe to ask every few seconds. The core reads a log for up to 30 seconds,
	// so the call waits longer than that; `signal` lets the page give up the wait.
	getModuleStatus(name, signal) {
		return instance.get(`/v1${PREFIX}/modules/${moduleName(name)}/status`, { timeout: 35000, signal })
	},

	// stop casaos
	stopCasaOS() {
		return api.post(`${PREFIX}/stop`)
	},

	// Check web ui Port
	checkUiPort(url) {
		return api.get(url)
	},

	// Get system apps
	getSystemApps() {
		return api.get(`${PREFIX}/apps-state`)
	},

	// Check ssh login
	checkSshLogin(data) {
		return api.post(`${PREFIX}/ssh-login`, data)
	},

	// Anonymous statistics: { enabled, notice_seen, preview: { event, properties } },
	// the preview built by the core's sender at the moment of the call.
	getTelemetry() {
		return api.get(`${PREFIX}/telemetry`)
	},

	// data: { enabled?, notice_seen? }; answers the same object as getTelemetry.
	setTelemetry(data) {
		return api.put(`${PREFIX}/telemetry`, data)
	},

	// Automatic updates: { enabled, window: { start, end }, state, next, last }.
	// A core older than the feature answers 404.
	getAutoUpdate() {
		return api.get(`${PREFIX}/autoupdate`)
	},

	// data: any of { enabled, window_start, window_end, resume }; answers the same view as getAutoUpdate.
	setAutoUpdate(data) {
		return api.put(`${PREFIX}/autoupdate`, data)
	},

	// Push alerts: { channels: [{ id, name, service, host }], categories, disk_threshold,
	// last_failure }. A channel's URL is never sent back. A core older than the feature answers 404.
	getAlerts() {
		return api.get(`${PREFIX}/alerts`)
	},

	// data: any of { channels, categories, disk_threshold }. `channels` replaces the list:
	// an entry with an id and no url keeps its stored URL, a new entry brings its url.
	setAlerts(data) {
		return api.put(`${PREFIX}/alerts`, data)
	},

	// data: { channel_id? }, one channel or all of them; answers [{ id, ok, error }].
	testAlerts(data) {
		return api.post(`${PREFIX}/alerts/test`, data)
	},

	// power -- data:shutdown
	// power -- data:restart
	power(data) {
		return api.put(`${PREFIX}/state/${data}`)
	},
}
export default sys
