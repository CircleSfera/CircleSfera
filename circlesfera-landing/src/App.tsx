import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import FeaturesPage from './pages/FeaturesPage'
import { LanguageProvider } from './contexts/LanguageProvider';

function App() {
  return (
    <LanguageProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
      </Routes>
    </LanguageProvider>
  )
}

export default App
