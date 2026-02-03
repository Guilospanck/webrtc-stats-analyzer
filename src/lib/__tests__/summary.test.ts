import { computeSessionSummary } from '../summary'
import { createEmptyMetrics, type Session, type Track } from '../types'

describe('computeSessionSummary', () => {
  test('computes weighted score and issues list', () => {
    const videoTrack: Track = {
      id: 'video-inbound',
      kind: 'video',
      direction: 'inbound',
      metrics: createEmptyMetrics(),
    }
    videoTrack.metrics.jitterMs.values = [15, 20]
    videoTrack.metrics.rttMs.values = [150, 160]
    videoTrack.metrics.packetLossPct.values = [1, 1.5]
    videoTrack.metrics.bitrateKbps.values = [1200, 1300]
    videoTrack.metrics.fps.values = [24, 25]
    videoTrack.metrics.width.values = [640, 640]
    videoTrack.metrics.height.values = [480, 480]
    videoTrack.metrics.freezeCount.values = [0, 0]

    const audioTrack: Track = {
      id: 'audio-inbound',
      kind: 'audio',
      direction: 'inbound',
      metrics: createEmptyMetrics(),
    }
    audioTrack.metrics.jitterMs.values = [80, 90]
    audioTrack.metrics.rttMs.values = [500, 520]
    audioTrack.metrics.packetLossPct.values = [4, 5]

    const session: Session = {
      peerConnections: [
        {
          id: 'pc-1',
          tracks: [videoTrack, audioTrack],
        },
      ],
    }

    const summary = computeSessionSummary(session)
    expect(summary.overallScore).toBeGreaterThan(0)
    expect(summary.overallScore).toBeLessThan(100)
    expect(summary.issues.length).toBeGreaterThan(0)
  })
})
