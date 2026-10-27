import React, { useState, useEffect } from 'react';

export default function Reports({ onNavigateToMap }) {
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('landtrack_affected_parcels');
      if (saved) {
        const parsed = JSON.parse(saved);
        setReportData(parsed);
      }
    } catch { }
  }, []);

  const parcels = reportData?.parcels || [];
  const summary = reportData?.summary;
  const totalArea = parcels.reduce((acc, p) => acc + (Number(p.affected_area) || 0), 0);

  return (
    <div className="reports-page">
      <div className="gov-card">
        <div className="gov-card-header">
          <div className="gov-card-title">Land Acquisition Assessment Report</div>
          <button 
            type="button" 
            className="gov-btn gov-btn-secondary" 
            style={{ padding: '4px 12px', fontSize: '12px' }}
            onClick={() => window.print()}
            disabled={parcels.length === 0}
          >
            {parcels.length > 0 ? 'Print / Export PDF' : 'Export PDF (Pending Analysis)'}
          </button>
        </div>

        <div className="gov-card-body" style={{ padding: '30px' }}>
          {/* Report Header */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid var(--gov-navy)', paddingBottom: '16px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '0.5px' }}>
              LANDTRACK
            </h2>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gov-navy-light)', marginTop: '4px' }}>
              Land Acquisition Analysis Report
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Highway Infrastructure &amp; Right-of-Way Land Assessment &bull; ML Acquisition Priority
            </div>
          </div>

          {/* Report Metadata Block */}
          <div className="grid-2" style={{ marginBottom: '24px', backgroundColor: '#f8fafc', padding: '16px', border: '1px solid var(--border-color)' }}>
            <div>
              <div className="gov-kv-row">
                <div className="gov-kv-label">Study Area:</div>
                <div className="gov-kv-val">Puttur Taluk, Karnataka</div>
              </div>
              <div className="gov-kv-row">
                <div className="gov-kv-label">Selected Road:</div>
                <div className="gov-kv-val">{reportData?.roadName || 'Awaiting Selection'}</div>
              </div>
            </div>
            <div>
              <div className="gov-kv-row">
                <div className="gov-kv-label">Acquisition Width:</div>
                <div className="gov-kv-val">{reportData?.width ? `${reportData.width} metres` : '-- metres'}</div>
              </div>
              <div className="gov-kv-row">
                <div className="gov-kv-label">Analysis Date:</div>
                <div className="gov-kv-val">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>
          </div>

          {/* Summary Block */}
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)', marginBottom: '10px', textTransform: 'uppercase' }}>
            1. Executive Summary
          </h4>
          <div className="grid-4" style={{ marginBottom: '24px' }}>
            <div style={{ padding: '12px', border: '1px solid var(--border-color)', backgroundColor: '#ffffff', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Affected Parcels</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gov-navy)' }}>
                {parcels.length > 0 ? parcels.length : '--'}
              </div>
            </div>
            <div style={{ padding: '12px', border: '1px solid var(--border-color)', backgroundColor: '#ffffff', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Affected Area</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gov-navy)' }}>
                {parcels.length > 0 ? `${Math.round(totalArea).toLocaleString('en-IN')} m²` : '-- m²'}
              </div>
            </div>
            <div style={{ padding: '12px', border: '1px solid var(--border-color)', backgroundColor: '#ffffff', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Partial Parcels</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gov-navy-light)' }}>
                {parcels.length > 0 ? (summary?.partial_impact_count ?? parcels.filter(p => p.impact_type === 'Partial Impact').length) : '--'}
              </div>
            </div>
            <div style={{ padding: '12px', border: '1px solid var(--border-color)', backgroundColor: '#ffffff', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Full Parcels</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#b91c1c' }}>
                {parcels.length > 0 ? (summary?.full_impact_count ?? parcels.filter(p => p.impact_type === 'Full Impact').length) : '--'}
              </div>
            </div>
          </div>

          {/* Parcel-wise Results Table */}
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)', marginBottom: '10px', textTransform: 'uppercase' }}>
            2. Land Parcel Impact Schedule &amp; Priority Classification
          </h4>
          <div className="gov-table-wrapper" style={{ marginBottom: '24px', overflowX: 'auto' }}>
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Survey Number</th>
                  <th>Village</th>
                  <th style={{ textAlign: 'right' }}>Parcel Area (m²)</th>
                  <th style={{ textAlign: 'right' }}>Affected Area (m²)</th>
                  <th style={{ textAlign: 'right' }}>Affected %</th>
                  <th style={{ textAlign: 'center' }}>Impact Type</th>
                  <th style={{ textAlign: 'center' }}>Priority</th>
                </tr>
              </thead>
              <tbody>
                {parcels.length > 0 ? (
                  parcels.map((p, idx) => {
                    const isFull = p.impact_type === 'Full Impact';
                    const prio = p.priority || 'Medium';
                    const prioColor = prio === 'High' ? '#DC2626' : (prio === 'Medium' ? '#F59E0B' : '#2563EB');
                    const prioBg = prio === 'High' ? '#FEF2F2' : (prio === 'Medium' ? '#FFFBEB' : '#EFF6FF');
                    const prioBorder = prio === 'High' ? '#FECACA' : (prio === 'Medium' ? '#FDE68A' : '#BFDBFE');
                    return (
                      <tr key={p.id || p.parcel_id || idx}>
                        <td style={{ fontWeight: 700, color: '#0f172a' }}>{p.survey_number || 'Not Available'}</td>
                        <td>{p.village || 'Puttur'}</td>
                        <td style={{ textAlign: 'right' }}>{Number(p.total_area).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: isFull ? '#b91c1c' : '#c2410c' }}>
                          {Number(p.affected_area).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(p.affected_percentage).toFixed(2)}%</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: isFull ? '#fef2f2' : '#fff7ed',
                            color: isFull ? '#b91c1c' : '#c2410c',
                            border: `1px solid ${isFull ? '#fecaca' : '#fed7aa'}`
                          }}>
                            {p.impact_type}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            backgroundColor: prioBg,
                            color: prioColor,
                            border: `1px solid ${prioBorder}`
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: prioColor }} />
                            {prio}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No analysis data has been generated yet for this report.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Report Summary Notice */}
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', padding: '14px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 500 }}>
            LandTrack Land Acquisition Management &bull; Corridor Evaluation and Land Survey Report &bull; Powered by ML Priority Classifier
          </div>
        </div>
      </div>
    </div>
  );
}

