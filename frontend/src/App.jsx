import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ReportHazard from './pages/ReportHazard'
import LiveMap from './pages/LiveMap'
import RouteSafety from './pages/RouteSafety'
import HazardDetails from './pages/HazardDetails'
import Verify from './pages/Verify'
import Admin from './pages/Admin'
import { EmptyState } from './components/ui'
import { SearchX } from 'lucide-react'

function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-lg">
      <EmptyState icon={SearchX} title="Page not found" action={<Link to="/" className="text-sm font-medium text-teal-300 hover:text-teal-200">Go to the dashboard</Link>}>
        That address does not match any RoadGuardian page.
      </EmptyState>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="report" element={<ReportHazard />} />
        <Route path="map" element={<LiveMap />} />
        <Route path="routes" element={<RouteSafety />} />
        <Route path="reports/:id" element={<HazardDetails />} />
        <Route path="verify" element={<Verify />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
