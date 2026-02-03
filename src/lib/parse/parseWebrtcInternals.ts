import { createEmptyMetrics, type PeerConnection, type Session, type Track, type TrackKind } from '../types'

type StatsSeries = {
  startTime?: string
  endTime?: string
  statsType?: string
  values?: Array<string | number | boolean | null> | string
}

type InternalsPc = {
  stats: Record<string, StatsSeries>
}

type InternalsFile = {
  PeerConnections: Record<string, InternalsPc>
}

function parseTime(value?: string): number | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : ms
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeValues(values: StatsSeries['values']): unknown[] {
  if (!values) return []
  if (Array.isArray(values)) return values
  if (typeof values === 'string') {
    const trimmed = values.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
  }
  return []
}

function buildTimestamps(start: string | undefined, end: string | undefined, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const startMs = parseTime(start)
  const endMs = parseTime(end)
  if (startMs !== undefined && endMs !== undefined && endMs >= startMs) {
    const step = (endMs - startMs) / (count - 1)
    return Array.from({ length: count }, (_, i) => startMs + step * i)
  }
  return Array.from({ length: count }, (_, i) => i)
}

function pushSeries(series: { timestamps: number[]; values: number[] }, time: number, value: number) {
  series.timestamps.push(time)
  series.values.push(value)
}

function ensureTrack(pc: PeerConnection, id: string, kind: TrackKind, direction: 'inbound' | 'outbound'): Track {
  const existing = pc.tracks.find((track) => track.id === id)
  if (existing) return existing
  const track: Track = {
    id,
    kind,
    direction,
    metrics: createEmptyMetrics(),
  }
  pc.tracks.push(track)
  return track
}

function computeBitrateSeries(bytes: number[], timestamps: number[]) {
  const series = { timestamps: [] as number[], values: [] as number[] }
  for (let i = 1; i < bytes.length; i += 1) {
    const deltaBytes = bytes[i] - bytes[i - 1]
    const deltaMs = timestamps[i] - timestamps[i - 1]
    if (deltaMs > 0 && deltaBytes >= 0) {
      const kbps = (deltaBytes * 8) / deltaMs
      series.timestamps.push(timestamps[i])
      series.values.push(kbps)
    }
  }
  return series
}

function computePacketLossSeries(packetsLost: number[], packetsReceived: number[], timestamps: number[]) {
  const series = { timestamps: [] as number[], values: [] as number[] }
  const len = Math.min(packetsLost.length, packetsReceived.length, timestamps.length)
  for (let i = 0; i < len; i += 1) {
    const total = packetsLost[i] + packetsReceived[i]
    if (total > 0) {
      series.timestamps.push(timestamps[i])
      series.values.push((packetsLost[i] / total) * 100)
    }
  }
  return series
}

export function parseWebrtcInternalsDump(content: string): Session {
  const parsed = JSON.parse(content) as InternalsFile
  const pcs: PeerConnection[] = []

  for (const [pcId, pcData] of Object.entries(parsed.PeerConnections ?? {})) {
    const pc: PeerConnection = { id: pcId, tracks: [] }

    const grouped: Record<string, Record<string, StatsSeries>> = {}
    for (const [key, series] of Object.entries(pcData.stats ?? {})) {
      const splitIndex = key.lastIndexOf('-')
      if (splitIndex <= 0) continue
      const statId = key.slice(0, splitIndex)
      const metric = key.slice(splitIndex + 1)
      grouped[statId] ??= {}
      grouped[statId][metric] = series
    }

    for (const [statId, metrics] of Object.entries(grouped)) {
      const typeValue = normalizeValues(metrics.type?.values)[0]
      const kindValue = normalizeValues(metrics.kind?.values)[0]
      const type = typeof typeValue === 'string' ? typeValue : undefined
      const kind = kindValue === 'audio' || kindValue === 'video' ? kindValue : undefined

      if (!type || !kind) continue

      if (type === 'inbound-rtp' || type === 'outbound-rtp') {
        const direction = type === 'inbound-rtp' ? 'inbound' : 'outbound'
        const track = ensureTrack(pc, `${statId}:${direction}`, kind, direction)

        const bytesKey = direction === 'inbound' ? 'bytesReceived' : 'bytesSent'
        const bytesSeries = metrics[bytesKey]
        const bytesValues = normalizeValues(bytesSeries?.values).map(toNumber).filter((v): v is number => v !== undefined)
        const timestamps = buildTimestamps(bytesSeries?.startTime, bytesSeries?.endTime, bytesValues.length)
        if (bytesValues.length > 1) {
          const bitrate = computeBitrateSeries(bytesValues, timestamps)
          track.metrics.bitrateKbps = bitrate
        }

        const jitterSeries = metrics.jitter
        if (jitterSeries?.values) {
          const jitterValues = normalizeValues(jitterSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
          const jitterTimes = buildTimestamps(jitterSeries.startTime, jitterSeries.endTime, jitterValues.length)
          jitterValues.forEach((value, index) => {
            pushSeries(track.metrics.jitterMs, jitterTimes[index], value * 1000)
          })
        }

        const packetsLostSeries = metrics.packetsLost
        const packetsReceivedSeries = metrics.packetsReceived
        if (packetsLostSeries?.values && packetsReceivedSeries?.values) {
          const lostValues = normalizeValues(packetsLostSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
          const recvValues = normalizeValues(packetsReceivedSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
          const lossTimes = buildTimestamps(packetsLostSeries.startTime, packetsLostSeries.endTime, lostValues.length)
          const lossSeries = computePacketLossSeries(lostValues, recvValues, lossTimes)
          track.metrics.packetLossPct = lossSeries
        }

        const fpsSeries = metrics.framesPerSecond
        if (fpsSeries?.values) {
          const fpsValues = normalizeValues(fpsSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
          const fpsTimes = buildTimestamps(fpsSeries.startTime, fpsSeries.endTime, fpsValues.length)
          fpsValues.forEach((value, index) => {
            pushSeries(track.metrics.fps, fpsTimes[index], value)
          })
        }

        const widthSeries = metrics.frameWidth
        const heightSeries = metrics.frameHeight
        if (widthSeries?.values) {
          const widthValues = normalizeValues(widthSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
          const widthTimes = buildTimestamps(widthSeries.startTime, widthSeries.endTime, widthValues.length)
          widthValues.forEach((value, index) => {
            pushSeries(track.metrics.width, widthTimes[index], value)
          })
        }
        if (heightSeries?.values) {
          const heightValues = normalizeValues(heightSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
          const heightTimes = buildTimestamps(heightSeries.startTime, heightSeries.endTime, heightValues.length)
          heightValues.forEach((value, index) => {
            pushSeries(track.metrics.height, heightTimes[index], value)
          })
        }

        const freezeSeries = metrics.freezeCount
        if (freezeSeries?.values) {
          const freezeValues = normalizeValues(freezeSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
          const freezeTimes = buildTimestamps(freezeSeries.startTime, freezeSeries.endTime, freezeValues.length)
          freezeValues.forEach((value, index) => {
            pushSeries(track.metrics.freezeCount, freezeTimes[index], value)
          })
        }
      }

      if (type === 'remote-inbound-rtp') {
        const rttSeries = metrics.roundTripTime
        if (!rttSeries?.values) continue
        const rttValues = normalizeValues(rttSeries.values).map(toNumber).filter((v): v is number => v !== undefined)
        const rttTimes = buildTimestamps(rttSeries.startTime, rttSeries.endTime, rttValues.length)

        const targets = pc.tracks.filter(
          (track) => track.kind === kind && track.direction === 'inbound'
        )
        if (targets.length === 0) continue
        for (const track of targets) {
          rttValues.forEach((value, index) => {
            pushSeries(track.metrics.rttMs, rttTimes[index], value * 1000)
          })
        }
      }
    }

    pcs.push(pc)
  }

  return { peerConnections: pcs }
}
