import { readFileSync } from 'node:fs'
import { detectFormat } from '../detectFormat'

describe('detectFormat', () => {
  test('detects RTCStatsDump format', () => {
    const content = readFileSync('rtcstats_dump.txt', 'utf-8')
    expect(detectFormat(content)).toBe('rtcstats')
  })

  test('detects webrtc-internals format', () => {
    const content = readFileSync('webrtc_internals_dump.txt', 'utf-8')
    expect(detectFormat(content)).toBe('webrtc-internals')
  })
})
