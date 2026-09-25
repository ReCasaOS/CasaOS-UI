// Finds Syncthing among the apps of the app grid (GET /v2/app_management/web/appgrid).
// The widget used to ask /v1/container, which the backend no longer has: the
// 404 left it offering Install forever.

const DEFAULT_PORT = '8384'

// Syncthing, by its image, preferring the one on its usual port; null when it
// is not installed.
export function findSyncthing(apps) {
	const syncthings = (apps || []).filter(app => (app.image || '').toLowerCase().includes('syncthing'))
	const app = syncthings.find(a => String(a.port) === DEFAULT_PORT) || syncthings[0]
	if (!app) {
		return null
	}

	return {
		name: app.name,
		port: String(app.port || ''),
		running: app.status === 'running',
	}
}
