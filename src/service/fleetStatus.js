import { api } from './service.js'

// the master's view of its fleet, for the dashboard; the Fleet page has its own client
export default {
	status: () => api.get('/fleet'),
}
