import React from 'react';

export default function Home({ onNavigateToMap, setActiveTab }) {
  const services = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      description: 'Review road corridor statistics, acquisition width, and parcel priority metrics.',
      actionText: 'View Dashboard',
      action: () => setActiveTab('dashboard'),
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      )
    },
    {
      id: 'gis-map',
      title: 'View Map',
      description: 'Explore Puttur Taluk land parcel boundaries overlaid with highway corridors.',
      actionText: 'View Map',
      action: onNavigateToMap,
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )
    },
    {
      id: 'affected-parcels',
      title: 'Affected Parcels',
      description: 'View survey numbers, ownership details, and computed severance areas for impacted plots.',
      actionText: 'View Details',
      action: () => setActiveTab('affected-parcels'),
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      )
    },
    {
      id: 'reports',
      title: 'Reports',
      description: 'Generate and review land acquisition assessment reports.',
      actionText: 'Generate Report',
      action: () => setActiveTab('reports'),
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
  ];

  return (
    <div className="home-glass-portal">
      {/* Hero Welcome Glass Card with Highway Photography Background */}
      <div className="home-hero-card">
        <div className="home-hero-bg-overlay" />
        <div className="home-hero-content">
          <div className="home-badge-row">
            <span className="gov-authority-badge">LANDTRACK &bull; PWD LAND ACQUISITION</span>
            <span className="location-tag">Study Area: Puttur Taluk, Karnataka</span>
          </div>

          <h2 className="home-title">LandTrack</h2>
          <h3 className="home-subtitle">
            Land Acquisition Management System for Highway Development
          </h3>

          <p className="home-desc">
            GIS-based land acquisition management for highway development.
            Identify affected land parcels, analyze affected areas, and support
            land acquisition planning.
          </p>

          <div className="home-stats-strip">
            <div className="home-stat-item">
              <span className="home-stat-num">11,304</span>
              <span className="home-stat-label">Land Parcels</span>
            </div>
            <div className="home-stat-item">
              <span className="home-stat-num">1,050+</span>
              <span className="home-stat-label">Highway &amp; Road Segments</span>
            </div>
            <div className="home-stat-item">
              <span className="home-stat-num">Puttur Taluk</span>
              <span className="home-stat-label">Study Area</span>
            </div>
            <div className="home-stat-item">
              <span className="home-stat-num">Automated</span>
              <span className="home-stat-label">Parcel Priority Analysis</span>
            </div>
          </div>

          <div className="home-hero-actions">
            <button
              type="button"
              id="btn-home-open-gis"
              className="btn-gov-primary"
              onClick={onNavigateToMap}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              <span>View Map</span>
            </button>

            <button
              type="button"
              id="btn-home-view-dashboard"
              className="btn-gov-glass"
              onClick={() => setActiveTab('dashboard')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              <span>View Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      {/* Services Grid Section */}
      <div className="home-services-section">
        <div className="section-header-row">
          <div className="section-title-wrap">
            <span className="section-pre-title">LANDTRACK MODULES</span>
            <h2 className="section-title">LAND ACQUISITION SERVICES</h2>
          </div>
          <span className="section-tag-right">Puttur Taluk Land Records</span>
        </div>

        <div className="services-glass-grid">
          {services.map((service) => (
            <div
              key={service.id}
              className="glass-service-card"
              onClick={service.action}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  service.action();
                }
              }}
            >
              <div className="service-icon-box">
                {service.icon}
              </div>
              <h4 className="service-card-title">{service.title}</h4>
              <p className="service-card-desc">{service.description}</p>
              <div className="service-card-action">
                <span>{service.actionText}</span>
                <span className="service-arrow">&rarr;</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
