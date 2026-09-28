import { api } from './service.js'

const PREFIX = '/sys'

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
