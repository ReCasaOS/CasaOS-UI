import axios from 'axios'
import { ToastProgrammatic } from 'buefy'
import router from '@/router'
import store from '@/store'
import i18n from '@/plugins/i18n'

const axiosBaseURL = ``

// Create a axios instance, And set timeout to 30s
const instance = axios.create({
	baseURL: axiosBaseURL,
	timeout: 60000,
	headers: {
		'Content-Type': 'application/json',
	},
	withCredentials: false,
})

function getLangFromBrowser() {
	let lang = navigator.language || navigator.userLanguage
	lang = lang.toLowerCase().replace('-', '_')
	return lang
}

function getInitLang() {
	const lang = localStorage.getItem('lang') || getLangFromBrowser()
	return lang
}

// Interception before request initiation
instance.interceptors.request.use(
	(config) => {
		config.headers.common.Language = getInitLang()
		const token = localStorage.getItem('access_token')
		const rtoken = localStorage.getItem('refresh_token')
		if (token) {
			config.headers.Authorization = token
			store.commit('SET_ACCESS_TOKEN', token)
			store.commit('SET_REFRESH_TOKEN', rtoken)
		}
		return config
	},
	(error) => {
		// Do something with request error
		return Promise.reject(error)
	},
)

// Response interception

let isRefreshing = false
let requests = []

function logout() {
	store.commit('SET_ACCESS_TOKEN', '')
	store.commit('SET_REFRESH_TOKEN', '')
	router.replace({ // Jump to the logout page
		path: '/logout',
	})
}

// A refresh that failed used to sign the user out and leave `isRefreshing` true
// with the queue full: every later 401 was parked in `requests` behind a refresh
// that would never be attempted again, so those requests hung for the lifetime of
// the page and their callers' error handling never ran. The flag goes back and the
// queue is turned away, so the next 401 gets a refresh of its own.
function giveUp(signOut = true) {
	isRefreshing = false

	const waiting = requests
	requests = []
	waiting.forEach(cb => cb(null))

	if (signOut) {
		logout()
	}
}

// What the box says when it refuses on account of the role (the Gateway's INSUFFICIENT_PERMISSIONS) or cannot answer (503): one
// translated toast, not one per call, and the same sentence for the callers that read the answer's `data` or `message`.
const FORBIDDEN_CODE = 10011
const SERVICE_ERROR_CODE = 500
const TOAST_QUIET_MS = 3000
const lastToast = {}
// the export of Buefy is a class: an instance without an app opens a toast outside any component
const toaster = new ToastProgrammatic()

function refuse(error, sentence) {
	const now = Date.now()
	if (!(now - (lastToast[sentence] ?? -Infinity) < TOAST_QUIET_MS)) {
		lastToast[sentence] = now
		toaster.open({ message: i18n.global.t(sentence), type: 'is-danger', position: 'is-top', duration: 4000 })
	}
	const text = i18n.global.t(sentence)
	const body = error.response.data && typeof error.response.data === 'object' ? error.response.data : {}
	error.response.data = { ...body, data: text, message: text }
}

function explainRefusal(error) {
	const status = error?.response?.status
	if (status === 403 && error.response.data?.success === FORBIDDEN_CODE) {
		refuse(error, 'You do not have the right to do this.')
	} else if (status === 503 && error.response.data?.success === SERVICE_ERROR_CODE) {
		// the Gateway's own 503; a service that answers 503 with a reason of its own keeps it for its callers
		refuse(error, 'The service is temporarily unavailable.')
	}
}

instance.interceptors.response.use(
	(response) => {
		return response
	},
	async (error) => {
		const originalConfig = error?.config
		const refresh_token = localStorage.getItem('refresh_token')
		explainRefusal(error)
		if (originalConfig?.url !== '/users/register' && error?.response?.status === 401) {
			// The refresh itself was refused, or a call was refused again with the token it
			// was replayed with: no newer token is coming. The refresh used to be parked in
			// its own queue, so it never ended and `isRefreshing` stayed true until the page
			// was reloaded; rejected, its catch below gives up and signs the user out.
			if (originalConfig.url === '/v1/users/refresh' || originalConfig.replayed) {
				// a token the box hands out and then refuses is a session that cannot go on
				if (originalConfig.replayed) {
					logout()
				}
				return Promise.reject(error)
			}
			// Access Token was expired
			if (!isRefreshing) {
				isRefreshing = true

				instance.post('/v1/users/refresh', {
					refresh_token,
				}).then((tokenRes) => {
					if (tokenRes.data.success == 200) {
						localStorage.setItem('access_token', tokenRes.data.data.access_token)
						localStorage.setItem('refresh_token', tokenRes.data.data.refresh_token)
						localStorage.setItem('expires_at', tokenRes.data.data.expires_at)

						store.commit('SET_ACCESS_TOKEN', tokenRes.data.data.access_token)
						store.commit('SET_REFRESH_TOKEN', tokenRes.data.data.refresh_token)
						originalConfig.headers.Authorization = tokenRes.data.data.access_token
						instance.defaults.headers.Authorization = tokenRes.data.data.access_token
						isRefreshing = false
						return tokenRes.data.data.access_token
					} else {
						giveUp()
					}
				}).then((token) => {
					requests.forEach(cb => cb(token))
					requests = []
				}).catch((error) => {
					// the box that cannot be reached right now is no reason to sign out: its 503 is told in a toast by the next call
					giveUp(error?.response?.status !== 503)
					console.log(error)
				})
			}
			return new Promise((resolve, reject) => {
				requests.push((token) => {
					// null means the refresh gave up: fail the call rather than replaying
					// it unauthenticated, which would 401 again and start the whole dance
					// a second time.
					if (!token) {
						reject(error)
						return
					}

					// The request keeps its own headers: a text/plain body retried
					// under the JSON default would be re-encoded as a JSON string.
					originalConfig.headers.Authorization = token
					originalConfig.replayed = true
					resolve(instance(originalConfig))
				})
			})
		}
		return Promise.reject(error)
	},
)

function testVisionNum(prefix) {
	// default version number is /v1
	if (prefix.startsWith('http') || /^\/v[2-9]/.test(prefix)) {
		return prefix
	} else {
		return `/v1${prefix}`
	}
}

const CancelToken = axios.CancelToken
// Wrapping of axios by request type
const api = {

	get(url, data, _this) {
		url = testVisionNum(url)
		if (_this) {
			return instance.get(url, {
				params: data,
				cancelToken: new CancelToken((c) => {
					_this.cancelRequest = c
				}),
			})
		} else {
			return instance.get(url, {
				params: data,
			})
		}
	},
	post(url, data, config) {
		url = testVisionNum(url)
		return instance.post(url, data, config)
	},
	put(url, data, config) {
		url = testVisionNum(url)
		return instance.put(url, data, config)
	},
	delete(url, data) {
		url = testVisionNum(url)
		return instance.delete(url, { data })
	},
	patch(url, data) {
		url = testVisionNum(url)
		return instance.patch(url, data)
	},
}
export { api, instance }
