# WebRTC Session Analysis Tool — Plan

## Summary
Build a static React + Vite SPA that ingests Chrome `webrtc-internals` exports (`webrtc_internals_dump.txt`) and `RTCStatsDump` exports (`rtcstats_dump.txt`), parses and normalizes them in-browser, and produces a summary quality score plus deep-dive charts and tables. The tool is aimed at WebRTC engineers and focuses on bitrate, jitter, packet loss, RTT, resolution, frame rate, and freeze count. No backend, no export, single-session per load, with PC selection if multiple peer connections exist.

## Scope and Goals
- Primary user: WebRTC engineers
- Primary output: Quality diagnosis report + key charts and tables
- Input: Raw Chrome exports (two formats)
- Output: Summary + deep dive + raw normalized view
- No backend, no persistence, no multi-session comparison in v1

## Architecture and Data Flow
1. File ingest
   - Upload file (`.txt` / `.json`) via UI.
   - Detect format:
     - `RTCStatsDump` if first line is `RTCStatsDump`
     - `webrtc-internals` if JSON root has `PeerConnections`
2. Parsing
   - `RTCStatsDump`: parse line-by-line, extract `getStats` entries, group by PeerConnection id (e.g., `92-1`).
   - `webrtc_internals`: parse JSON, iterate `PeerConnections`, map `stats` series arrays to samples.
3. Normalization
   - Convert both formats into a canonical in-memory model:
     - `PeerConnection { id, metadata, timeRange, tracks[] }`
     - `Track { kind: audio|video, direction: inbound|outbound, metricSeries }`
     - `MetricSeries { timestamps[], values[] }`
   - Use relative time offsets (t=0…N).
4. Analysis
   - Compute metric series and aggregates (avg, p50, p95).
   - Compute quality score (0–100) with heuristics and weights.

## Heuristic Scoring (0–100)
- Weighting: 70% video, 30% audio.
- Metrics: bitrate, jitter, packet loss, RTT, resolution, FPS, freeze count.
- Default thresholds (initial)
  - Jitter: <=30ms good; 30–100ms degrade; >100ms bad
  - RTT: <=300ms good; 300–600ms degrade; >600ms bad
  - Packet loss: <=2% good; 2–5% degrade; >5% bad
  - FPS: 15–30 acceptable; <10 bad
  - Bitrate (by resolution):
    - 360p: >=300kbps good
    - 480p: >=600kbps good
    - 720p: >=1500kbps good
  - Freeze count: 0 good; 1–3 degrade; >3 bad
- Issue detection: pick top 3–5 worst subscores and show a human-readable explanation.

## UI Structure
- Tabs: Summary / Deep Dive / Raw
- Summary
  - Overall score 0–100 with color band
  - Top issues list
  - Metrics table (avg / p50 / p95)
- Deep Dive
  - PeerConnection selector (if multiple)
  - Track selector (audio/video, inbound/outbound)
  - Time-series charts (Chart.js)
  - Metrics tables
- Raw
  - Normalized JSON viewer + metadata

## Error Handling
- Clear error if format unknown
- If multiple PCs, require user selection
- If no media tracks, show “No media tracks found”
- Missing metrics => null values in charts + note in summary

## Tech Stack
- React + Vite
- Chart.js for charts
- No backend

## Public APIs / Interfaces
- Input file formats supported:
  - `RTCStatsDump` (line-based)
  - Chrome `webrtc-internals` export JSON
- No external API in v1.

## Tests and Scenarios
- Parser unit tests for both example files:
  - `rtcstats_dump.txt`
  - `webrtc_internals_dump.txt`
- Metric computation tests:
  - bitrate delta over time
  - jitter/RTT conversion to ms
  - packet loss percentage
- Score aggregation tests:
  - verify subscore mapping and overall weighting
- UI smoke test:
  - load file, render Summary tab, render Deep Dive charts

## Assumptions / Defaults
- Single-session per upload
- Chrome/Edge stats only
- Built-in thresholds only (not user configurable)
- Relative timebase on charts
