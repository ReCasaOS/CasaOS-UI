// The storage layer: pools over the drives, backend-neutral (btrfs, md), plan → preview → apply.
// GET /v2/storage answers only where the storage service has it (ReCasaNix's recasanix-storage); the
// Storage manager shows its Pool tab only then.
import { api } from './service.js'

const PREFIX = '/v2/storage'
const pools = {
	// the pools, the box's verbs (create-pool), the drives with their roles, the layouts, the recent jobs
	overview() {
		return api.get(PREFIX)
	},

	// what each layout gives on these free drives
	layouts(disks) {
		return api.get(`${PREFIX}/layouts?disks=${encodeURIComponent(disks.join(','))}`)
	},

	// an intent ({verb, pool, layout, disks, member}) → a plan to preview, or a refusal (409) saying why
	plan(intent) {
		return api.post(`${PREFIX}/plans`, intent)
	},

	// confirm is what the plan asks to be typed
	apply(id, confirm) {
		return api.post(`${PREFIX}/plans/${encodeURIComponent(id)}/apply`, { confirm })
	},
}
export default pools
