import { useEffect, useState } from 'react'

function holderLabel(n) {
  if (n === 0) return 'Not earned yet'
  return `${n} member${n === 1 ? '' : 's'}`
}

export default function Achievements() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    fetch('/api/achievements')
      .then((r) => (r.ok ? r.json() : { achievements: [] }))
      .then((d) => setItems(d.achievements || []))
      .catch(() => setItems([]))
  }, [])

  if (items && items.length === 0) return null

  return (
    <section className="section" id="achievements">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Bragging rights</p>
          <h2 className="section__title">Achievements</h2>
          <p className="section__lead">
            Badges you earn by being part of the community. Some unlock
            automatically — others are handed out by the admins.
          </p>
        </div>

        {items === null ? (
          <p className="empty">Loading achievements…</p>
        ) : (
          <div className="achgrid">
            {items.map((a) => (
              <article
                key={a.code}
                className={`achcard ${a.holders === 0 ? 'achcard--locked' : ''}`}
              >
                <span className="achcard__icon" aria-hidden="true">
                  {a.icon}
                </span>
                <div className="achcard__body">
                  <h3 className="achcard__name">
                    {a.name}
                    <span className={`achcard__type achcard__type--${a.auto ? 'auto' : 'award'}`}>
                      {a.auto ? 'Automatic' : 'Awarded'}
                    </span>
                  </h3>
                  <p className="achcard__desc">{a.desc}</p>
                  <span className="achcard__holders">{holderLabel(a.holders)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
