import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import Turnstile from './Turnstile.jsx'

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.055c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
  </svg>
)

const SteamIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
  </svg>
)

export default function LoginModal({ open, onClose }) {
  const { providers, turnstile } = useAuth()
  const [token, setToken] = useState(null)
  const onVerify = useCallback((t) => setToken(t), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset the challenge each time the modal reopens so a stale token isn't reused.
  useEffect(() => {
    if (!open) setToken(null)
  }, [open])

  if (!open) return null

  const noneEnabled = !providers.discord && !providers.steam
  // When Turnstile is on, the OAuth links stay disabled until the widget yields a
  // token, which we pass to the backend as ?ts= for server-side verification.
  const gated = turnstile?.enabled
  const ready = !gated || !!token
  const authHref = (base) => (ready ? (gated ? `${base}?ts=${encodeURIComponent(token)}` : base) : undefined)

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <img className="modal__logo" src="/logo.svg" alt="" />
        <h3 className="modal__title">Join Execute-Gaming</h3>
        <p className="modal__lead">Sign in or create your account in one click.</p>

        <div className="modal__providers">
          <a
            className={`oauth oauth--discord ${providers.discord && ready ? '' : 'oauth--disabled'}`}
            href={providers.discord ? authHref('/auth/discord') : undefined}
            aria-disabled={!providers.discord || !ready}
          >
            <DiscordIcon />
            Continue with Discord
          </a>
          <a
            className={`oauth oauth--steam ${providers.steam && ready ? '' : 'oauth--disabled'}`}
            href={providers.steam ? authHref('/auth/steam') : undefined}
            aria-disabled={!providers.steam || !ready}
          >
            <SteamIcon />
            Continue with Steam
          </a>
        </div>

        {gated && (
          <div className="modal__captcha">
            <Turnstile onVerify={onVerify} />
          </div>
        )}

        {noneEnabled && (
          <p className="modal__note">
            No providers are configured yet. Add API credentials in the server’s <code>.env</code>{' '}
            file (see README) and restart the backend.
          </p>
        )}
        <p className="modal__fine">
          By continuing you agree to play nice and follow the community rules.
        </p>
      </div>
    </div>
  )
}
