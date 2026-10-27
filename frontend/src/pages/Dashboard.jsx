import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:5000/api';

export default function Dashboard({ onNavigateToMap }) {
  const heroImages = [
    {
      id: 'highway',
      url: '/images/highway_hero.jpg',
      label: 'Highway Corridor',
      subtitle: 'Road Infrastructure Alignment'
    },
    {
      id: 'cadastral',
      url: '/images/gis_cadastral.jpg',
      label: 'Land Parcels',
      subtitle: 'Puttur Taluk Survey Layers'
    },
    {
      id: 'infrastructure',
      url: '/images/land_infrastructure.jpg',
      label: 'Land Infrastructure',
      subtitle: 'Right-of-Way Development'
    }
  ];

  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [metadata, setMetadata] = useState(null);
  const [roadsMeta, setRoadsMeta] = useState(null);
  const [affectedStats, setAffectedStats] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/cadastral/metadata`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) setMetadata(data);
      })
      .catch(() => { });

    fetch(`${API_BASE}/roads/metadata`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) setRoadsMeta(data);
      })
      .catch(() => { });

    try {
      const saved = localStorage.getItem('landtrack_affected_parcels');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.parcels && parsed.parcels.length > 0) {
          const parcels = parsed.parcels;
          const low = parsed.summary?.low_priority_count ?? parcels.filter(p => p.priority === 'Low').length;
          const med = parsed.summary?.medium_priority_count ?? parcels.filter(p => p.priority === 'Medium').length;
          const high = parsed.summary?.high_priority_count ?? parcels.filter(p => p.priority === 'High').length;
          const partial = parsed.summary?.partial_impact_count ?? parcels.filter(p => p.impact_type === 'Partial Impact').length;
          const full = parsed.summary?.full_impact_count ?? parcels.filter(p => p.impact_type === 'Full Impact').length;
          const totalArea = parcels.reduce((acc, p) => acc + (Number(p.affected_area) || 0), 0);
          setAffectedStats({
            total: parcels.length,
            low,
            med,
            high,
            partial,
            full,
            totalArea: Math.round(totalArea)
          });
        }
      }
    } catch { }
  }, []);

  const selectedRoadValue = roadsMeta?.number_of_features
    ? 'Choose the road alignment for analysis'
    : 'Awaiting Selection';
  const acquisitionWidthValue = 'Locate land parcels intersecting the corridor';
  const affectedParcelsValue = 'Calculate the affected area of each parcel';
  const analysisStatusValue = 'View parcel details and analysis results';
  const totalParcelsCount = metadata?.total_parcels
    ? metadata.total_parcels.toLocaleString('en-IN')
    : '11,304';

  return (
    <div className="dashboard-glass-portal">
      {/* ==================================================
          HIGHWAY HERO
          ================================================== */}
      <section className="highway-hero-container">
        <div
          className="highway-hero-bg"
          style={{ backgroundImage: `url("${heroImages[activeHeroIndex].url}")` }}
          key={heroImages[activeHeroIndex].id}
        >
          <div className="highway-hero-overlay" />
        </div>

        <div className="highway-hero-content-grid">
          {/* GLASS HERO PANEL */}
          <div className="glass-hero-panel">
            <div className="glass-hero-badge">
              <span className="badge-pulse-dot" />
              <span>GIS LAND ACQUISITION MANAGEMENT</span>
            </div>

            <h1 className="glass-hero-title">Every Parcel Mapped, Every Impact Measured</h1>
            <h2 className="glass-hero-subtitle">LAND ACQUISITION MANAGEMENT</h2>

            <p className="glass-hero-desc">
              GIS-based land acquisition management for highway development.
              Identify affected land parcels, analyze affected areas, and support
              land acquisition planning.
            </p>

            <div className="glass-hero-meta-row">
              <div className="hero-meta-chip">
                <span className="chip-label">Study Area:</span>
                <span className="chip-val">Puttur Taluk, Karnataka</span>
              </div>
              <div className="hero-meta-chip">
                <span className="chip-label">Land Parcels:</span>
                <span className="chip-val">{totalParcelsCount}</span>
              </div>
            </div>

            <div className="glass-hero-actions">
              <button
                type="button"
                id="btn-hero-open-gis"
                className="btn-gov-primary"
                onClick={onNavigateToMap}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span>VIEW MAP</span>
              </button>

              <button
                type="button"
                className="btn-gov-glass"
                onClick={() => {
                  const el = document.getElementById('acquisition-overview-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
                <span>VIEW DETAILS</span>
              </button>
            </div>
          </div>

          {/* GLASS INFORMATION PANEL (CORRIDOR STATUS) */}
          <div className="glass-info-panel">
            <div className="glass-info-header">
              <div className="info-header-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D49A3D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>LAND IMPACT WORKFLOW</span>
              </div>
              <span className="live-pill">ACTIVE</span>
            </div>

            <div className="glass-info-rows">
              {/* Selected Road */}
              <div className="glass-info-field">
                <div className="glass-field-label">SELECT ROAD</div>
                <div className="glass-field-value road-highlight">{selectedRoadValue}</div>
              </div>

              {/* Acquisition Width */}
              <div className="glass-info-field">
                <div className="glass-field-label">IDENTIFY PARCELS</div>
                <div className="glass-field-value width-highlight">{acquisitionWidthValue}</div>
              </div>

              {/* Affected Parcels */}
              <div className="glass-info-field">
                <div className="glass-field-label">AFFECTED AREA</div>
                <div className="glass-field-value parcel-highlight">{affectedParcelsValue}</div>
              </div>

              {/* Analysis Status */}
              <div className="glass-info-field">
                <div className="glass-field-label">Generate Reports</div>
                <div className="glass-field-value status-badge-glass">
                  <span className="status-dot green" />
                  <span>{analysisStatusValue}</span>
                </div>
              </div>
            </div>

            <div className="glass-info-footer">
              <button
                type="button"
                className="btn-glass-inline"
                onClick={onNavigateToMap}
              >
                <span>View Map &rarr;</span>
              </button>
            </div>
          </div>
        </div>

        {/* GLASS THUMBNAILS */}
        <div className="glass-thumbnails-dock" aria-label="Hero Scene Selector">
          <div className="thumbnails-dock-label">Switch Visual Scene:</div>
          <div className="thumbnails-list">
            {heroImages.map((thumb, idx) => (
              <button
                key={thumb.id}
                type="button"
                className={`glass-thumbnail-btn ${activeHeroIndex === idx ? 'active' : ''}`}
                onClick={() => setActiveHeroIndex(idx)}
                title={`Switch to ${thumb.label}`}
              >
                <img src={thumb.url} alt={thumb.label} className="thumb-preview-img" />
                <div className="thumb-caption">
                  <span className="thumb-title">{thumb.label}</span>
                  <span className="thumb-sub">{thumb.subtitle}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ==================================================
          LAND ACQUISITION OVERVIEW
          ================================================== */}
      <section id="acquisition-overview-section" className="overview-glass-section">
        <div className="section-header-row">
          <div className="section-title-wrap">
            <span className="section-pre-title">CORRIDOR OVERVIEW</span>
            <h2 className="section-title">LAND ACQUISITION OVERVIEW</h2>
          </div>
          <div className="section-tag-right">
            <span>Study Area: Puttur Taluk, Karnataka</span>
          </div>
        </div>

        {/* Informational Alert Box */}
        {/* <div className="glass-alert-panel">
          <div className="alert-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B8792A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="alert-text-wrap">
            <strong>Analysis Notice:</strong> Select a highway corridor and specify acquisition width on the map to calculate affected land parcels, severance areas, and parcel priority.
          </div>
        </div> */}

        {/* 4 Clean Overview Cards */}
        <div className="overview-cards-grid">
          {/* Card 1: Selected Road */}
          <div className="glass-overview-card">
            <div className="card-top-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#173B63" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19L8 5" />
                <path d="M16 5l4 14" />
                <path d="M12 5v2" />
                <path d="M12 11v2" />
                <path d="M12 17v2" />
              </svg>
            </div>
            <div className="card-label">SELECTED ROAD</div>
            <div className="card-value road-name-clamp">{selectedRoadValue}</div>
          </div>

          {/* Card 2: Acquisition Width */}
          <div className="glass-overview-card">
            <div className="card-top-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8792A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="18" x2="3" y2="18" />
                <line x1="12" y1="2" x2="12" y2="22" />
              </svg>
            </div>
            <div className="card-label">ACQUISITION WIDTH</div>
            <div className="card-value">{acquisitionWidthValue}</div>
          </div>

          {/* Card 3: Affected Parcels */}
          <div className="glass-overview-card">
            <div className="card-top-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8792A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <div className="card-label">AFFECTED PARCELS</div>
            <div className="card-value amber-accent">{affectedParcelsValue}</div>
          </div>

          {/* Card 4: Analysis Status */}
          <div className="glass-overview-card">
            <div className="card-top-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="card-label">ANALYSIS STATUS</div>
            <div className="card-value status-badge-overview">
              <span className="status-dot green" />
              <span>{analysisStatusValue}</span>
            </div>
          </div>
        </div>

        {/* Metric KPI Cards */}
        <div className="kpi-secondary-grid">
          <div className="glass-kpi-item">
            <div className="kpi-label">Total Parcels in Study Area</div>
            <div className="kpi-number">{totalParcelsCount}</div>
            <div className="kpi-desc">Puttur Taluk Land Records</div>
          </div>

          <div className="glass-kpi-item">
            <div className="kpi-label">Partial / Full Parcel Impact</div>
            <div className="kpi-number">{affectedStats ? `${affectedStats.partial} / ${affectedStats.full}` : '-- / --'}</div>
            <div className="kpi-desc">Impact Classification</div>
          </div>

          <div className="glass-kpi-item">
            <div className="kpi-label">Total Affected Area</div>
            <div className="kpi-number">{affectedStats ? `${affectedStats.totalArea.toLocaleString('en-IN')} m²` : '-- m²'}</div>
            <div className="kpi-desc">Calculated Corridor Acquisition Area</div>
          </div>
        </div>

        {/* Parcel Priority Breakdown */}
        <div className="glass-priority-panel">
          <div className="priority-panel-header">
            <h3>Parcel Priority Breakdown</h3>
            <span>Categorized by ML priority model: acquisition urgency &amp; severity</span>
          </div>

          <div className="priority-cards-grid">
            <div className="priority-card low">
              <div className="priority-tag" style={{ color: '#2563EB' }}>LOW PRIORITY</div>
              <div className="priority-count">{affectedStats ? affectedStats.low : '--'}</div>
              <div className="priority-caption">Minor partial parcel impact (&lt; 25% or low affected area)</div>
            </div>

            <div className="priority-card med">
              <div className="priority-tag" style={{ color: '#F59E0B' }}>MEDIUM PRIORITY</div>
              <div className="priority-count">{affectedStats ? affectedStats.med : '--'}</div>
              <div className="priority-caption">Moderate corridor severance (25% – 60%)</div>
            </div>

            <div className="priority-card high">
              <div className="priority-tag" style={{ color: '#DC2626' }}>HIGH PRIORITY</div>
              <div className="priority-count">{affectedStats ? affectedStats.high : '--'}</div>
              <div className="priority-caption">Substantial / severe parcel acquisition (&gt; 55% / full impact)</div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="overview-action-cta">
          <button
            type="button"
            className="btn-gov-primary lg"
            onClick={onNavigateToMap}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            <span>View Map to Perform Analysis</span>
          </button>
        </div>
      </section>

      {/* ==================================================
          FEATURED SECTION: LAND ACQUISITION ANALYSIS
          ================================================== */}
      <section className="gis-featured-visual-section">
        <div className="gis-banner-image-wrap">
          <img
            src="/images/gis_cadastral.jpg"
            alt="Puttur Land Acquisition Map"
            className="gis-banner-img"
          />
          <div className="gis-banner-overlay" />

          <div className="gis-featured-glass-card">
            <div className="gis-card-header-badge">
              <span className="badge-dot-gold" />
              <span>LAND ACQUISITION SYSTEM</span>
            </div>

            <h2 className="gis-card-title">LAND ACQUISITION ANALYSIS</h2>

            <p className="gis-card-desc">
              LandTrack is an automated land acquisition management system that helps identify
              land parcels affected by highway development, inspect survey boundaries and
              ownership information, calculate precise severance areas, and support planning.
            </p>

            <div className="gis-card-highlights">
              <div className="gis-highlight-bullet">
                <span className="bullet-check">✓</span>
                <span>Detailed land parcel boundaries (Puttur Taluk)</span>
              </div>
              <div className="gis-highlight-bullet">
                <span className="bullet-check">✓</span>
                <span>Corridor width analysis across 425+ road segments</span>
              </div>
              <div className="gis-highlight-bullet">
                <span className="bullet-check">✓</span>
                <span>Instant area and parcel severance calculations</span>
              </div>
            </div>

            <div className="gis-card-button-row">
              <button
                type="button"
                id="btn-view-gis-map-featured"
                className="btn-gov-primary"
                onClick={onNavigateToMap}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span>VIEW MAP</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          ALTERNATING CONTENT SECTIONS
          ================================================== */}
      <section className="alternating-portal-sections">
        {/* Row 1 */}
        <div className="alternating-block row-image-left">
          <div className="alternating-image-column">
            <div className="alternating-image-frame">
              <img
                src="/images/highway_hero.jpg"
                alt="Highway Infrastructure"
                className="alternating-photo"
              />
              <div className="alternating-photo-badge">Highway Corridor</div>
            </div>
          </div>

          <div className="alternating-glass-column">
            <div className="glass-content-card">
              <span className="card-accent-pill">PHASE 1: CORRIDOR BUFFERING</span>
              <h3 className="card-heading">Land Parcel Mapping &amp; Corridor Alignment</h3>
              <p className="card-body-text">
                Every highway development begins with demarcating precise Right-of-Way widths.
                LandTrack maps verified land parcels and applies corridor buffering
                around highway centerlines in Puttur Taluk to detect parcel encroachments.
              </p>
              <ul className="card-feature-list">
                <li>Automated buffer distance calculation (e.g. 30m, 45m, 60m)</li>
                <li>Instant survey number identification</li>
                <li>Boundary overlap derivation with accurate calculations</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="alternating-block row-image-right">
          <div className="alternating-glass-column">
            <div className="glass-content-card">
              <span className="card-accent-pill">PHASE 2: IMPACT ASSESSMENT</span>
              <h3 className="card-heading">Automated Parcel Impact &amp; Area Calculation</h3>
              <p className="card-body-text">
                Understanding whether a land parcel suffers partial or full acquisition is vital
                for planning. LandTrack performs geometric calculations
                to determine both the affected footprint (m² and acres) and remaining parcel area.
              </p>
              <ul className="card-feature-list">
                <li>Area calculation in square metres and acres</li>
                <li>Impact classification (Partial Impact vs. Full Impact)</li>
                <li>Land parcel identifier linkage</li>
              </ul>
            </div>
          </div>

          <div className="alternating-image-column">
            <div className="alternating-image-frame">
              <img
                src="/images/land_infrastructure.jpg"
                alt="Land Development"
                className="alternating-photo"
              />
              <div className="alternating-photo-badge">Parcel Impact</div>
            </div>
          </div>
        </div>

        {/* Row 3 */}
        <div className="alternating-block row-image-left">
          <div className="alternating-image-column">
            <div className="alternating-image-frame">
              <img
                src="/images/gis_cadastral.jpg"
                alt="Land Records"
                className="alternating-photo"
              />
              <div className="alternating-photo-badge">Land Records</div>
            </div>
          </div>

          <div className="alternating-glass-column">
            <div className="glass-content-card">
              <span className="card-accent-pill">PHASE 3: PARCEL PRIORITY</span>
              <h3 className="card-heading">Parcel Priority &amp; Reports</h3>
              <p className="card-body-text">
                LandTrack categorizes affected plots into Low, Medium, and High priority to streamline
                survey planning, compensation workflows, and report documentation.
              </p>
              <ul className="card-feature-list">
                <li>Clear categorization into Low, Medium, and High priority</li>
                <li>Export-ready Land Acquisition Assessment Report format</li>
                <li>Survey register data with area measurements</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Bar */}
      <section className="dashboard-bottom-bar">
        <div className="bottom-bar-inner">
          <div className="bottom-bar-left">
            <h4>Ready to evaluate road corridors?</h4>
            <p>Access the map to select highway corridors, customize buffer widths, and review survey parcels.</p>
          </div>
          <div className="bottom-bar-right">
            <button
              type="button"
              className="btn-gov-primary"
              onClick={onNavigateToMap}
            >
              View Map &rarr;
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
