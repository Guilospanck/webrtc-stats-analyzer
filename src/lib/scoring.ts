import type { Track } from './types'

export type Thresholds = {
  jitterMs: { good: number; bad: number }
  rttMs: { good: number; bad: number }
  packetLossPct: { good: number; bad: number }
  fps: { bad: number; good: number }
  freezeCount: { good: number; bad: number }
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  jitterMs: { good: 30, bad: 100 },
  rttMs: { good: 300, bad: 600 },
  packetLossPct: { good: 2, bad: 5 },
  fps: { bad: 10, good: 30 },
  freezeCount: { good: 0, bad: 3 },
}

export function scoreLowerIsBetter(value: number, goodMax: number, badMin: number): number {
  if (value <= goodMax) return 100
  if (value >= badMin) return 0
  const ratio = (badMin - value) / (badMin - goodMax)
  return Math.round(ratio * 100)
}

export function scoreHigherIsBetter(value: number, badMax: number, goodMin: number): number {
  if (value <= badMax) return 0
  if (value >= goodMin) return 100
  const ratio = (value - badMax) / (goodMin - badMax)
  return Math.round(ratio * 100)
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sum = values.reduce((acc, item) => acc + item, 0)
  return sum / values.length
}

function resolutionTargetKbps(width?: number, height?: number): number {
  const w = width ?? 0
  const h = height ?? 0
  if (w >= 1280 || h >= 720) return 1500
  if (w >= 640 || h >= 480) return 600
  return 300
}

export function computeTrackScore(track: Track): number {
  const scores: number[] = []

  const jitterAvg = average(track.metrics.jitterMs.values)
  if (jitterAvg !== undefined) {
    scores.push(scoreLowerIsBetter(jitterAvg, DEFAULT_THRESHOLDS.jitterMs.good, DEFAULT_THRESHOLDS.jitterMs.bad))
  }

  const rttAvg = average(track.metrics.rttMs.values)
  if (rttAvg !== undefined) {
    scores.push(scoreLowerIsBetter(rttAvg, DEFAULT_THRESHOLDS.rttMs.good, DEFAULT_THRESHOLDS.rttMs.bad))
  }

  const lossAvg = average(track.metrics.packetLossPct.values)
  if (lossAvg !== undefined) {
    scores.push(scoreLowerIsBetter(lossAvg, DEFAULT_THRESHOLDS.packetLossPct.good, DEFAULT_THRESHOLDS.packetLossPct.bad))
  }

  const fpsAvg = average(track.metrics.fps.values)
  if (fpsAvg !== undefined) {
    scores.push(scoreHigherIsBetter(fpsAvg, DEFAULT_THRESHOLDS.fps.bad, DEFAULT_THRESHOLDS.fps.good))
  }

  const bitrateAvg = average(track.metrics.bitrateKbps.values)
  if (bitrateAvg !== undefined) {
    const width = average(track.metrics.width.values)
    const height = average(track.metrics.height.values)
    const target = resolutionTargetKbps(width, height)
    scores.push(scoreHigherIsBetter(bitrateAvg, target * 0.5, target))
  }

  const freezeMax = track.metrics.freezeCount.values.length
    ? Math.max(...track.metrics.freezeCount.values)
    : undefined
  if (freezeMax !== undefined) {
    scores.push(scoreLowerIsBetter(freezeMax, DEFAULT_THRESHOLDS.freezeCount.good, DEFAULT_THRESHOLDS.freezeCount.bad))
  }

  if (scores.length === 0) return 0
  const total = scores.reduce((acc, item) => acc + item, 0)
  return Math.round(total / scores.length)
}
