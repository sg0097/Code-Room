import Icon from './Icon'

// A picture of CodeRoom at work, drawn in HTML: the multi-file editor, a teammate's cursor,
// the AI review and the live room. Decorative only (aria-hidden).
const CODE = [
  [['k', 'public class '], ['t', 'ParkingLot'], ['p', ' {']],
  [['p', '  '], ['k', 'private final '], ['t', 'Map'], ['p', '<'], ['t', 'Level'], ['p', ', '], ['t', 'List'], ['p', '<'], ['t', 'Spot'], ['p', '>> spots;']],
  [['p', '']],
  [['p', '  '], ['k', 'public '], ['t', 'Ticket '], ['f', 'park'], ['p', '('], ['t', 'Vehicle '], ['p', 'v) {']],
  [['p', '    '], ['t', 'Spot '], ['p', 's = '], ['f', 'findFree'], ['p', '(v.'], ['f', 'size'], ['p', '());'], ['cur', '']],
  [['p', '    '], ['k', 'if '], ['p', '(s == '], ['k', 'null'], ['p', ') '], ['k', 'throw new '], ['t', 'LotFullException'], ['p', '();']],
  [['p', '    '], ['k', 'return '], ['t', 'Ticket'], ['p', '.'], ['f', 'issue'], ['p', '(s, v, clock.'], ['f', 'now'], ['p', '());']],
  [['p', '  }']],
  [['p', '}']],
]

export default function HeroMockup() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-glow" />
      <div className="mock-win">
        <div className="mock-bar">
          <span className="mock-dots"><i /><i /><i /></span>
          <span className="mock-tab on">ParkingLot.java</span>
          <span className="mock-tab">Spot.java</span>
          <span className="mock-tab">Ticket.java</span>
        </div>
        <div className="mock-body">
          <div className="mock-tree">
            <span>▾ src</span>
            <span className="in on">ParkingLot.java</span>
            <span className="in">Spot.java</span>
            <span className="in">Ticket.java</span>
            <span>▸ model</span>
          </div>
          <pre className="mock-code">
            {CODE.map((line, i) => (
              <div key={i}>
                <span className="ln">{i + 1}</span>
                {line.map(([k, t], j) => (k === 'cur' ? <span key={j} className="mock-cursor"><em>Asha</em></span> : <span key={j} className={`c-${k}`}>{t}</span>))}
              </div>
            ))}
          </pre>
        </div>
      </div>
      <div className="mock-float mock-ai">
        <span className="mock-ai-icon"><Icon name="sparkles" size={14} /></span>
        <div>
          <b>AI review · 4/5</b>
          <span>Good approach. Add a test for when the lot is full.</span>
        </div>
      </div>
      <div className="mock-float mock-chat">
        <i style={{ background: '#12a28f' }}>R</i>
        <span>What if two cars grab the last spot at once?</span>
      </div>
      <div className="mock-float mock-live">
        <span className="live-dot" /> Live room · 2 people
        <span className="mock-faces"><i style={{ background: '#f0603f' }}>A</i><i style={{ background: '#12a28f' }}>R</i></span>
      </div>
    </div>
  )
}
