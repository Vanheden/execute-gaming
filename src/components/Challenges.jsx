import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

// Rotating daily + weekly objectives. Progress is tracked automatically from kills;
// clearing one awards Challenge Points (a separate score) and shouts it in-game.
const hrefFor = (x) => (x.member ? `/u/${x.member.key}` : `/p/${x.steamId}`)

function ChallengeCard({ c, kind }) {
  if (!c) return null
  return (
    <div className={`chal__card chal__card--${kind}`}>
      <div className="chal__head">
        <span className="chal__scope">{kind === 'daily' ? 'Today' : 'This week'}</span>
        <span className="chal__bonus">+{c.bonus} CP</span>
      </div>
      <h3 className="chal__title">{c.title}</h3>
      <div className="chal__clears">
        {c.clears.length === 0 ? (
          <span className="chal__none">Be the first to clear it.</span>
        ) : (
          <>
            <span className="chal__clabel">🩸 {c.clears.length} cleared</span>
            <span className="chal__names">
              {c.clears.slice(0, 6).map((x, i) => (
                <span key={x.steamId}>
                  {i > 0 && ' · '}
                  <a className="chal__name" {...linkProps(hrefFor(x))}>
                    {x.name}
                  </a>
                </span>
              ))}
              {c.clears.length > 6 && <span className="chal__more"> +{c.clears.length - 6}</span>}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default function Challenges() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let live = true
    fetch('/api/challenges')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
  }, [])

  if (!data || (!data.daily && !data.weekly)) return null

  return (
    <section className="section challenges" id="challenges">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Rotating objectives</p>
          <h2 className="section__title">Challenges</h2>
          <p className="section__lead">
            Clear the daily and weekly challenge for Challenge Points and bragging rights. Progress is
            tracked automatically as you play — new ones rotate in on their own.
          </p>
        </div>

        <div className="chal__grid">
          <ChallengeCard c={data.daily} kind="daily" />
          <ChallengeCard c={data.weekly} kind="weekly" />

          <div className="chal__card chal__card--champs">
            <div className="chal__head">
              <span className="chal__scope">🏆 Challenge Champions</span>
            </div>
            {data.champions?.length ? (
              <ol className="chal__champs">
                {data.champions.slice(0, 5).map((c, i) => (
                  <li className="chal__champ" key={c.steamId}>
                    <span className="chal__cpos">{i + 1}</span>
                    <a className="chal__cname" {...linkProps(hrefFor(c))} title={c.name}>
                      {c.name}
                    </a>
                    <span className="chal__cpts">{c.points.toLocaleString()} CP</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="chal__none">No champions yet — clear a challenge to top the board.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
