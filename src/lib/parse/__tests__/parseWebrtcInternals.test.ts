import { readFileSync } from 'node:fs'
import { parseWebrtcInternalsDump } from '../parseWebrtcInternals'

describe('parseWebrtcInternalsDump', () => {
  test('extracts peer connections and inbound tracks', () => {
    const content = readFileSync('webrtc_internals_dump.txt', 'utf-8')
    const session = parseWebrtcInternalsDump(content)

    const pcIds = session.peerConnections.map((pc) => pc.id)
    expect(pcIds).toContain('92-1')
    expect(pcIds).toContain('94-1')

    const pc = session.peerConnections.find((item) => item.id === '92-1')
    expect(pc).toBeTruthy()

    const audioInbound = pc?.tracks.find(
      (track) => track.kind === 'audio' && track.direction === 'inbound'
    )
    expect(audioInbound).toBeTruthy()
    expect(audioInbound?.metrics.jitterMs.values.length).toBeGreaterThan(2)
  })
})
