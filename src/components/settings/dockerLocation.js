// Where Docker's data is, and moving it (CasaOS-AppManagement).
import { api } from '@/service/service.js'

// the api wrapper puts /v1 in front of paths without a version
const PREFIX = '/container/docker-location'

export const dockerLocationApi = {
	get() {
		return api.get(PREFIX)
	},
	// a folder, or null for the default place
	check(path) {
		// api.get takes the query parameters themselves
		return api.get(`${PREFIX}/check`, path ? { path } : { default: true })
	},
	move(path) {
		return api.post(PREFIX, path ? { path } : { default: true })
	},
	deleteOldCopy() {
		return api.delete(`${PREFIX}/old`)
	},
}
