import { Route, Routes } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageProvider';
import FeaturesPage from './pages/FeaturesPage';
import LandingPage from './pages/LandingPage';
import PricingPage from './pages/PricingPage';

function App() {
  return (
    <LanguageProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
      </Routes>
    </LanguageProvider>
  );
}

export default App;
