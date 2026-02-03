import { useMemo, useState } from 'react'
import './App.css'
import type { PeerConnection, Session, Track } from './lib/types'
import { parseStatsDump } from './lib/parse'
import { computeSessionSummary } from './lib/summary'
import { MetricChart } from './components/MetricChart'

const TABS = ['summary', 'deep', 'raw'] as const

type TabKey = (typeof TABS)[number]

const formatNumber = (value: number | undefined, digits = 2) => {
  if (value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

const trackLabel = (track: Track) => `${track.kind.toUpperCase()} ${track.direction}`

const pickDefaultTrackId = (pc?: PeerConnection) => {
  if (!pc || pc.tracks.length === 0) return ''
  const videoInbound = pc.tracks.find(
    (track) => track.kind === 'video' && track.direction === 'inbound'
  )
  return (videoInbound ?? pc.tracks[0]).id
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [selectedPcId, setSelectedPcId] = useState<string>('')
  const [selectedTrackId, setSelectedTrackId] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')

  const summary = useMemo(() => (session ? computeSessionSummary(session) : null), [session])

  const selectedPc = useMemo(() => {
    if (!session) return undefined
    return session.peerConnections.find((pc) => pc.id === selectedPcId) ?? session.peerConnections[0]
  }, [session, selectedPcId])

  const selectedTrack = useMemo(() => {
    if (!selectedPc) return undefined
    return selectedPc.tracks.find((track) => track.id === selectedTrackId) ?? selectedPc.tracks[0]
  }, [selectedPc, selectedTrackId])

  const selectedTrackSummary = useMemo(() => {
    if (!summary || !selectedTrack) return undefined
    return summary.trackSummaries.find((item) => item.track.id === selectedTrack.id)
  }, [summary, selectedTrack])

  const onFileChange = async (file?: File) => {
    if (!file) return
    setError(null)
    setFileName(file.name)
    try {
      const content = await file.text()
      const parsed = parseStatsDump(content)
      setSession(parsed)
      const initialPc = parsed.peerConnections[0]
      const initialPcId = initialPc?.id ?? ''
      setSelectedPcId(initialPcId)
      setSelectedTrackId(pickDefaultTrackId(initialPc))
    } catch (err) {
      setSession(null)
      setSelectedPcId('')
      setSelectedTrackId('')
      setError(err instanceof Error ? err.message : 'Unable to parse file')
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">WebRTC Diagnostics Studio</p>
          <h1>Session Analyzer</h1>
          <p className="subtitle">
            Upload a Chrome webrtc-internals or RTCStatsDump export and get a fast diagnosis of
            quality, stability, and bottlenecks.
          </p>
        </div>
        <div className="upload-card">
          <label className="upload-label">
            <input
              type="file"
              accept=".txt,.json"
              onChange={(event) => onFileChange(event.target.files?.[0])}
            />
            <span>Choose stats dump</span>
          </label>
          <p className="upload-hint">{fileName ? `Loaded: ${fileName}` : 'Supports .txt and .json exports.'}</p>
          {error && <p className="error">{error}</p>}
        </div>
      </header>

      {session && summary ? (
        <main className="content">
          <section className="controls">
            <div className="control">
              <label>Peer Connection</label>
              <select
                value={selectedPc?.id ?? ''}
                onChange={(event) => {
                  const newId = event.target.value
                  setSelectedPcId(newId)
                  const pc = session.peerConnections.find((item) => item.id === newId)
                  setSelectedTrackId(pickDefaultTrackId(pc))
                }}
              >
                {session.peerConnections.map((pc) => (
                  <option key={pc.id} value={pc.id}>
                    {pc.id} · {pc.tracks.length} tracks
                  </option>
                ))}
              </select>
            </div>
            <div className="control">
              <label>Track</label>
              <select
                value={selectedTrack?.id ?? ''}
                onChange={(event) => setSelectedTrackId(event.target.value)}
              >
                {selectedPc?.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {trackLabel(track)}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                className={tab === activeTab ? 'tab active' : 'tab'}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'summary' && 'Summary'}
                {tab === 'deep' && 'Deep Dive'}
                {tab === 'raw' && 'Raw'}
              </button>
            ))}
          </section>

          {activeTab === 'summary' && (
            <section className="panel">
              <div className="summary-grid">
                <div className="score-card">
                  <p className="label">Overall Quality</p>
                  <p className={`score ${summary.overallScore >= 70 ? 'good' : summary.overallScore >= 40 ? 'warn' : 'bad'}`}>
                    {summary.overallScore}
                  </p>
                  <p className="score-caption">0–100 heuristic score</p>
                </div>
                <div className="issues-card">
                  <p className="label">Top Issues</p>
                  <ul>
                    {summary.issues.map((issue) => (
                      <li key={`${issue.trackId}-${issue.metric}`}>
                        <span className="chip">{issue.metric}</span>
                        {issue.kind} {issue.direction} · score {issue.score}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="metrics-table">
                <h3>Metric Summary ({selectedTrack ? trackLabel(selectedTrack) : 'No track'})</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Average</th>
                      <th>P50</th>
                      <th>P95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTrackSummary &&
                      Object.entries(selectedTrackSummary.metrics).map(([metric, stats]) => (
                        <tr key={metric}>
                          <td>{metric}</td>
                          <td>{formatNumber(stats.average)}</td>
                          <td>{formatNumber(stats.p50)}</td>
                          <td>{formatNumber(stats.p95)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'deep' && selectedTrack && (
            <section className="panel">
              <div className="charts">
                <MetricChart label="Bitrate (kbps)" series={selectedTrack.metrics.bitrateKbps} />
                <MetricChart label="Jitter (ms)" series={selectedTrack.metrics.jitterMs} />
                <MetricChart label="RTT (ms)" series={selectedTrack.metrics.rttMs} />
                <MetricChart label="Packet Loss (%)" series={selectedTrack.metrics.packetLossPct} />
                {selectedTrack.kind === 'video' && (
                  <>
                    <MetricChart label="Frame Rate (fps)" series={selectedTrack.metrics.fps} />
                    <MetricChart label="Freeze Count" series={selectedTrack.metrics.freezeCount} />
                  </>
                )}
              </div>
            </section>
          )}

          {activeTab === 'raw' && (
            <section className="panel raw">
              <pre>{JSON.stringify(session, null, 2)}</pre>
            </section>
          )}
        </main>
      ) : (
        <section className="empty-state">
          <p>Upload a stats dump to begin analysis.</p>
        </section>
      )}
    </div>
  )
}

export default App
