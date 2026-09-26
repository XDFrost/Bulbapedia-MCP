import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Admin } from './pages/Admin.tsx'
import { Dashboard } from './pages/Dashboard.tsx'
import { Landing } from './pages/Landing.tsx'
import { NotFound } from './pages/NotFound.tsx'
import { Privacy } from './pages/Privacy.tsx'
import { useMe } from './lib/useMe.ts'

export default function App() {
  const me = useMe()
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing me={me} />} />
        <Route path="/dashboard" element={<Dashboard me={me} />} />
        <Route path="/admin" element={<Admin me={me} />} />
        <Route path="/privacy" element={<Privacy me={me} />} />
        <Route path="*" element={<NotFound me={me} />} />
      </Routes>
    </BrowserRouter>
  )
}
