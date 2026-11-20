import { api } from './service.js'

const PREFIX = '/v2/app_management/cleanup'

// What apps left behind on the disk. The box decides what is offered, and decides it
// again when asked to delete: a list here can only narrow it.
const cleanup = {
	get() {
		return api.get(PREFIX)
	},

	pruneBuildCache() {
		return api.delete(`${PREFIX}/build-cache`)
	},

	removeImages(names) {
		return api.post(`${PREFIX}/images`, { names })
	},

	removeVolumes(names) {
		return api.post(`${PREFIX}/volumes`, { names })
	},

	// the weekly switch and the last runs
	getSchedule() {
		return api.get(`${PREFIX}/schedule`)
	},

	setSchedule(weekly) {
		return api.put(`${PREFIX}/schedule`, { weekly })
	},

	// moves aside the folders of apps that are gone; nothing is deleted
	removeOrphans(names) {
		return api.post(`${PREFIX}/orphans`, { names })
	},
}

export default cleanup
