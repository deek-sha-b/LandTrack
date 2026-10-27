import React from 'react';

export default function About() {
  return (
    <div className="about-page">
      <div className="gov-card">
        <div className="gov-card-header">
          <div className="gov-card-title">About LandTrack</div>
          <span className="sys-badge" style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1' }}>
            Land Acquisition Management
          </span>
        </div>
        <div className="gov-card-body" style={{ padding: '24px' }}>

          {/* System Title Block */}
          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '16px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-navy)' }}>
              LANDTRACK
            </h2>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gov-navy-light)', marginTop: '4px' }}>
              Land Acquisition Management System for Highway Development
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
              <strong>Study Area:</strong> Puttur Taluk, Karnataka
            </p>
          </div>

          {/* Purpose & Scope */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)', textTransform: 'uppercase', marginBottom: '8px' }}>
              1. System Purpose &amp; Scope
            </h4>
            <p style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--text-main)', marginBottom: '10px' }}>
              Highway development projects require meticulous planning to acquire Right-of-Way (RoW)
              corridors across private and public land. Conventional manual inspection is time-consuming
              and prone to boundary calculation discrepancies. <strong>LandTrack</strong> provides an automated system
              by intersecting highway corridor widths with land parcel boundaries to compute
              affected area, classify impact severity (Partial Impact vs. Full Impact), and categorize parcel priority.
            </p>
          </div>

          {/* Mathematical & Formulation */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)', textTransform: 'uppercase', marginBottom: '8px' }}>
              2. Area Calculation Methodology
            </h4>
            <div style={{ backgroundColor: '#f8fafc', padding: '14px', border: '1px solid var(--border-color)', marginBottom: '12px', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: 'var(--gov-navy)', marginBottom: '6px' }}>
                Affected Percentage Calculation:
              </div>
              <code style={{ fontSize: '13px', color: 'var(--gov-navy-dark)' }}>
                Affected Percentage = (Affected Area / Total Parcel Area) × 100
              </code>
            </div>
            <p style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--text-muted)' }}>
              Calculations are executed with high precision to guarantee metric area accuracy in square metres and acres.
            </p>
          </div>

          {/* Priority Categorisation */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)', textTransform: 'uppercase', marginBottom: '8px' }}>
              3. Parcel Priority Classification
            </h4>
            <p style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--text-main)', marginBottom: '10px' }}>
              The system evaluates acquisition urgency into three priority tiers:
              <strong> Low</strong>, <strong>Medium</strong>, and <strong>High</strong>.
            </p>
            <div className="gov-kv-list" style={{ border: '1px solid var(--border-color)', backgroundColor: '#ffffff' }}>
              <div className="gov-kv-row">
                <div className="gov-kv-label">Evaluation Attributes:</div>
                <div className="gov-kv-val">Affected Area (m²), Affected Percentage (%), Impact Type (Partial/Full), Land Classification</div>
              </div>
              <div className="gov-kv-row">
                <div className="gov-kv-label">Priority Tiers:</div>
                <div className="gov-kv-val">Low Priority, Medium Priority, High Priority</div>
              </div>
              <div className="gov-kv-row">
                <div className="gov-kv-label">Operational Goal:</div>
                <div className="gov-kv-val">Accelerate survey planning and compensation workflow by highlighting critical severance parcels.</div>
              </div>
            </div>
          </div>

          {/* System Overview */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)', textTransform: 'uppercase', marginBottom: '8px' }}>
              4. System Overview
            </h4>
            <div className="gov-table-wrapper">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>Subsystem</th>
                    <th>Component Function</th>
                    <th>Output</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Corridor Analysis</strong></td>
                    <td>Corridor buffering and boundary intersection</td>
                    <td>Affected polygon boundaries &amp; area measurements</td>
                  </tr>
                  <tr>
                    <td><strong>Land Records</strong></td>
                    <td>Survey number, ownership, and revenue village records</td>
                    <td>Land parcel boundaries &amp; land attributes</td>
                  </tr>
                  <tr>
                    <td><strong>Acquisition Analysis</strong></td>
                    <td>Partial vs. Full impact classification &amp; priority grading</td>
                    <td>Corridor impact summary &amp; urgency scores</td>
                  </tr>
                  <tr>
                    <td><strong>Map View &amp; Reporting</strong></td>
                    <td>Interactive map visualization, filters, and reports</td>
                    <td>Survey register and printable reports</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Information Advisory */}
          <div className="gov-alert gov-alert-info" style={{ margin: 0 }}>
            <strong>Information Advisory:</strong><br />
            LandTrack provides automated corridor intersection, area impact calculations, and parcel priority classification to assist in highway land acquisition management.
          </div>
        </div>
      </div>
    </div>
  );
}
