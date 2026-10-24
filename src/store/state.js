import { readAppLaunchPreference } from '@/mixins/app/appLaunchPreference'

const appLaunch = readAppLaunchPreference()

const state = {
	// User
	access_token: '',
	refresh_token: '',
	user: {
		avatar: '',
		created_at: '',
		description: '',
		email: '',
		id: 0,
		nickname: '',
		role: '',
		updated_at: '',
		username: '',
	},
	initKey: '', // Initialization key for reg
	// where the first account is created: 'web' (here) or 'local' (on the machine)
	firstAdmin: 'web',

	sidebarOpen: false,

	// System Config
	// Whether installed apps open in the in-page dialog, and which apps are
	// excepted from it. Read from storage at startup so the choice survives a
	// reload.
	appLaunchInIframe: appLaunch.inIframe,
	appLaunchExceptions: appLaunch.exceptions,

	searchEngine: '',
	searchEngineSwitch: true,
	existingAppsSwitch: true,
	recommendSwitch: true,

	siteLoading: true,
	needInitialization: false,
	hardwareInfo: {},
	isMobile: false,

	// Files
	operateObject: null,
	currentPath: '',
	isViewGird: true,

	// Wallpaper
	wallpaperObject: {
		path: require('@/assets/background/wallpaper01.jpg'),
		from: 'Built-in', // Built-in, Upload, Files
	},

	// Samba and nfs data
	networkStorage: JSON.parse(localStorage.getItem('networkStorage')) || [],

	// shortcut data
	shortcutData: [],

	// public params
	device_id: 'xxx',
	access_id: 'dsdad',
	casaos_lang: 'zh',
	notImportList: [],
}
export default state
