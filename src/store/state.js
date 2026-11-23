import { readAppLaunchPreference } from '@/mixins/app/appLaunchPreference'
import { cachedLoginStyle } from '@/views/loginStyle'

const appLaunch = readAppLaunchPreference()

// The account stored at sign-in, so the role is known before the first render. Anything unreadable is no role at all.
function storedUser() {
	try {
		const user = JSON.parse(localStorage.getItem('user'))
		return user && typeof user === 'object' && !Array.isArray(user) ? user : {}
	} catch {
		return {}
	}
}

export const FILE_SORT_STORAGE_KEY = 'casaos-filebrowser-sort'

// How Files sorts, as this browser last left it: name A to Z when nothing usable is stored.
export function savedFileSort() {
	try {
		const { sort, order } = JSON.parse(localStorage.getItem(FILE_SORT_STORAGE_KEY))
		if (['name', 'date', 'size', 'format'].includes(sort) && ['asc', 'desc'].includes(order))
			return { sort, order }
	} catch {}
	return { sort: 'name', order: 'asc' }
}

export function emptyUser() {
	return {
		avatar: '',
		created_at: '',
		description: '',
		email: '',
		id: 0,
		nickname: '',
		role: '',
		updated_at: '',
		username: '',
	}
}

const state = {
	// User
	access_token: '',
	refresh_token: '',
	user: { ...emptyUser(), ...storedUser() },
	// true once the server has said who this is (GET /v1/users/current or the sign-in): the stored role alone is not enough for the Accounts screen
	roleConfirmed: false,
	// true once the server could not be asked who this is, twice (TopBar): the Accounts screen says so rather than wait
	roleFailed: false,
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
	// the login page the box shows: GET /v1/users/status says it, this browser the last answer
	loginStyle: cachedLoginStyle(),
	hardwareInfo: {},
	isMobile: false,

	// Files
	operateObject: null,
	currentPath: '',
	isViewGird: true,
	...savedFileSort(),

	// Wallpaper
	wallpaperObject: {
		path: require('@/assets/background/wallpaper01.jpg'),
		from: 'Built-in', // Built-in, Upload, Files
	},

	// Samba and nfs data
	networkStorage: (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('networkStorage'))) || [],

	// shortcut data
	shortcutData: [],

	// public params
	device_id: 'xxx',
	access_id: 'dsdad',
	casaos_lang: 'zh',
	notImportList: [],
}
export default state
