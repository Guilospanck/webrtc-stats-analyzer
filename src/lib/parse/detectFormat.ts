export type StatsDumpFormat = 'rtcstats' | 'webrtc-internals'

export function detectFormat(content: string): StatsDumpFormat {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('RTCStatsDump')) {
    return 'rtcstats'
  }

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as { PeerConnections?: unknown }
    if (parsed && typeof parsed === 'object' && 'PeerConnections' in parsed) {
      return 'webrtc-internals'
    }
  }

  throw new Error('Unrecognized stats dump format')
}
