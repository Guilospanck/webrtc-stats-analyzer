import { detectFormat } from './detectFormat'
import { parseRtcstatsDump } from './parseRtcstats'
import { parseWebrtcInternalsDump } from './parseWebrtcInternals'
import type { Session } from '../types'

export function parseStatsDump(content: string): Session {
  const format = detectFormat(content)
  if (format === 'rtcstats') {
    return parseRtcstatsDump(content)
  }
  return parseWebrtcInternalsDump(content)
}
