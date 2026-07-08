import { community } from '../data/servers.js'

export default function Community() {
  return (
    <section className="section section--alt" id="community">
      <div className="container community">
        <div className="community__text">
          <p className="section__eyebrow">Community</p>
          <h2 className="section__title">More than just servers</h2>
          <p className="section__lead">
            Find teammates, join events, report issues, and hang out between matches. Our Discord
            is where it all happens — everyone's welcome.
          </p>
          <div className="hero__actions">
            <a className="btn btn--lg" href={community.discord} target="_blank" rel="noreferrer">
              Join the Discord
            </a>
            {community.steamGroup ? (
              <a
                className="btn btn--ghost btn--lg"
                href={community.steamGroup}
                target="_blank"
                rel="noreferrer"
              >
                Steam Group
              </a>
            ) : null}
          </div>
        </div>

        <ul className="community__perks">
          <li>
            <span className="community__icon">⚔️</span>
            <div>
              <h4>Matchmaking &amp; LFG</h4>
              <p>Find a duo or a full team in seconds.</p>
            </div>
          </li>
          <li>
            <span className="community__icon">🏆</span>
            <div>
              <h4>Events &amp; tournaments</h4>
              <p>Regular in-house games with prizes and bragging rights.</p>
            </div>
          </li>
          <li>
            <span className="community__icon">🛠️</span>
            <div>
              <h4>Active admins</h4>
              <p>Fair play enforced, issues handled fast.</p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  )
}
