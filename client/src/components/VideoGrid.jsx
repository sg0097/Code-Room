import { useEffect, useRef } from 'react'
import Avatar from './Avatar'

function VideoCard({ stream, user, muted, camOn, micOn, label }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null
  }, [stream])
  const showVideo = stream && camOn && stream.getVideoTracks().length > 0

  return (
    <div className="video-card">
      <video ref={ref} autoPlay playsInline muted={muted} style={{ visibility: showVideo ? 'visible' : 'hidden' }} />
      {!showVideo && (
        <div className="video-off">
          <Avatar user={user} size={56} />
        </div>
      )}
      <div className="video-label">
        {!micOn && <span className="mic-off" title="Muted">muted</span>}
        {label}
      </div>
    </div>
  )
}

export default function VideoGrid({ me, video, participants }) {
  const mediaOf = (userId) => participants.find((p) => p.id === userId)?.media || { mic: true, cam: true }

  return (
    <section className="videos">
      <div className="video-list">
        <VideoCard stream={video.localStream} user={me} muted camOn={video.cam} micOn={video.mic} label={`${me.name} (you)`} />
        {video.peers.map((p) => {
          const m = mediaOf(p.user?.id)
          return <VideoCard key={p.peerId} stream={p.stream} user={p.user} camOn={m.cam} micOn={m.mic} label={p.user?.name || 'Connecting…'} />
        })}
      </div>

      <div className="controls">
        <button className={`ctrl ${video.mic ? '' : 'off'}`} onClick={video.toggleMic} disabled={!video.hasMic} title="Mic">
          {video.mic ? 'Mute' : 'Unmute'}
        </button>
        <button className={`ctrl ${video.cam ? '' : 'off'}`} onClick={video.toggleCam} disabled={!video.hasCam} title="Camera">
          {video.cam ? 'Stop video' : 'Start video'}
        </button>
      </div>
      {video.mediaError && <p className="media-error">{video.mediaError}</p>}
    </section>
  )
}
