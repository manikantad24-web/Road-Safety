// Smoke tests: render the real app against a REAL running backend (seeded with fictional demo data).
// Start the backend first - see README "Frontend smoke tests". These do not test visual layout.
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AdminProvider, SourceProvider, ToastProvider } from '../context'

const mount = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <SourceProvider>
          <AdminProvider>
            <App />
          </AdminProvider>
        </SourceProvider>
      </ToastProvider>
    </MemoryRouter>,
  )

describe('RoadGuardian pages against a live API', () => {
  it('dashboard shows live statistics and the map preview', async () => {
    mount('/')
    expect(await screen.findByText('Road hazard overview')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Active reports').parentElement.parentElement.textContent).toMatch(/\d+/), { timeout: 10000 })
    expect(await screen.findByText('Recent activity')).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon').length).toBeGreaterThan(0), { timeout: 10000 })
  })

  it('report form validates, then submits a real report', async () => {
    mount('/report')
    await screen.findByText('Hazard details')
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
    expect(await screen.findByText('Choose the type of hazard.')).toBeTruthy()
    expect(screen.getByText('Choose how severe the hazard looks.')).toBeTruthy()
    expect(screen.getAllByText(/Enter a (latitude|longitude)/).length).toBe(2)

    fireEvent.change(document.getElementById('field-hazard_type'), { target: { value: 'pothole' } })
    fireEvent.click(screen.getByLabelText(/^Medium/))
    fireEvent.change(document.getElementById('field-latitude'), { target: { value: '18.5210' } })
    fireEvent.change(document.getElementById('field-longitude'), { target: { value: '73.8570' } })
    fireEvent.change(document.getElementById('field-description'), { target: { value: 'Smoke test report' } })
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
    expect(await screen.findByText(/Report #\d+ submitted/, {}, { timeout: 10000 })).toBeTruthy()
  })

  it('live map lists reports from the API', async () => {
    mount('/map')
    await screen.findByText('Filters')
    await waitFor(() => expect(screen.getAllByText('Open').length).toBeGreaterThan(3), { timeout: 10000 })
  })

  it('report details show history and verification', async () => {
    mount('/reports/1')
    expect(await screen.findByText(/#1$/, {}, { timeout: 10000 })).toBeTruthy()
    expect(await screen.findByText('History')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Community verification' })).toBeTruthy()
  })

  it('verification page lets a user confirm a report once', async () => {
    mount('/verify')
    const btn = (await screen.findAllByRole('button', { name: /confirm hazard is still there/i }, { timeout: 10000 }))[0]
    fireEvent.click(btn)
    expect(await screen.findByText(/Your confirmation|You confirmed this report/, {}, { timeout: 10000 })).toBeTruthy()
  })

  it('admin dashboard lists the queue and requires a token to change status', async () => {
    mount('/admin')
    await screen.findByText('Report queue')
    const review = (await screen.findAllByRole('button', { name: /review/i }, { timeout: 10000 }))[0]
    fireEvent.click(review)
    expect(await screen.findByText('Admin token needed')).toBeTruthy()
    expect(screen.getByText(/not secure production authorisation/i)).toBeTruthy()
  })

  it('route safety shows a clear message when routing is unavailable', async () => {
    mount('/routes')
    await screen.findByText('Estimates from reported data only')
    fireEvent.click(screen.getByRole('button', { name: /compare routes/i }))
    expect(await screen.findByText(/Set both points/)).toBeTruthy()
    fireEvent.change(document.getElementById('origin-lat'), { target: { value: '18.5130' } })
    fireEvent.change(document.getElementById('origin-lng'), { target: { value: '73.8500' } })
    fireEvent.change(document.getElementById('destination-lat'), { target: { value: '18.5330' } })
    fireEvent.change(document.getElementById('destination-lng'), { target: { value: '73.8650' } })
    fireEvent.click(screen.getByRole('button', { name: /compare routes/i }))
    expect(await screen.findByText('Routing service unavailable', {}, { timeout: 20000 })).toBeTruthy()
  })
})
