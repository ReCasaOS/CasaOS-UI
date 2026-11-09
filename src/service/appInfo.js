// What this AppManagement can do beyond its first release (GET /info, `features`). A client
// asks instead of guessing from a version. An AppManagement that does not list a feature,
// or does not answer, has none: callers do nothing new for it.
let features = null

const appInfo = {
	async supports(feature) {
		try {
			// imported here: the service module pulls in the store, which a component that only
			// reads the answer should not drag in when it is loaded
			const { api } = await import('./service.js')
			features ??= api.get('/v2/app_management/info')
				.then(response => (Array.isArray(response?.data?.features) ? response.data.features : []))
			return (await features).includes(feature)
		} catch {
			features = null // not remembered: asked again next time
			return false
		}
	},
}

export default appInfo
