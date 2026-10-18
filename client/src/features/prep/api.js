import { request } from '../../lib/api'

export const prepApi = {
  get: () => request('GET', '/api/prep'),
  save: (profile) => request('PUT', '/api/prep', profile).then((r) => {
    cached = Promise.resolve(r.profile)
    return r
  }),
  home: () => request('GET', '/api/prep/home'),
}

// The editor asks for the preferred language on every solve screen: fetch the profile once.
let cached = null
export const prepProfile = () => (cached ||= prepApi.get().then((r) => r.profile).catch(() => {
  cached = null
  return null
}))
