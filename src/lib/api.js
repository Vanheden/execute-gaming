// Tiny fetch helpers — always same-origin with the session cookie.
export async function apiGet(path) {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export async function apiSend(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg.error || String(res.status))
  }
  return res.json().catch(() => ({}))
}
