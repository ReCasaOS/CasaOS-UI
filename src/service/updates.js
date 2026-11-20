import { api } from './service.js'

const PREFIX = '/v2/app_management'

// Every app at once (AppManagement v0.4.52). The plan asks every image's registry
// first, one round trip per distinct image, so it gets the long timeout the image
// check has rather than the shared instance's minute.
const updates = {
	plan() {
		return api.get(`${PREFIX}/compose/updates`, { params: { check: true }, timeout: 5 * 60 * 1000 })
	},

	// The apps to update, in this order. Answered as the run starts; `run` says the rest.
	start(ids) {
		return api.post(`${PREFIX}/compose/updates`, { ids })
	},

	// The run in progress or the last one; 404 when none has run since the service started.
	run() {
		return api.get(`${PREFIX}/compose/updates/run`)
	},

	// The apps that update by themselves at night, and the last nights.
	autoUpdate() {
		return api.get(`${PREFIX}/auto-update`)
	},

	// days an update must have been known before a night applies it
	setAutoUpdateWait(minDays) {
		return api.put(`${PREFIX}/auto-update`, { min_days: minDays })
	},

	setAutoUpdate(id, enabled) {
		return api.put(`${PREFIX}/compose/${encodeURIComponent(id)}/auto-update`, { enabled })
	},
}

export default updates
