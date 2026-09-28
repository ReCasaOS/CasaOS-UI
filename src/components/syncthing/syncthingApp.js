// Finds Syncthing among the apps of the app grid (GET /v2/app_management/web/appgrid).
// The widget used to ask /v1/container, which the backend no longer has: the
// 404 left it offering Install forever.

const DEFAULT_PORT = '8384'

// Syncthing, by its image, preferring an App Store (v2) install, then the one on
// its usual port; null when it is not installed. A v1 app or a plain container
// still counts as installed, so the widget does not offer a second install that
// would fight over the port, but only a v2 app can be started by name: for the
// others the grid's name is a container id the compose API does not know.
export function findSyncthing(apps, baseIp) {
	const syncthings = (apps || []).filter(app => (app.image || '').toLowerCase().includes('syncthing'))
	const rank = a => (a.app_type === 'v2app' ? 0 : 2) + (String(a.port) === DEFAULT_PORT ? 0 : 1)
	const app = syncthings.sort((a, b) => rank(a) - rank(b))[0]
	if (!app) {
		return null
	}

	return {
		name: app.name,
		port: String(app.port || ''),
		running: app.status === 'running',
		startable: app.app_type === 'v2app',
		url: webUIURL(app, baseIp),
	}
}

// The URL the app card opens (openThirdApp), so both buttons lead to the Web UI
// set under Settings › Web UI. A container CasaOS did not install has no port,
// and without a port or a hostname of its own the URL lands on the box's default
// port: the dashboard itself, whatever the index says. An empty URL says there is
// nothing to open.
function webUIURL(app, baseIp) {
	if (!app.port && !app.hostname) {
		return ''
	}
	const port = app.port ? `:${app.port}` : ''
	return `${app.scheme || 'http'}://${app.hostname || baseIp}${port}${app.index || ''}`
}
