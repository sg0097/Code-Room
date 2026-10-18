import { colorFor, initials } from '../lib/api'

export default function Avatar({ user, size = 32 }) {
  const style = { width: size, height: size, fontSize: size * 0.4, background: colorFor(user?.id) }
  if (user?.picture) return <img className="avatar" src={user.picture} alt="" style={style} referrerPolicy="no-referrer" />
  return <div className="avatar" style={style}>{initials(user?.name)}</div>
}
