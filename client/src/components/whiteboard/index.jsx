import { lazy, Suspense } from 'react'

// Excalidraw is large (~1 MB), so it's only downloaded on screens that show a whiteboard.
const load = () => import('./Whiteboard')
const Solo = lazy(() => load().then((m) => ({ default: m.SoloWhiteboard })))
const Collab = lazy(() => load().then((m) => ({ default: m.CollabWhiteboard })))
const View = lazy(() => load().then((m) => ({ default: m.DiagramView })))

const Loading = ({ height }) => <div className="whiteboard wb-loading" style={{ height }}>Loading whiteboard…</div>

export const SoloWhiteboard = (props) => (
  <Suspense fallback={<Loading height={props.height || 540} />}>
    <Solo {...props} />
  </Suspense>
)
export const CollabWhiteboard = (props) => (
  <Suspense fallback={<Loading />}>
    <Collab {...props} />
  </Suspense>
)
export const DiagramView = (props) =>
  props.value ? (
    <Suspense fallback={<Loading height={props.height || 380} />}>
      <View {...props} />
    </Suspense>
  ) : (
    <div className="muted small">(no diagram)</div>
  )
