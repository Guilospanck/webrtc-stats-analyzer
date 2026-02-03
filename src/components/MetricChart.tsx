import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { MetricSeries } from '../lib/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

type MetricChartProps = {
  label: string
  series: MetricSeries
}

const buildLabels = (timestamps: number[]) => {
  if (timestamps.length === 0) return []
  const t0 = timestamps[0]
  return timestamps.map((time) => ((time - t0) / 1000).toFixed(1))
}

export function MetricChart({ label, series }: MetricChartProps) {
  const labels = buildLabels(series.timestamps)
  const data = {
    labels,
    datasets: [
      {
        label,
        data: series.values,
        borderColor: '#1c2833',
        backgroundColor: 'rgba(28, 40, 51, 0.1)',
        tension: 0.2,
        pointRadius: 0,
      },
    ],
  }

  return (
    <div className="chart-card">
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: { title: { display: true, text: 'Time (s)' } },
            y: { title: { display: true, text: label } },
          },
        }}
      />
    </div>
  )
}
