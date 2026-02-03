import { readFileSync } from 'node:fs'
import { parseRtcstatsDump } from '../parseRtcstats'

describe('parseRtcstatsDump', () => {
  test('extracts peer connections and inbound tracks', () => {
    const content = readFileSync('rtcstats_dump.txt', 'utf-8')
    const session = parseRtcstatsDump(content)

    const pcIds = session.peerConnections.map((pc) => pc.id)
    expect(pcIds).toContain('92-1')
    expect(pcIds).toContain('94-1')

    const pc = session.peerConnections.find((item) => item.id === '92-1')
    expect(pc).toBeTruthy()

    const videoInbound = pc?.tracks.find(
      (track) => track.kind === 'video' && track.direction === 'inbound'
    )
    expect(videoInbound).toBeTruthy()
    expect(videoInbound?.metrics.bitrateKbps.values.length).toBeGreaterThan(2)
  })
})
