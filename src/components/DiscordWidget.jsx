import { useEffect, useState } from 'react'
import { community } from '../data/servers.js'

const DOT = { online: '#3ba55d', idle: '#faa81a', dnd: '#ed4245', offline: '#747f8d' }

export default function DiscordWidget() {
  const [widget, setWidget] = useState(undefined) // undefined = loading, null = unavailable

  useEffect(() => {
    let live = true
    const load = () =>
      fetch('/api/discord/widget')
        .then((r) => (r.ok ? r.json() : { widget: null }))
        .then((d) => live && setWidget(d.widget))
        .catch(() => live && setWidget(null))
    load()
    const t = setInterval(load, 60_000) // refresh once a minute
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])

  // Widget disabled / not configured → don't clutter the page.
  if (widget === null) return null

  const online = widget?.online ?? 0
  const members = widget?.members || []
  const invite = widget?.invite || community.discord

  return (
    <div className="dwidget">
      <div className="dwidget__head">
        <span className="dwidget__pulse" aria-hidden="true" />
        <span className="dwidget__count">
          {widget === undefined ? 'Loading…' : `${online} online now`}
        </span>
        <span className="dwidget__label">on Discord</span>
      </div>

      {members.length > 0 && (
        <ul className="dwidget__list">
          {members.map((m) => (
            <li key={m.id} className="dwidget__member">
              <span className="dwidget__avatarwrap">
                {m.avatar ? (
                  <img className="dwidget__avatar" src={m.avatar} alt="" loading="lazy" />
                ) : (
                  <span className="dwidget__avatar dwidget__avatar--ph">
                    {m.username?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
                <span
                  className="dwidget__status"
                  style={{ background: DOT[m.status] || DOT.online }}
                  title={m.status}
                />
              </span>
              <span className="dwidget__uname">
                {m.username}
                {m.game && <span className="dwidget__game">{m.game}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <a className="btn btn--sm dwidget__join" href={invite} target="_blank" rel="noreferrer">
        Join the Discord
      </a>
    </div>
  )
}
