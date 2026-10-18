import { useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, CaptureUpdateAction, getSceneVersion, reconcileElements, restoreElements } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

// Fonts are self-hosted (copied into public/ by scripts/copy-excalidraw-assets.mjs).
window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/'

// Things a challenge whiteboard doesn't need. Images are off because they'd be stored
// as large binary blobs that our sync and submissions don't carry.
const UI_OPTIONS = {
  canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: false },
  tools: { image: false },
}

const parse = (json) => {
  try {
    const arr = JSON.parse(json || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
const byIndex = (a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0)
const serialize = (elements) => {
  const live = elements.filter((el) => !el.isDeleted)
  return live.length ? JSON.stringify(live) : ''
}

/**
 * Single-user whiteboard (independent challenges). `value` is the stored JSON string;
 * onChange fires (debounced) only when shapes actually change, not on scroll/selection.
 */
export function SoloWhiteboard({ value, onChange, height = 540 }) {
  const initial = useMemo(() => ({ elements: restoreElements(parse(value), null), scrollToContent: true }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const version = useRef(getSceneVersion(initial.elements))
  const pending = useRef(null)
  const timer = useRef(null)
  const emit = useRef(onChange)
  emit.current = onChange

  useEffect(
    () => () => {
      // Flush the last stroke if the component goes away mid-debounce.
      clearTimeout(timer.current)
      if (pending.current) emit.current(serialize(pending.current))
    },
    [],
  )

  const handleChange = (elements) => {
    const v = getSceneVersion(elements)
    if (v === version.current) return
    version.current = v
    pending.current = elements
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      emit.current(serialize(pending.current))
      pending.current = null
    }, 400)
  }

  return (
    <div className="whiteboard" style={{ height }}>
      <Excalidraw initialData={initial} onChange={handleChange} theme="light" UIOptions={UI_OPTIONS} />
    </div>
  )
}

/**
 * Read-only render of a stored diagram (compare view, your locked submission).
 */
export function DiagramView({ value, height = 380 }) {
  const elements = useMemo(() => restoreElements(parse(value), null), [value])
  if (!elements.length) return <div className="muted small">(no diagram)</div>
  return (
    <div className="whiteboard readonly" style={{ height }}>
      <Excalidraw
        key={value.length} // re-mount when the diagram changes
        initialData={{ elements, scrollToContent: true }}
        viewModeEnabled
        zenModeEnabled
        theme="light"
        UIOptions={UI_OPTIONS}
      />
    </div>
  )
}

const LOCAL = Symbol('whiteboard-local') // Yjs transaction origin for our own edits

/**
 * Shared whiteboard in a room, synced through the room's Yjs document:
 *
 *   doc.getMap('whiteboard') : elementId → Excalidraw element (plain JSON)
 *
 * Local → shared: on change, write only elements whose version moved (batched every 60ms).
 * Shared → local: merge with Excalidraw's own reconcileElements (the logic excalidraw.com
 * uses for its collaboration), then updateScene without adding to the local undo history.
 * Deleted shapes stay in the map flagged isDeleted, so deletions sync like any other edit.
 * Persistence, reconnects and late joiners come for free from the room's Yjs setup.
 */
export function CollabWhiteboard({ doc, awareness, readOnly = false }) {
  const ymap = useMemo(() => doc.getMap('whiteboard'), [doc])
  const [api, setApi] = useState(null)
  const initial = useMemo(
    () => ({ elements: restoreElements([...ymap.values()].sort(byIndex), null), scrollToContent: true }),
    [ymap],
  )
  const version = useRef(getSceneVersion(initial.elements))
  const pending = useRef(null)
  const timer = useRef(null)

  const flush = () => {
    timer.current = null
    const elements = pending.current
    pending.current = null
    if (!elements) return
    doc.transact(() => {
      for (const el of elements) {
        const prev = ymap.get(el.id)
        if (!prev || prev.version < el.version || (prev.version === el.version && prev.versionNonce !== el.versionNonce)) {
          // Store a COPY: Excalidraw mutates its element objects in place while you drag.
          // Storing the live object would make `prev` and `el` the same object, so later
          // versions would never look newer and would never sync.
          ymap.set(el.id, JSON.parse(JSON.stringify(el)))
        }
      }
    }, LOCAL)
  }

  const handleChange = (elements) => {
    const v = getSceneVersion(elements)
    if (v === version.current) return
    version.current = v
    pending.current = elements
    if (!timer.current) timer.current = setTimeout(flush, 60)
  }

  // Remote edits → canvas.
  useEffect(() => {
    if (!api) return
    const apply = (_event, transaction) => {
      if (transaction.origin === LOCAL) return
      const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), [...ymap.values()], api.getAppState())
      version.current = getSceneVersion(merged)
      api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER })
    }
    ymap.observe(apply)
    // The doc may have synced between first render and the API being ready.
    apply(null, { origin: null })
    return () => ymap.unobserve(apply)
  }, [api, ymap])

  // Other people's pointers on the canvas, via Yjs awareness (not stored).
  useEffect(() => {
    if (!api || !awareness) return
    const render = () => {
      const collaborators = new Map()
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === doc.clientID || !state.user || !state.wbPointer) return
        collaborators.set(String(clientId), {
          username: state.user.name,
          pointer: state.wbPointer,
          button: state.wbButton || 'up',
          color: { background: state.user.color, stroke: state.user.color },
        })
      })
      api.updateScene({ collaborators })
    }
    awareness.on('change', render)
    render()
    return () => {
      awareness.off('change', render)
      awareness.setLocalStateField('wbPointer', null)
    }
  }, [api, awareness, doc])

  // Flush any last stroke when leaving the tab.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      flush()
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const lastPointer = useRef(0)
  const onPointerUpdate = ({ pointer, button }) => {
    const now = Date.now()
    if (!awareness || now - lastPointer.current < 50) return
    lastPointer.current = now
    awareness.setLocalStateField('wbPointer', { x: pointer.x, y: pointer.y, tool: pointer.tool })
    awareness.setLocalStateField('wbButton', button)
  }

  return (
    <div className="whiteboard fill">
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initial}
        onChange={readOnly ? undefined : handleChange}
        onPointerUpdate={onPointerUpdate}
        isCollaborating
        viewModeEnabled={readOnly}
        theme="light"
        UIOptions={UI_OPTIONS}
      />
    </div>
  )
}
