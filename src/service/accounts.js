// The accounts routes of the UserService (/v1/users), for the admin only: every answer is read as res.data.data.
import { api } from './service.js'

export const listAccounts = () => api.get('/users')
export const createAccount = (username, password) => api.post('/users', { username, password })
export const deleteAccount = id => api.delete(`/users/${encodeURIComponent(id)}`)
// the modules a user account may read, the whole list: {"rights": []} takes them all away
export const setRights = (id, rights) => api.put(`/users/${encodeURIComponent(id)}/rights`, { rights })
// the folders of Files a user account may reach, the whole list ([{path, write}]): {"folders": []} takes them all away
export const setFolders = (id, folders) => api.put(`/users/${encodeURIComponent(id)}/folders`, { folders })
