/*
 * @Author: Jerryk jerry@icewhale.org
 * @Date: 2022-07-12 22:25:15
 * @LastEditors: zhanghengxin ezreal.ice@icloud.com
 * @LastEditTime: 2022-09-28 00:57:10
 * @FilePath: /CasaOS-UI/src/service/container.js
 * @Description:
 *
 * Copyright (c) 2022 by IceWhale, All Rights Reserved.
 */
import { api, instance } from './service.js'

const PREFIX = '/container'
const PREFIX2 = '/v2/app_management/container'
const PREFIX2COMPOSE = '/v2/app_management/compose'

const container = {
	// get container networks
	getNetworks() {
		return api.get(`${PREFIX}/networks`)
	},

	// get container logs
	getLogs(id) {
		return api.get(`${PREFIX}/${id}/logs`)
	},

	// v2:: get container logs
	getLogsV2(id) {
		return api.get(`${PREFIX2}/${id}/logs`)
	},

	// get my app list
	getMyAppList(data) {
		return api.get(`${PREFIX}`, data)
	},

	// v2:: get my app list
	getMyAppListV2(data) {
		return api.get(`${PREFIX2COMPOSE}`, data)
	},

	// get container info
	getInfo(id) {
		return api.get(`${PREFIX}/${id}`)
	},

	// v2:: get container info
	getInfoV2(id) {
		return api.get(`${PREFIX2COMPOSE}/${id}`)
	},

	// get container state
	getState(id) {
		return api.get(`${PREFIX}/${id}/state`)
	},

	// v2:: get container state
	getStateV2(id) {
		return api.get(`${PREFIX2COMPOSE}/${id}/status`)
	},

	// get my app hardware usage info
	getHardwareUsage() {
		return api.get(`${PREFIX}/usage`)
	},

	// open docker terminal
	openTerminal(id) {
		return api.get(`${PREFIX}/${id}/terminal`)
	},

	// v2:: open docker terminal
	openTerminalV2(id) {
		return api.get(`${PREFIX2COMPOSE}/${id}/containers`)
	},

	// install container
	install(data) {
		return api.post(`${PREFIX}`, data)
	},

	// v2:: install container
	installV2(data, config) {
		return api.post(`${PREFIX2COMPOSE}`, data, config)
	},

	// update contianer
	update(id, data) {
		return api.put(`${PREFIX}/${id}`, data)
	},

	// v2:: update contianer
	updateV2(id, data) {
		return api.put(`${PREFIX2COMPOSE}/${id}`, data)
	},

	// update container state
	updateState(id, state) {
		return api.put(`${PREFIX}/${id}/state`, {
			state,
		})
	},

	// v2:: update container state
	updateStateV2(id, state) {
		return api.put(`${PREFIX2COMPOSE}/${id}/status`, {
			status: state,
		})
	},

	// uninstall  container
	uninstall(id, data) {
		return api.delete(`${PREFIX}/${id}`, data)
	},

	// v2:: uninstall  container
	uninstallV2(id, data) {
		return api.delete(`${PREFIX2COMPOSE}/${id}`, data)
	},

	// AppsInstallationLocation require doctument
	getInstallationLocation() {
		return api.get(`${PREFIX}/info`)
	},

	// AppsInstallationLocation require doctument
	putInstallationLocation(value) {
		return api.put(`${PREFIX}/info`, {
			docker_root_dir: value,
		})
	},

	// check container launch status
	containerLauncherCheck(id) {
		return api.get(`${PREFIX2}/${id}/healthcheck`)
	},

	// v2:: check container launch status INGINGINGINGINGINGINGING
	containerLauncherCheckV2(id) {
		return api.get(`${PREFIX2COMPOSE}/${id}/containers`)
	},

	// export container as compose file
	exportAsCompose(id) {
		return api.get(`${PREFIX}/${id}/compose`)
	},

	// rebuild app
	archive(id) {
		return api.put(`${PREFIX}/archive/${id}`)
	},

	// v2:: read the .env file of an app, as raw text ('' when there is none).
	// Bypasses `api`, whose get() takes no config: the default transform would
	// JSON-parse a body such as `123`.
	getComposeEnv(id) {
		return instance.get(`${PREFIX2COMPOSE}/${id}/env`, {
			responseType: 'text',
			transformResponse: [d => d],
		}).catch((error) => {
			// The identity transform applies to error bodies too: hand the
			// caller the server's {message}, not a JSON string.
			const data = error.response && error.response.data
			if (typeof data === 'string') {
				try {
					error.response.data = JSON.parse(data)
				} catch {
					// not JSON: leave the text
				}
			}
			throw error
		})
	},

	// v2:: everything known about one container. For one CasaOS did not install,
	// where Docker invented the name, this is the only identity there is.
	getDetail(id) {
		return api.get(`${PREFIX2}/${encodeURIComponent(id)}/detail`)
	},

	// v2:: remove a container, and the named volumes listed with it. The server
	// decides again whether each volume may go -- this list is a request, not an
	// instruction.
	remove(id, volumes) {
		return instance.delete(`${PREFIX2}/${encodeURIComponent(id)}`, { data: { volumes } })
	},

	// v2:: what the app's running containers are using. Takes about a second
	// whatever the size of the app: CPU is a counter, so the daemon has to be read
	// twice before it means anything.
	getContainerStats(id) {
		return api.get(`${PREFIX2COMPOSE}/${encodeURIComponent(id)}/containers/stats`)
	},

	// v2:: the health check of ONE container of an app: its command, its timings
	// and its last runs. The command and its output come back empty for an account
	// that is not the owner.
	getContainerHealth(id, containerId) {
		return api.get(`${PREFIX2COMPOSE}/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}/health`)
	},

	// v2:: start, stop or restart ONE container of an app, rather than the whole
	// stack. The body is a bare JSON string, like the app-level status route it
	// sits beside -- so it is encoded here: handed a plain string, axios would
	// send it unquoted, which is not JSON.
	setContainerStatus(id, containerId, action) {
		return instance.put(
			`${PREFIX2COMPOSE}/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}/status`,
			JSON.stringify(action),
			{ headers: { 'Content-Type': 'application/json' } },
		)
	},

	// v2:: replace the .env file of an app with `text`; '' deletes it. Sent as
	// text/plain: under the instance's JSON default, '' would go out as `""`.
	applyComposeEnv(id, text, dryRun) {
		return instance.put(`${PREFIX2COMPOSE}/${id}/env`, text, {
			params: { dry_run: dryRun },
			headers: { 'Content-Type': 'text/plain' },
		})
	},
}

export default container
