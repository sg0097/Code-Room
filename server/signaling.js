import crypto from 'node:crypto'

/**
 * WebRTC signaling for a full mesh (every participant connects to every other).
 * The server only relays messages; audio/video flows browser-to-browser.
 *
 * Protocol (JSON over WebSocket):
 *   server -> client  { type: 'welcome', peerId, peers: [{ peerId, user }] }
 *   server -> others  { type: 'peer-joined', peerId, user }
 *   client -> server  { type: 'signal', to, data }      data = SDP offer/answer or ICE candidate
 *   server -> target  { type: 'signal', from, data }
 *   server -> others  { type: 'peer-left', peerId }
 *
 * The newcomer sends offers to everyone already present; existing peers only answer.
 * That rule means two peers never send offers to each other at the same time.
 */
const channels = new Map() // roomCode -> Map<peerId, { ws, user }>

export function handleSignal(ws, roomCode, user, onClose) {
  const peers = channels.get(roomCode) || new Map()
  channels.set(roomCode, peers)
  const peerId = crypto.randomUUID()

  const send = (sock, msg) => sock.readyState === sock.OPEN && sock.send(JSON.stringify(msg))

  send(ws, { type: 'welcome', peerId, peers: [...peers].map(([id, p]) => ({ peerId: id, user: p.user })) })
  for (const p of peers.values()) send(p.ws, { type: 'peer-joined', peerId, user })
  peers.set(peerId, { ws, user })

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg?.type === 'signal' && peers.has(msg.to)) {
      send(peers.get(msg.to).ws, { type: 'signal', from: peerId, data: msg.data })
    }
  })

  // Keep idle connections alive through proxies that drop silent sockets.
  const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 25000)

  ws.on('close', () => {
    clearInterval(ping)
    peers.delete(peerId)
    for (const p of peers.values()) send(p.ws, { type: 'peer-left', peerId })
    if (peers.size === 0) channels.delete(roomCode)
    onClose()
  })
}
