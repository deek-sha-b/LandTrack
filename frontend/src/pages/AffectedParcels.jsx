import React, { useState, useEffect } from 'react';

export default function AffectedParcels({ onNavigateToMap }) {
  const [parcelsData, setParcelsData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [roadInfo, setRoadInfo] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Load calculated affected parcels from localStorage
  useEffect(() => {
    const loadSavedParcels = () => {
      try {
        const stored = localStorage.getItem('landtrack_affected_parcels');
        if (stored) {
          const parsed = JSON.parse(stored);
          setParcelsData(parsed.parcels || []);
          setSummary(parsed.summary || null);
          setRoadInfo({
            roadName: parsed.roadName || 'Selected Road',
            roadRef: parsed.roadRef || '',
            width: parsed.width || '30'
          });
        }
      } catch (err) {
        console.warn('Error reading affected parcels from storage:', err);
      }
    };

    loadSavedParcels();
    window.addEventListener('storage', loadSavedParcels);
    return () => window.removeEventListener('storage', loadSavedParcels);
  }, []);

  const filtered = parcelsData.filter((p) => {
    if (filter === 'High Priority' && p.priority !== 'High') return false;
    if (filter === 'Medium Priority' && p.priority !== 'Medium') return false;
    if (filter === 'Low Priority' && p.priority !== 'Low') return false;
    if (filter === 'Partial Impact' && p.impact_type !== 'Partial Impact') return false;
    if (filter === 'Full Impact' && p.impact_type !== 'Full Impact') return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchId = String(p.parcel_id || '').toLowerCase().includes(q);
      const matchSurv = String(p.survey_number || '').toLowerCase().includes(q);
      const matchPrio = String(p.priority || '').toLowerCase().includes(q);
      return matchId || matchSurv || matchPrio;
    }
    return true;
  });

  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const paginated = filtered.slice(startIdx, startIdx + pageSize);

  const partialCount = summary?.partial_impact_count ?? parcelsData.filter(p => p.impact_type === 'Partial Impact').length;
  const fullCount = summary?.full_impact_count ?? parcelsData.filter(p => p.impact_type === 'Full Impact').length;
  const highPriorityCount = summary?.high_priority_count ?? parcelsData.filter(p => p.priority === 'High').length;
  const medPriorityCount = summary?.medium_priority_count ?? parcelsData.filter(p => p.priority === 'Medium').length;
  const lowPriorityCount = summary?.low_priority_count ?? parcelsData.filter(p => p.priority === 'Low').length;
  const totalCount = summary?.total_affected_parcels ?? parcelsData.length;

  return (
    <div className="affected-parcels-page">
      {/* Header Summary Cards */}
      {parcelsData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div className="gov-card" style={{ padding: '16px', borderLeft: '4px solid #173b63' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Corridor Context
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '4px' }}>
              {roadInfo?.roadName || 'Highway Corridor'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Acquisition Width: <strong>{roadInfo?.width} metres</strong>
            </div>
          </div>

          <div className="gov-card" style={{ padding: '16px', borderLeft: '4px solid #0f172a' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Affected Parcels
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {totalCount}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Spatial Intersections Identified
            </div>
          </div>

          <div className="gov-card" style={{ padding: '16px', borderLeft: '4px solid #DC2626' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>
              High Priority
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
              {highPriorityCount}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Parcels (Urgent / High Acquisition Severity)
            </div>
          </div>

          <div className="gov-card" style={{ padding: '16px', borderLeft: '4px solid #F59E0B' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
              Medium Priority
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#F59E0B', marginTop: '2px' }}>
              {medPriorityCount}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Parcels (Moderate Corridor Severance)
            </div>
          </div>

          <div className="gov-card" style={{ padding: '16px', borderLeft: '4px solid #2563EB' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase' }}>
              Low Priority
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
              {lowPriorityCount}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Parcels (Minor Edge Strip Intersection)
            </div>
          </div>
        </div>
      )}

      <div className="gov-card">
        <div className="gov-card-header">
          <div className="gov-card-title">
            AFFECTED PARCELS
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Study Area: Puttur Taluk, Karnataka
          </span>
        </div>

        <div className="gov-card-body" style={{ padding: '16px' }}>
          {/* Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', marginRight: '6px' }}>
                Filter:
              </span>
              {[
                { label: 'All', key: 'All', count: totalCount },
                { label: 'High Priority', key: 'High Priority', count: highPriorityCount },
                { label: 'Medium Priority', key: 'Medium Priority', count: medPriorityCount },
                { label: 'Low Priority', key: 'Low Priority', count: lowPriorityCount },
                { label: 'Partial Impact', key: 'Partial Impact', count: partialCount },
                { label: 'Full Impact', key: 'Full Impact', count: fullCount }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setFilter(item.key);
                    setPage(1);
                  }}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid var(--border-color)',
                    backgroundColor: filter === item.key ? 'var(--gov-navy)' : '#ffffff',
                    color: filter === item.key ? '#ffffff' : 'var(--text-main)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {item.label} ({item.count})
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                placeholder="Search Parcel ID / Survey No..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  outline: 'none',
                  width: '230px'
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Showing {filtered.length} of {totalCount} records
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="gov-table-wrapper" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
            <table className="gov-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', width: '60px' }}>Sl. No.</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)' }}>Parcel ID</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)' }}>Survey Number</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'right' }}>Total Area (m²)</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'right' }}>Affected Area (m²)</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'right' }}>Affected Percentage</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'center' }}>Impact Type</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'center' }}>Priority</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'center' }}>Map Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length > 0 ? (
                  paginated.map((p, idx) => {
                    const isFull = p.impact_type === 'Full Impact';
                    const prio = p.priority || 'Medium';
                    const prioColor = prio === 'High' ? '#DC2626' : (prio === 'Medium' ? '#F59E0B' : '#2563EB');
                    const prioBg = prio === 'High' ? '#FEF2F2' : (prio === 'Medium' ? '#FFFBEB' : '#EFF6FF');
                    const prioBorder = prio === 'High' ? '#FECACA' : (prio === 'Medium' ? '#FDE68A' : '#BFDBFE');
                    return (
                      <tr
                        key={p.id || p.parcel_id || idx}
                        style={{
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                          borderBottom: '1px solid #e2e8f0'
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', color: '#64748b' }}>
                          {startIdx + idx + 1}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', fontWeight: 600, fontFamily: 'monospace', color: '#0369a1' }}>
                          {p.parcel_id || 'Not Available'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                          {p.survey_number || 'Not Available'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', textAlign: 'right', color: '#334155' }}>
                          {Number(p.total_area).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', textAlign: 'right', fontWeight: 700, color: isFull ? '#b91c1c' : '#c2410c' }}>
                          {Number(p.affected_area).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', textAlign: 'right', fontWeight: 700 }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: isFull ? '#fee2e2' : '#ffedd5',
                            color: isFull ? '#991b1b' : '#9a3412'
                          }}>
                            {Number(p.affected_percentage).toFixed(2)}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            backgroundColor: isFull ? '#fef2f2' : '#fff7ed',
                            color: isFull ? '#b91c1c' : '#c2410c',
                            border: `1px solid ${isFull ? '#fecaca' : '#fed7aa'}`
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isFull ? '#dc2626' : '#ea580c' }} />
                            {p.impact_type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 10px',
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
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={onNavigateToMap}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              color: '#1e293b',
                              cursor: 'pointer'
                            }}
                          >
                            View on Map
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', color: 'var(--gov-navy)' }}>
                        No Affected Parcels Identified Yet
                      </div>
                      <div style={{ fontSize: '12.5px', marginBottom: '16px', color: '#64748b' }}>
                        Select a road, create an acquisition corridor, and click &ldquo;Find Affected Parcels&rdquo; on the GIS Map.
                      </div>
                      <button
                        type="button"
                        className="gov-btn gov-btn-primary"
                        onClick={onNavigateToMap}
                        style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 700 }}
                      >
                        Open GIS Map
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', fontSize: '12px', color: '#64748b' }}>
              <div>
                Showing {startIdx + 1}–{Math.min(startIdx + pageSize, filtered.length)} of {filtered.length} affected parcels
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    backgroundColor: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '11.5px',
                    fontWeight: 600
                  }}
                >
                  Previous
                </button>
                <span style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--gov-navy)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    backgroundColor: currentPage === totalPages ? '#f1f5f9' : '#ffffff',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '11.5px',
                    fontWeight: 600
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-light)', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
            * Note: Survey numbers, ownership details, total area, affected area, and impact classifications are computed from spatial intersections with the acquisition corridor.
          </div>
        </div>
      </div>
    </div>
  );
}
