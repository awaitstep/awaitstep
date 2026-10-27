import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthLine } from '../health-line'

const FIVE_MINUTES_AGO = new Date(Date.now() - 5 * 60_000).toISOString()

describe('HealthLine', () => {
  it('counts failures in the error colour', () => {
    render(<HealthLine failing={2} lastRunAt={FIVE_MINUTES_AGO} />)
    const line = screen.getByText('2 failing · 5m ago')
    expect(line).toHaveClass('text-status-error')
  })

  it('says all passing when nothing failed', () => {
    render(<HealthLine failing={0} lastRunAt={FIVE_MINUTES_AGO} />)
    expect(screen.getByText('All passing · 5m ago')).not.toHaveClass('text-status-error')
  })

  it('says no runs yet without a last run', () => {
    render(<HealthLine failing={0} lastRunAt={null} />)
    expect(screen.getByText('No runs yet')).toBeVisible()
  })
})
