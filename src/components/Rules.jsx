import { linkProps } from '../lib/router.js'

const rules = [
  {
    title: 'Respect everyone',
    body: 'No harassment, hate speech, or discrimination. Treat players the way you want to be treated.',
  },
  {
    title: 'No cheating',
    body: 'Cheats, hacks, exploits, or third-party advantages mean an instant, permanent ban.',
  },
  {
    title: 'Play fair',
    body: 'No griefing on PvE. On PvP, keep it competitive — raid and fight, don’t harass.',
  },
  {
    title: 'Listen to admins',
    body: 'Admin decisions are final in the moment. Disagree? Bring it up calmly in Discord.',
  },
]

export default function Rules() {
  return (
    <section className="section" id="rules">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">The basics</p>
          <h2 className="section__title">Community rules</h2>
          <p className="section__lead">
            Keep it simple: be cool, play fair, and let everyone have a good time.
          </p>
        </div>

        <ol className="rules">
          {rules.map((r, i) => (
            <li key={r.title} className="rules__item">
              <span className="rules__num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h4>{r.title}</h4>
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rules__cta">
          <a className="btn" {...linkProps('/rules')}>
            Full Duo PvP rules →
          </a>
        </div>
      </div>
    </section>
  )
}
