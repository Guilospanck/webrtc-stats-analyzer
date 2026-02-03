import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  test('renders upload prompt', () => {
    render(<App />)
    expect(screen.getByText('Session Analyzer')).toBeInTheDocument()
    expect(screen.getByText('Choose stats dump')).toBeInTheDocument()
  })
})
