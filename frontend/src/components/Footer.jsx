import React from 'react';

export default function Footer({ setActiveTab }) {
  return (
    <footer className="portal-footer-glass">
      {/* Tricolor Ribbon on top of footer */}
      <div className="tricolor-stripe" />

      <div className="portal-container footer-top-inner">
        <div className="footer-cols-grid">
          {/* Col 1: About LandTrack */}
          <div className="footer-col-card">
            <div className="footer-col-header">
              <img src="/emblem.svg" alt="Emblem" className="footer-emblem-mini" />
              <h4>About LandTrack</h4>
            </div>
            <p className="footer-text">
              <strong>LandTrack</strong> is a land acquisition management system that helps
              identify land parcels affected by highway development, inspect land parcel boundaries,
              calculate accurate metric severance areas, and support transparent Right-of-Way planning.
            </p>
            <div className="footer-sub-highlight">
              Study Area: Puttur Taluk, Karnataka.
            </div>
          </div>

          {/* Col 2: Quick Navigation */}
          <div className="footer-col-card">
            <h4>Portal Navigation</h4>
            <ul className="footer-nav-list">
              <li>
                <button type="button" className="footer-nav-btn" onClick={() => setActiveTab('home')}>
                  &bull; Home
                </button>
              </li>
              <li>
                <button type="button" className="footer-nav-btn" onClick={() => setActiveTab('dashboard')}>
                  &bull; Dashboard
                </button>
              </li>
              <li>
                <button type="button" className="footer-nav-btn" onClick={() => setActiveTab('gis-map')}>
                  &bull; View Map
                </button>
              </li>
              <li>
                <button type="button" className="footer-nav-btn" onClick={() => setActiveTab('affected-parcels')}>
                  &bull; Affected Parcels
                </button>
              </li>
              <li>
                <button type="button" className="footer-nav-btn" onClick={() => setActiveTab('reports')}>
                  &bull; Reports
                </button>
              </li>
              <li>
                <button type="button" className="footer-nav-btn" onClick={() => setActiveTab('about')}>
                  &bull; About LandTrack
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Jurisdiction & Coverage */}
          <div className="footer-col-card">
            <h4>Jurisdiction &amp; Coverage</h4>
            <div className="footer-spec-item">
              <span className="spec-label">Administrative Region:</span>
              <span className="spec-val">Puttur Taluk, Karnataka</span>
            </div>
            <div className="footer-spec-item">
              <span className="spec-label">Coverage Area:</span>
              <span className="spec-val">Puttur Taluk Land Extent</span>
            </div>
            <div className="footer-spec-item">
              <span className="spec-label">Land Records:</span>
              <span className="spec-val">Revenue Survey &amp; Road Corridors</span>
            </div>
            <div className="footer-spec-item">
              <span className="spec-label">Project Scope:</span>
              <span className="spec-val">Land Acquisition Assessment</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Disclaimer */}
      <div className="footer-bottom-bar">
        <div className="portal-container footer-bottom-inner">
          <p className="disclaimer-p">
            <strong>LandTrack:</strong> Automated land parcel impact assessment system for highway development planning.
          </p>
          <div className="copyright-row">
            <span>&copy; 2026 LandTrack — Land Acquisition Management System.</span>
            <span className="footer-gold-tag">LANDTRACK &bull; PWD LAND ACQUISITION</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
