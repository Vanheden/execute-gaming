// Earned achievement badges. `badges` come decorated from the API
// ({ code, name, icon, desc, auto?/grantedAt? }).
export default function Badges({ badges, size, max }) {
  if (!badges?.length) return null
  const shown = max ? badges.slice(0, max) : badges
  const extra = max && badges.length > max ? badges.length - max : 0
  return (
    <div className={`badges ${size === 'sm' ? 'badges--sm' : ''}`}>
      {shown.map((b) => (
        <span key={b.code} className="ach" title={b.desc ? `${b.name} — ${b.desc}` : b.name}>
          <span className="ach__icon" aria-hidden="true">
            {b.icon}
          </span>
          <span className="ach__name">{b.name}</span>
        </span>
      ))}
      {extra > 0 && <span className="ach ach--more">+{extra}</span>}
    </div>
  )
}
