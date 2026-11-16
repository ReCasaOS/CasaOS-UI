import { api } from './service.js'

const PREFIX = '/v2/app_management'

const sync = {
	getTasks() {
		return api.get(`${PREFIX}/sync/tasks`)
	},

	// The whole list at once, like the backup schedules.
	saveTasks(tasks) {
		return api.put(`${PREFIX}/sync/tasks`, { tasks })
	},

	run(id) {
		return api.post(`${PREFIX}/sync/tasks/${encodeURIComponent(id)}/run`)
	},

	// Lets a task that lost track of the two sides copy both ways once, deleting nothing.
	firstPass(id) {
		return api.post(`${PREFIX}/sync/tasks/${encodeURIComponent(id)}/first-pass`)
	},

	// Allows the deletions a pass held back because more than half of one side was gone.
	confirmDeletes(id) {
		return api.post(`${PREFIX}/sync/tasks/${encodeURIComponent(id)}/confirm-deletes`)
	},
}

export default sync
