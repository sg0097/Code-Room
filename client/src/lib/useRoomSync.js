import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { wsBase, colorFor } from './api'

/**
 * One Yjs document per room, synced over /sync/<code>.
 *   doc.getMap('meta')                    -> { roomName, problemId, language }  (shared selection)
 *   doc.getText('code:<problem>:<lang>')  -> the shared code for that problem + language
 *   awareness (not stored)                -> who is here, their cursor, mic/cam state
 */
export function useRoomSync(code, user, enabled) {
  const [sync, setSync] = useState(null)
  const [status, setStatus] = useState('connecting')
  const [meta, setMeta] = useState({})
  const [participants, setParticipants] = useState([])

  useEffect(() => {
    if (!enabled) return
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(`${wsBase()}/sync`, code, doc)
    const { awareness } = provider
    awareness.setLocalStateField('user', { id: user.id, name: user.name, picture: user.picture, color: colorFor(user.id) })
    awareness.setLocalStateField('media', { mic: true, cam: true })

    const metaMap = doc.getMap('meta')
    const onMeta = () => setMeta(metaMap.toJSON())
    metaMap.observe(onMeta)

    const onAwareness = () => {
      // One person may have several tabs open; show them once.
      const byUser = new Map()
      awareness.getStates().forEach((state, clientId) => {
        if (!state.user) return
        const prev = byUser.get(state.user.id)
        const self = clientId === doc.clientID
        if (!prev || self) byUser.set(state.user.id, { ...state.user, media: state.media, clientId, self: self || prev?.self })
      })
      setParticipants([...byUser.values()])
    }
    awareness.on('change', onAwareness)
    onAwareness()

    provider.on('status', ({ status }) => setStatus(status))
    provider.on('sync', (synced) => synced && onMeta())

    setSync({ doc, provider, awareness, metaMap })
    return () => {
      metaMap.unobserve(onMeta)
      awareness.off('change', onAwareness)
      // Let child components (the editor binding) unbind first, then disconnect and free the doc.
      setTimeout(() => {
        provider.destroy()
        doc.destroy()
      }, 0)
      setSync(null)
    }
  }, [code, user.id, user.name, user.picture, enabled])

  return { sync, status, meta, participants }
}
