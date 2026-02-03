import { createEmptyMetrics, type PeerConnection, type Session, type Track, type TrackKind } from '../types'

type RtcStatsEntry = {
  id: string
  type: string
  kind?: TrackKind
  timestamp?: number
  ssrc?: number
  trackIdentifier?: string
  bytesReceived?: number
  bytesSent?: number
  packetsLost?: number
  packetsReceived?: number
  jitter?: number
  roundTripTime?: number
  framesPerSecond?: number
  frameWidth?: number
  frameHeight?: number
  width?: number
  height?: number
  freezeCount?: number
}

type TrackAccumulator = {
  track: Track
  firstTimestamp?: number
  lastBytes?: number
  lastTimestamp?: number
}

const TRACK_PREFIX = 'track:'

function getTrackKey(stat: RtcStatsEntry, direction: 'inbound' | 'outbound'): string {
  if (stat.trackIdentifier) {
    return `${TRACK_PREFIX}${direction}:${stat.trackIdentifier}`
  }
  if (typeof stat.ssrc === 'number') {
    return `${TRACK_PREFIX}${direction}:${stat.ssrc}`
  }
  return `${TRACK_PREFIX}${direction}:${stat.id}`
}

function getRelativeTime(acc: TrackAccumulator, timestamp: number): number {
  if (acc.firstTimestamp === undefined) {
    acc.firstTimestamp = timestamp
  }
  return timestamp - acc.firstTimestamp
}

function pushSeries(series: { timestamps: number[]; values: number[] }, time: number, value: number) {
  series.timestamps.push(time)
  series.values.push(value)
}

function ensurePc(pcs: Map<string, PeerConnection>, id: string): PeerConnection {
  const existing = pcs.get(id)
  if (existing) return existing
  const pc: PeerConnection = { id, tracks: [] }
  pcs.set(id, pc)
  return pc
}

function ensureTrack(
  pc: PeerConnection,
  trackMap: Map<string, TrackAccumulator>,
  key: string,
  kind: TrackKind,
  direction: 'inbound' | 'outbound'
): TrackAccumulator {
  const existing = trackMap.get(key)
  if (existing) return existing
  const track: Track = {
    id: key,
    kind,
    direction,
    metrics: createEmptyMetrics(),
  }
  const acc: TrackAccumulator = { track }
  pc.tracks.push(track)
  trackMap.set(key, acc)
  return acc
}

function addInboundMetrics(acc: TrackAccumulator, stat: RtcStatsEntry) {
  if (!stat.timestamp) return
  const time = getRelativeTime(acc, stat.timestamp)

  if (typeof stat.jitter === 'number') {
    pushSeries(acc.track.metrics.jitterMs, time, stat.jitter * 1000)
  }

  if (typeof stat.packetsLost === 'number' && typeof stat.packetsReceived === 'number') {
    const total = stat.packetsLost + stat.packetsReceived
    if (total > 0) {
      pushSeries(acc.track.metrics.packetLossPct, time, (stat.packetsLost / total) * 100)
    }
  }

  if (typeof stat.framesPerSecond === 'number') {
    pushSeries(acc.track.metrics.fps, time, stat.framesPerSecond)
  }

  const width = stat.frameWidth ?? stat.width
  const height = stat.frameHeight ?? stat.height
  if (typeof width === 'number') {
    pushSeries(acc.track.metrics.width, time, width)
  }
  if (typeof height === 'number') {
    pushSeries(acc.track.metrics.height, time, height)
  }

  if (typeof stat.freezeCount === 'number') {
    pushSeries(acc.track.metrics.freezeCount, time, stat.freezeCount)
  }

  if (typeof stat.bytesReceived === 'number') {
    if (acc.lastBytes !== undefined && acc.lastTimestamp !== undefined) {
      const deltaBytes = stat.bytesReceived - acc.lastBytes
      const deltaMs = stat.timestamp - acc.lastTimestamp
      if (deltaMs > 0 && deltaBytes >= 0) {
        const kbps = (deltaBytes * 8) / deltaMs
        pushSeries(acc.track.metrics.bitrateKbps, time, kbps)
      }
    }
    acc.lastBytes = stat.bytesReceived
    acc.lastTimestamp = stat.timestamp
  }
}

function addOutboundMetrics(acc: TrackAccumulator, stat: RtcStatsEntry) {
  if (!stat.timestamp) return
  const time = getRelativeTime(acc, stat.timestamp)

  if (typeof stat.framesPerSecond === 'number') {
    pushSeries(acc.track.metrics.fps, time, stat.framesPerSecond)
  }

  const width = stat.frameWidth ?? stat.width
  const height = stat.frameHeight ?? stat.height
  if (typeof width === 'number') {
    pushSeries(acc.track.metrics.width, time, width)
  }
  if (typeof height === 'number') {
    pushSeries(acc.track.metrics.height, time, height)
  }

  if (typeof stat.bytesSent === 'number') {
    if (acc.lastBytes !== undefined && acc.lastTimestamp !== undefined) {
      const deltaBytes = stat.bytesSent - acc.lastBytes
      const deltaMs = stat.timestamp - acc.lastTimestamp
      if (deltaMs > 0 && deltaBytes >= 0) {
        const kbps = (deltaBytes * 8) / deltaMs
        pushSeries(acc.track.metrics.bitrateKbps, time, kbps)
      }
    }
    acc.lastBytes = stat.bytesSent
    acc.lastTimestamp = stat.timestamp
  }
}

function applyRtt(
  trackMap: Map<string, TrackAccumulator>,
  kind: TrackKind | undefined,
  timestamp: number | undefined,
  rttSeconds: number | undefined
) {
  if (!kind || timestamp === undefined || rttSeconds === undefined) return
  const candidates = [...trackMap.values()].filter(
    (acc) => acc.track.kind === kind && acc.track.direction === 'inbound'
  )
  if (candidates.length === 0) return
  for (const acc of candidates) {
    const time = getRelativeTime(acc, timestamp)
    pushSeries(acc.track.metrics.rttMs, time, rttSeconds * 1000)
  }
}

export function parseRtcstatsDump(content: string): Session {
  const lines = content.split(/\r?\n/)
  if (!lines[0]?.startsWith('RTCStatsDump')) {
    throw new Error('Not an RTCStatsDump file')
  }

  const pcs = new Map<string, PeerConnection>()
  const trackMaps = new Map<string, Map<string, TrackAccumulator>>()

  for (const line of lines) {
    if (!line.startsWith('[')) continue
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }

    if (!Array.isArray(event)) continue
    const [eventType, pcId, stats] = event
    if (eventType !== 'getStats' || typeof pcId !== 'string' || typeof stats !== 'object' || stats === null) {
      continue
    }

    const pc = ensurePc(pcs, pcId)
    const trackMap = trackMaps.get(pcId) ?? new Map<string, TrackAccumulator>()
    trackMaps.set(pcId, trackMap)

    for (const stat of Object.values(stats as Record<string, RtcStatsEntry>)) {
      if (!stat || typeof stat !== 'object') continue

      if (stat.type === 'inbound-rtp' && stat.kind) {
        const key = getTrackKey(stat, 'inbound')
        const acc = ensureTrack(pc, trackMap, key, stat.kind, 'inbound')
        addInboundMetrics(acc, stat)
      }

      if (stat.type === 'outbound-rtp' && stat.kind) {
        const key = getTrackKey(stat, 'outbound')
        const acc = ensureTrack(pc, trackMap, key, stat.kind, 'outbound')
        addOutboundMetrics(acc, stat)
      }

      if (stat.type === 'remote-inbound-rtp') {
        applyRtt(trackMap, stat.kind, stat.timestamp, stat.roundTripTime)
      }
    }
  }

  return { peerConnections: Array.from(pcs.values()) }
}
