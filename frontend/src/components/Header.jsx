import React from 'react';

export default function Header({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'gis-map', label: 'View Map' },
    { id: 'affected-parcels', label: 'Affected Parcels' },
    { id: 'reports', label: 'Reports' },
    { id: 'about', label: 'About LandTrack' },
  ];

  return (
    <header className="header-glass-wrapper">
      {/* Indian National Tricolor Ribbon */}
      <div className="tricolor-stripe" />

      {/* 2. Top Dark Transparent / Glass Bar */}
      <div className="top-dark-glass-bar">
        <div className="portal-container top-bar-inner">
          <div className="top-bar-left">
            <span>LANDTRACK &bull; LAND ACQUISITION MANAGEMENT</span>
          </div>
          <div className="top-bar-right">
            {/* <span>Land Parcels: 11,304</span> */}
          </div>
        </div>
      </div>

      {/* 3. Main Header (Clean White / Semi-Transparent) */}
      <div className="main-portal-header">
        <div className="portal-container main-header-inner">
          {/* Left: Emblem + Title */}
          <div className="header-brand" onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }}>
            <img src="/emblem.svg" alt="LandTrack Emblem" className="header-emblem" />
            <div className="header-titles">
              <div className="brand-badge-row">
                <span className="gov-authority-badge">LANDTRACK &bull; PWD LAND ACQUISITION</span>
                <span className="location-tag">Study Area: Puttur Taluk, Karnataka</span>
              </div>
              <h1 className="portal-title">LANDTRACK</h1>
              <div className="portal-subtitle">
                Land Acquisition Management System for Highway Development
              </div>
            </div>
          </div>

          {/* Right: Navigation Items */}
          <nav className="header-nav" aria-label="Main Navigation">
            <ul className="header-nav-list">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const isDashboard = item.id === 'dashboard';

                let itemClass = 'nav-pill-btn';
                if (isActive) {
                  itemClass += isDashboard ? ' active-dashboard' : ' active';
                }

                return (
                  <li key={item.id} className="header-nav-item">
                    <button
                      type="button"
                      className={itemClass}
                      onClick={() => setActiveTab(item.id)}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      {/* Breadcrumb Substrip */}
      <div className="page-substrip">
        <div className="portal-container substrip-content">
          <div className="breadcrumb-trail">
            <span>LandTrack</span> &gt; <span>Puttur Taluk</span> &gt;{' '}
            <strong className="active-trail-item">
              {navItems.find((n) => n.id === activeTab)?.label}
            </strong>
          </div>
        </div>
      </div>
    </header>
  );
}
