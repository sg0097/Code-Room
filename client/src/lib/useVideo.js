import { useCallback, useEffect, useRef, useState } from 'react'
import { wsBase } from './api'

/**
 * Mesh WebRTC: each participant holds one RTCPeerConnection per other participant.
 * Good for 2–5 people. Beyond that, upload bandwidth runs out and you need an SFU
 * (e.g. LiveKit), which is the planned upgrade path.
 *
 * Every connection gets one audio + one video transceiver up front, even if the
 * user has no camera. Turning the camera/mic on or off then only flips
 * track.enabled, so we never have to renegotiate.
 */
export function useVideo(code, iceServers, enabled) {
  const [localStream, setLocalStream] = useState(null)
  const [mediaError, setMediaError] = useState(null)
  const [peers, setPeers] = useState([]) // [{ peerId, user, stream }]
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)
  const [signalStatus, setSignalStatus] = useState('connecting')
  const localRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let ws = null
    let retry = null
    const conns = new Map() // peerId -> { pc, user, stream, pending: [] }

    const publish = () =>
      setPeers([...conns].map(([peerId, c]) => ({ peerId, user: c.user, stream: c.stream })))
    const send = (msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))

    function attachLocal(pc) {
      for (const t of pc.getTransceivers()) {
        const kind = t.receiver.track.kind
        const track = localRef.current?.getTracks().find((x) => x.kind === kind) || null
        t.direction = 'sendrecv'
        t.sender.replaceTrack(track)
      }
    }

    function createConn(peerId, user, initiator = false) {
      const pc = new RTCPeerConnection({ iceServers })
      const c = { pc, user, initiator, stream: new MediaStream(), pending: [] }
      conns.set(peerId, c)
      pc.onicecandidate = (e) => e.candidate && send({ type: 'signal', to: peerId, data: { candidate: e.candidate } })
      pc.ontrack = (e) => {
        c.stream.addTrack(e.track)
        c.stream = new MediaStream(c.stream.getTracks()) // new object so React re-renders the <video>
        publish()
      }
      // A call that drops (e.g. Wi-Fi -> mobile data) is rebuilt from scratch by
      // whoever placed it; the other side accepts the fresh offer.
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && c.initiator && conns.get(peerId) === c && !disposed) {
          closeConn(peerId)
          setTimeout(() => !disposed && callPeer(peerId, c.user).catch(console.error), 1000)
        }
      }
      publish()
      return c
    }

    function closeConn(peerId) {
      conns.get(peerId)?.pc.close()
      conns.delete(peerId)
      publish()
    }

    async function callPeer(peerId, user) {
      const { pc } = createConn(peerId, user, true)
      pc.addTransceiver('audio', { direction: 'sendrecv' })
      pc.addTransceiver('video', { direction: 'sendrecv' })
      attachLocal(pc)
      await pc.setLocalDescription(await pc.createOffer())
      send({ type: 'signal', to: peerId, data: { sdp: pc.localDescription } })
    }

    async function onSignal(from, data) {
      const c = conns.get(from)
      if (data.sdp?.type === 'offer') {
        // A fresh offer for an existing call means the caller is rebuilding it.
        let conn = c
        if (conn && (conn.pc.signalingState !== 'stable' || conn.pc.remoteDescription)) {
          const user = conn.user
          closeConn(from)
          conn = createConn(from, user)
        }
        conn = conn || createConn(from, null)
        await conn.pc.setRemoteDescription(data.sdp)
        attachLocal(conn.pc)
        await conn.pc.setLocalDescription(await conn.pc.createAnswer())
        send({ type: 'signal', to: from, data: { sdp: conn.pc.localDescription } })
        for (const cand of conn.pending.splice(0)) await conn.pc.addIceCandidate(cand)
      } else if (data.sdp?.type === 'answer' && c) {
        await c.pc.setRemoteDescription(data.sdp)
        for (const cand of c.pending.splice(0)) await c.pc.addIceCandidate(cand)
      } else if (data.candidate && c) {
        if (c.pc.remoteDescription) await c.pc.addIceCandidate(data.candidate)
        else c.pending.push(data.candidate) // arrived before the offer/answer was applied
      }
    }

    function connect() {
      if (disposed) return
      ws = new WebSocket(`${wsBase()}/signal/${code}`)
      ws.onopen = () => setSignalStatus('connected')
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'welcome') {
          // Newcomer rule: I call everyone already here; they only answer.
          for (const p of msg.peers) callPeer(p.peerId, p.user).catch(console.error)
        } else if (msg.type === 'peer-joined') {
          const c = conns.get(msg.peerId) || createConn(msg.peerId, msg.user)
          c.user = msg.user
          publish()
        } else if (msg.type === 'peer-left') {
          closeConn(msg.peerId)
        } else if (msg.type === 'signal') {
          onSignal(msg.from, msg.data).catch(console.error)
        }
      }
      ws.onclose = () => {
        // Drop all calls; on reconnect we get a fresh peer id and call everyone again.
        for (const id of [...conns.keys()]) closeConn(id)
        if (disposed) return
        setSignalStatus('reconnecting')
        retry = setTimeout(connect, 2000)
      }
    }

    async function start() {
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 360 } })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          setMediaError('Camera unavailable: joined with audio only')
        } catch {
          setMediaError('Camera and mic blocked: you can still see and hear others')
        }
      }
      if (disposed) return stream?.getTracks().forEach((t) => t.stop())
      localRef.current = stream
      setLocalStream(stream)
      setCam(!!stream?.getVideoTracks().length)
      setMic(!!stream?.getAudioTracks().length)
      connect()
    }
    start()

    return () => {
      disposed = true
      clearTimeout(retry)
      ws?.close()
      for (const c of conns.values()) c.pc.close()
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
      setLocalStream(null)
      setPeers([])
    }
  }, [code, iceServers, enabled])

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0]
    if (!t) return
    t.enabled = !t.enabled
    setMic(t.enabled)
  }, [])

  const toggleCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0]
    if (!t) return
    t.enabled = !t.enabled
    setCam(t.enabled)
  }, [])

  return {
    localStream,
    peers,
    mic,
    cam,
    toggleMic,
    toggleCam,
    hasMic: !!localStream?.getAudioTracks().length,
    hasCam: !!localStream?.getVideoTracks().length,
    mediaError,
    signalStatus,
  }
}
