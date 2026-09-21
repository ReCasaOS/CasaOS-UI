import 'intersection-observer'
import { createApp } from 'vue'
import Buefy from 'buefy'
import VueFullscreen from 'vue-fullscreen'
import VueDOMPurifyHTML from 'vue-dompurify-html'
import App from '@/App.vue'
import router from '@/router'
import store from '@/store'
import i18n from '@/plugins/i18n'
import api from '@/service/api.js'
import openAPI from '@/service/index.js'
import socketPlugin from '@/plugins/socket.js'
import dropdownAppendToBody from '@/plugins/dropdown-append-to-body.js'
import { dompurifyOptions } from '@/plugins/dompurify.js'
import createEventBus from '@/events/eventBus.js'
import messageBus from '@/events/index.js'
// vee-validate 4 throws `No such validator '<name>' exists.` for a rule nobody
// registered, so the rules are defined once here instead of by whichever form
// happens to be imported first. Ports.vue and StorageManagerPanel.vue name
// rules they never registered and only ever worked by that load order.
import '@/plugins/vee-validate'
import { applyThemePreference, readThemePreference } from '@/mixins/app/themePreference'

// Import Styles
import '@/assets/scss/app.scss'
import VAnimateCss from '@/plugins/animate-css'

// The inline script in public/index.html stamped data-theme before the first
// paint; from here on the module owns it and follows the OS while on 'system'.
applyThemePreference(readThemePreference())

const io = require('socket.io-client')

const isDev = process.env.NODE_ENV === 'dev'
const protocol = document.location.protocol
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
const devIp = process.env.VUE_APP_DEV_IP
const devPort = process.env.VUE_APP_DEV_PORT
const localhost = document.location.host
const localhostName = document.location.hostname
const baseIp = isDev ? `${devIp}` : `${localhostName}`
const baseURL = isDev ? `${devIp}:${devPort}` : `${localhost}`

const socket = io({
	transports: ['websocket', 'polling'],
	path: '/v2/message_bus/socket.io/',
})

const app = createApp(App)

app.use(Buefy)
app.use(dropdownAppendToBody)
app.use(VueFullscreen)
app.use(VAnimateCss)
app.use(socketPlugin, socket)
app.use(VueDOMPurifyHTML, dompurifyOptions)

app.config.globalProperties.$api = api
app.config.globalProperties.$openAPI = openAPI
app.config.globalProperties.$baseIp = baseIp
app.config.globalProperties.$baseURL = baseURL
app.config.globalProperties.$protocol = protocol
app.config.globalProperties.$wsProtocol = wsProtocol

// Create an EventBus
app.config.globalProperties.$EventBus = createEventBus()
app.config.globalProperties.$messageBus = messageBus

app.use(router)
app.use(store)
app.use(i18n)
app.mount('#app')
