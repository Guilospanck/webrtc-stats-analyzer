import { computeTrackScore, scoreHigherIsBetter, scoreLowerIsBetter } from '../scoring'
import { createEmptyMetrics, type Track } from '../types'

describe('scoring helpers', () => {
  test('scoreLowerIsBetter returns 100 at good threshold and 0 at bad threshold', () => {
    expect(scoreLowerIsBetter(20, 30, 100)).toBe(100)
    expect(scoreLowerIsBetter(100, 30, 100)).toBe(0)
  })

  test('scoreHigherIsBetter returns 0 at bad threshold and 100 at good threshold', () => {
    expect(scoreHigherIsBetter(10, 10, 30)).toBe(0)
    expect(scoreHigherIsBetter(30, 10, 30)).toBe(100)
  })
})

describe('computeTrackScore', () => {
  test('produces strong score for healthy video metrics', () => {
    const track: Track = {
      id: 'video-inbound',
      kind: 'video',
      direction: 'inbound',
      metrics: createEmptyMetrics(),
    }

    track.metrics.jitterMs.values = [10, 12, 11]
    track.metrics.rttMs.values = [120, 140, 130]
    track.metrics.packetLossPct.values = [0.5, 1.2, 0.8]
    track.metrics.bitrateKbps.values = [1200, 1300, 1250]
    track.metrics.fps.values = [24, 25, 23]
    track.metrics.width.values = [640, 640, 640]
    track.metrics.height.values = [480, 480, 480]
    track.metrics.freezeCount.values = [0, 0, 0]

    const score = computeTrackScore(track)
    expect(score).toBeGreaterThan(70)
  })
})
