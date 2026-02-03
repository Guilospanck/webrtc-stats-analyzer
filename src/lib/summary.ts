import { DEFAULT_THRESHOLDS, computeTrackScore, scoreHigherIsBetter, scoreLowerIsBetter } from './scoring'
import type { Session, Track } from './types'

export type MetricSummary = {
  average?: number
  p50?: number
  p95?: number
}

export type TrackSummary = {
  track: Track
  score: number
  metrics: Record<string, MetricSummary>
}

export type Issue = {
  trackId: string
  kind: string
  direction: string
  metric: string
  score: number
  detail: string
}

export type SessionSummary = {
  overallScore: number
  issues: Issue[]
  trackSummaries: TrackSummary[]
}

function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((acc, item) => acc + item, 0) / values.length
}

function summarize(values: number[]): MetricSummary {
  return {
    average: average(values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  }
}

function resolutionTargetKbps(width?: number, height?: number): number {
  const w = width ?? 0
  const h = height ?? 0
  if (w >= 1280 || h >= 720) return 1500
  if (w >= 640 || h >= 480) return 600
  return 300
}

function computeMetricScores(track: Track): Record<string, number | undefined> {
  const scores: Record<string, number | undefined> = {}
  const jitterAvg = average(track.metrics.jitterMs.values)
  if (jitterAvg !== undefined) {
    scores.jitterMs = scoreLowerIsBetter(jitterAvg, DEFAULT_THRESHOLDS.jitterMs.good, DEFAULT_THRESHOLDS.jitterMs.bad)
  }

  const rttAvg = average(track.metrics.rttMs.values)
  if (rttAvg !== undefined) {
    scores.rttMs = scoreLowerIsBetter(rttAvg, DEFAULT_THRESHOLDS.rttMs.good, DEFAULT_THRESHOLDS.rttMs.bad)
  }

  const lossAvg = average(track.metrics.packetLossPct.values)
  if (lossAvg !== undefined) {
    scores.packetLossPct = scoreLowerIsBetter(
      lossAvg,
      DEFAULT_THRESHOLDS.packetLossPct.good,
      DEFAULT_THRESHOLDS.packetLossPct.bad
    )
  }

  const fpsAvg = average(track.metrics.fps.values)
  if (fpsAvg !== undefined) {
    scores.fps = scoreHigherIsBetter(fpsAvg, DEFAULT_THRESHOLDS.fps.bad, DEFAULT_THRESHOLDS.fps.good)
  }

  const bitrateAvg = average(track.metrics.bitrateKbps.values)
  if (bitrateAvg !== undefined) {
    const width = average(track.metrics.width.values)
    const height = average(track.metrics.height.values)
    const target = resolutionTargetKbps(width, height)
    scores.bitrateKbps = scoreHigherIsBetter(bitrateAvg, target * 0.5, target)
  }

  const freezeMax = track.metrics.freezeCount.values.length
    ? Math.max(...track.metrics.freezeCount.values)
    : undefined
  if (freezeMax !== undefined) {
    scores.freezeCount = scoreLowerIsBetter(
      freezeMax,
      DEFAULT_THRESHOLDS.freezeCount.good,
      DEFAULT_THRESHOLDS.freezeCount.bad
    )
  }

  return scores
}

export function computeSessionSummary(session: Session): SessionSummary {
  const trackSummaries: TrackSummary[] = []
  const issues: Issue[] = []

  for (const pc of session.peerConnections) {
    for (const track of pc.tracks) {
      const score = computeTrackScore(track)
      const metrics: Record<string, MetricSummary> = {
        bitrateKbps: summarize(track.metrics.bitrateKbps.values),
        jitterMs: summarize(track.metrics.jitterMs.values),
        rttMs: summarize(track.metrics.rttMs.values),
        packetLossPct: summarize(track.metrics.packetLossPct.values),
        fps: summarize(track.metrics.fps.values),
        width: summarize(track.metrics.width.values),
        height: summarize(track.metrics.height.values),
        freezeCount: summarize(track.metrics.freezeCount.values),
      }

      trackSummaries.push({ track, score, metrics })

      const metricScores = computeMetricScores(track)
      for (const [metric, metricScore] of Object.entries(metricScores)) {
        if (metricScore === undefined) continue
        issues.push({
          trackId: track.id,
          kind: track.kind,
          direction: track.direction,
          metric,
          score: metricScore,
          detail: `${metric} score ${metricScore}`,
        })
      }
    }
  }

  const videoScores = trackSummaries
    .filter((summary) => summary.track.kind === 'video')
    .map((summary) => summary.score)
  const audioScores = trackSummaries
    .filter((summary) => summary.track.kind === 'audio')
    .map((summary) => summary.score)

  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  const videoScore = avg(videoScores)
  const audioScore = avg(audioScores)
  const overallScore = Math.round(videoScore * 0.7 + audioScore * 0.3)

  issues.sort((a, b) => a.score - b.score)

  return {
    overallScore,
    issues: issues.slice(0, 5),
    trackSummaries,
  }
}
