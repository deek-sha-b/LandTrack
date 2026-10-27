import React, { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import GisMap from './pages/GisMap';
import AffectedParcels from './pages/AffectedParcels';
import Reports from './pages/Reports';
import About from './pages/About';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // Start on Dashboard per prompt focus

  const navigateToMap = () => {
    setActiveTab('gis-map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Home onNavigateToMap={navigateToMap} setActiveTab={handleTabChange} />;
      case 'dashboard':
        return <Dashboard onNavigateToMap={navigateToMap} />;
      case 'gis-map':
        return <GisMap />;
      case 'affected-parcels':
        return <AffectedParcels onNavigateToMap={navigateToMap} />;
      case 'reports':
        return <Reports onNavigateToMap={navigateToMap} />;
      case 'about':
        return <About />;
      default:
        return <Dashboard onNavigateToMap={navigateToMap} />;
    }
  };

  return (
    <div className="portal-root">
      <Header activeTab={activeTab} setActiveTab={handleTabChange} />

      <main className="main-wrapper">
        {renderContent()}
      </main>

      <Footer setActiveTab={handleTabChange} />
    </div>
  );
}
