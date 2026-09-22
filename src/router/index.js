/*
 * @LastEditors: zhanghengxin ezreal.zhang@icewhale.org
 * @LastEditTime: 2022/12/1 下午8:21
 * @FilePath: /CasaOS-UI/src/router/index.js
 * @Description:
 *
 * Copyright (c) 2022 by IceWhale, All Rights Reserved.
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import route from './route.js'
import api from '@/service/api'
import store from '@/store'

const routes = route

// `mode: 'hash'` + `base` collapse into the history factory. Keep the argument:
// publicPath is "/", so BASE_URL is "/" and URLs stay /#/login. With no
// argument the base falls back to location.pathname, which differs under a
// test runner where BASE_URL is undefined.
const router = createRouter({
	history: createWebHashHistory(process.env.BASE_URL),
	routes,
})

// The VueRouter.prototype.push catch-monkeypatch that used to live here is
// gone: v4 has no prototype to patch, and it resolves with a NavigationFailure
// instead of rejecting on a duplicate navigation.

// The store too, not only localStorage: the message bus socket follows the
// store's token, and one left there would keep it connected after a logout.
function forgetTokens() {
	localStorage.removeItem('access_token')
	localStorage.removeItem('refresh_token')
	store.commit('SET_ACCESS_TOKEN', '')
	store.commit('SET_REFRESH_TOKEN', '')
}

async function needInit() {
	if (store.state.needInitialization) {
		return true
	}
	try {
		const userStatusRes = await api.users.getUserStatus()
		if (userStatusRes.data.success === 200 && !userStatusRes.data.data.initialized) {
			store.commit('SET_NEED_INITIALIZATION', true)
			store.commit('SET_INIT_KEY', userStatusRes.data.data.key)
			forgetTokens()
			return true
		} else {
			return false
		}
	} catch (error) {
		console.error(error)
		return false
	}
}

router.beforeEach(async (to, from, next) => {
	const accessToken = localStorage.getItem('access_token')
	const requireAuth = to.matched.some(record => record.meta.requireAuth)

	// 判断是否需要初始化
	const needInitRes = await needInit()

	if (to.path !== '/welcome') {
		if (needInitRes) {
			next('/welcome')
		} else {
			if (requireAuth && !accessToken) {
				next('/login')
			} else {
				// The `return`s matter: both of these used to fall through to the
				// unconditional next() below. v4 applies only the first call, so
				// behaviour is unchanged, but it warns `The "next" callback was
				// called more than once` on every login and logout.
				switch (to.path) {
					case '/login':
						if (accessToken) {
							return next('/')
						}
						break

					case '/logout':
						forgetTokens()
						localStorage.removeItem('wallpaper')
						localStorage.removeItem('user')
						return next('/login')

					// No `default` that throws the session away when `version` is not in
					// localStorage. Which CasaOS version this is says nothing about
					// whether the person driving the browser is signed in, and nothing
					// else ever read that key: the only way to fill it was to be sent to
					// the login page, so the branch existed to undo itself. What it did
					// in practice was delete the token of somebody who had just signed
					// in, whenever the version call behind it had not answered -- which
					// is exactly the minute after an update, and is why signing in took
					// two attempts.
				}
				next()
			}
		}
	} else {
		if (needInitRes) {
			next()
		} else {
			next('/login')
		}
	}
})

export default router
