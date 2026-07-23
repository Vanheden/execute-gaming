// ---------------------------------------------------------------------------
// A2S (Steam server query) — live status + player count, straight from the game
// server's query port. Free and first-party: no BattleMetrics / third party.
// ---------------------------------------------------------------------------
// Sends an A2S_INFO request over UDP and parses the reply. Modern Source servers
// (V Rising included) gate A2S_INFO behind a challenge, so we resend with the
// challenge when asked. Resolves to { online, name, map, players, maxPlayers } or
// { online: false } on timeout / unreachable — never throws.
// ---------------------------------------------------------------------------
import dgram from 'node:dgram'

const A2S_INFO = Buffer.concat([
  Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
  Buffer.from('Source Engine Query\0', 'binary'),
])

export function queryA2S(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4')
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { sock.close() } catch { /* already closed */ }
      resolve(result)
    }
    const timer = setTimeout(() => finish({ online: false }), timeoutMs)

    const send = (challenge) => {
      const pkt = challenge ? Buffer.concat([A2S_INFO, challenge]) : A2S_INFO
      sock.send(pkt, port, host, (err) => { if (err) finish({ online: false }) })
    }

    sock.on('message', (msg) => {
      if (msg.length < 5) return
      const type = msg.readUInt8(4) // after the 0xFFFFFFFF single-packet header
      if (type === 0x41) {
        // Challenge — resend the query with the 4-byte challenge appended.
        send(msg.subarray(5, 9))
        return
      }
      if (type !== 0x49) return // not an A2S_INFO reply
      try {
        let o = 5
        o += 1 // protocol byte
        const readStr = () => {
          const start = o
          while (o < msg.length && msg[o] !== 0) o++
          const s = msg.toString('utf8', start, o)
          o++ // skip the null terminator
          return s
        }
        const name = readStr()
        const map = readStr()
        readStr() // folder
        readStr() // game
        o += 2 // Steam App ID (int16)
        const players = msg.readUInt8(o); o += 1
        const maxPlayers = msg.readUInt8(o); o += 1
        finish({ online: true, name, map, players, maxPlayers })
      } catch {
        finish({ online: false })
      }
    })
    sock.on('error', () => finish({ online: false }))
    send(null)
  })
}
