// Renders `inline code` and line breaks from the problem text without a markdown library.
function Text({ children }) {
  return String(children)
    .split('\n')
    .map((line, i) => (
      <p key={i}>
        {line.split(/(`[^`]+`)/).map((part, j) =>
          part.startsWith('`') && part.endsWith('`') ? <code key={j}>{part.slice(1, -1)}</code> : part,
        )}
      </p>
    ))
}

export default function ProblemPanel({ problems, problemId, onSelect }) {
  const problem = problems.find((p) => p.id === problemId) || problems[0]
  if (!problem) return <aside className="problem" />

  return (
    <aside className="problem">
      <select className="problem-select" value={problem.id} onChange={(e) => onSelect(e.target.value)}>
        {problems.map((p, i) => (
          <option key={p.id} value={p.id}>
            {i + 1}. {p.title}
          </option>
        ))}
      </select>
      <div className="problem-body">
        <h2>{problem.title}</h2>
        <div className="tags">
          <span className={`tag ${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
          <span className="tag">{problem.category}</span>
        </div>
        <Text>{problem.description}</Text>

        {problem.examples.map((ex, i) => (
          <div key={i} className="example">
            <div className="example-label">Example {i + 1}</div>
            <pre>
              <b>Input:</b> {ex.input}
              {'\n'}
              <b>Output:</b> {ex.output}
            </pre>
          </div>
        ))}

        <div className="example-label">Constraints</div>
        <ul>
          {problem.constraints.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
