import { Link, useSearchParams } from 'react-router-dom'
import QuickChallenge from '../features/challenge/QuickChallenge'

/** /challenges/new?problem=<slug>&friend=<id>: the challenge card, full page. */
export default function NewChallenge() {
  const [params] = useSearchParams()
  return (
    <div className="narrow">
      <QuickChallenge problemSlug={params.get('problem')} friendId={params.get('friend')} />
      <p className="muted small center-text">Have your own question? <Link to="/challenges/custom">Write your own problem →</Link></p>
    </div>
  )
}
