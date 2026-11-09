import { api } from './service.js'

// Whether the browser will render an app's web interface in a frame on the
// dashboard (AppManagement, GET /web/frame-check). A refused frame tells the page
// nothing, and another origin's headers cannot be read from here, so the box asks.
// `{ data: { embeddable?, reason? } }`; `embeddable` absent means the app did not
// answer. An AppManagement older than the endpoint answers 404.
const webFrame = {
	check(url, origin) {
		return api.get('/v2/app_management/web/frame-check', { params: { url, origin } })
	},
}

export default webFrame
