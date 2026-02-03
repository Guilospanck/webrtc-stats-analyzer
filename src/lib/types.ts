export type TrackKind = 'audio' | 'video'
export type TrackDirection = 'inbound' | 'outbound'

export interface MetricSeries {
  timestamps: number[]
  values: number[]
}

export interface TrackMetrics {
  bitrateKbps: MetricSeries
  jitterMs: MetricSeries
  rttMs: MetricSeries
  packetLossPct: MetricSeries
  fps: MetricSeries
  width: MetricSeries
  height: MetricSeries
  freezeCount: MetricSeries
}

export interface Track {
  id: string
  kind: TrackKind
  direction: TrackDirection
  metrics: TrackMetrics
}

export interface PeerConnection {
  id: string
  tracks: Track[]
}

export interface Session {
  peerConnections: PeerConnection[]
}

export function createEmptySeries(): MetricSeries {
  return { timestamps: [], values: [] }
}

export function createEmptyMetrics(): TrackMetrics {
  return {
    bitrateKbps: createEmptySeries(),
    jitterMs: createEmptySeries(),
    rttMs: createEmptySeries(),
    packetLossPct: createEmptySeries(),
    fps: createEmptySeries(),
    width: createEmptySeries(),
    height: createEmptySeries(),
    freezeCount: createEmptySeries(),
  }
}
