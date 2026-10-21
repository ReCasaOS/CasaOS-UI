import axios from 'axios'
import router from '@/router'
import store from '@/store'
// import { ToastProgrammatic as Toast } from 'buefy'

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
function giveUp() {
	isRefreshing = false

	const waiting = requests
	requests = []
	waiting.forEach(cb => cb(null))

	logout()
}

instance.interceptors.response.use(
	(response) => {
		return response
	},
	async (error) => {
		const originalConfig = error?.config
		const refresh_token = localStorage.getItem('refresh_token')
		if (originalConfig.url !== '/users/register' && error?.response?.status === 401) {
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
					giveUp()
					console.log(error)
				})
			} else if (originalConfig.url === '/v1/users/refresh' && error?.response?.status === 401) {
				logout()
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
