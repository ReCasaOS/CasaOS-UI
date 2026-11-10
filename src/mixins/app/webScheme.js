// The scheme of an app's web interface, as its compose file gives it (x-casaos:
// scheme). The file may come from any store, and the scheme goes in front of an
// address the dashboard opens in a frame or in a tab: anything but http and https
// (`javascript:`, `data:`) would be run there, so it is read as http.
export function webScheme(scheme) {
	return String(scheme).toLowerCase() === 'https' ? 'https' : 'http'
}
