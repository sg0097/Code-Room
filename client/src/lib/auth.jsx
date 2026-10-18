import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, config: null, error: null })

  useEffect(() => {
    Promise.all([api.config(), api.me(), api.meta()])
      .then(([config, me, meta]) => setState({ loading: false, user: me.user, config, meta, error: null }))
      .catch((e) => setState({ loading: false, user: null, config: null, error: e.message }))
  }, [])

  const setUser = useCallback((user) => setState((s) => ({ ...s, user })), [])
  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setState((s) => ({ ...s, user: null }))
  }, [])

  return <AuthContext.Provider value={{ ...state, setUser, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
