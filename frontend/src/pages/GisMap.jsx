import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import buffer from '@turf/buffer';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import intersect from '@turf/intersect';
import area from '@turf/area';
import { featureCollection } from '@turf/helpers';
import { Layers, ZoomIn, Search, Info, CheckCircle2, Database, AlertCircle, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { getVillageName } from '../utils/villageLookup';

const API_BASE = 'http://localhost:5000/api';
const PUTTUR_CENTER = [12.7141, 75.2451]; // Complete Puttur Taluk geographic center
const DEFAULT_ZOOM = 11;
const PUTTUR_FULL_BOUNDS = [[12.5685, 75.1403], [12.8596, 75.3499]]; // Full study area bounding box

export default function GisMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const parcelsLayerGroupRef = useRef(null);
  const roadsLayerGroupRef = useRef(null);
  const layerControlRef = useRef(null);
  const parcelsRendererRef = useRef(null);
  const parcelHighlightRendererRef = useRef(null);
  const corridorRendererRef = useRef(null);
  const affectedParcelsRendererRef = useRef(null);
  const roadsRendererRef = useRef(null);
  const roadsCasingRendererRef = useRef(null);
  const roadHighlightRendererRef = useRef(null);
  const lastClickedRoadFeatureRef = useRef(null);
  const lastClickedRoadLayerRef = useRef(null);
  const activePopupRoadFeatureRef = useRef(null);
  const activePopupRoadLayerRef = useRef(null);
  const roadFeaturesByIdRef = useRef(new Map());
  const affectedParcelsMapRef = useRef(new Map());

  const [loading, setLoading] = useState(false);
  const [roadsLoading, setRoadsLoading] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [roadsMetadata, setRoadsMetadata] = useState(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [roadsCount, setRoadsCount] = useState(0);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [searchSurveyNo, setSearchSurveyNo] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('All');
  const [villagesLookup, setVillagesLookup] = useState({});
  const selectedParcelHighlightRef = useRef(null);
  const [searchError, setSearchError] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [searching, setSearching] = useState(false);

  // Phase: Road Selection & Acquisition Corridor Workflow
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [selectedRoadFeature, setSelectedRoadFeature] = useState(null);
  const [roadWorkflowStep, setRoadWorkflowStep] = useState('none'); // 'none' | 'selected' | 'corridor'
  const [acquisitionWidth, setAcquisitionWidth] = useState('30');
  const [corridorNotice, setCorridorNotice] = useState(null);
  const [corridorCreated, setCorridorCreated] = useState(false);
  const [corridorGeoJson, setCorridorGeoJson] = useState(null);

  // Phase: Affected Parcels State
  const [affectedParcels, setAffectedParcels] = useState([]);
  const [affectedSummary, setAffectedSummary] = useState(null);
  const [analyzingParcels, setAnalyzingParcels] = useState(false);
  const [tableFilter, setTableFilter] = useState('All'); // 'All' | 'Partial Impact' | 'Full Impact'
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);

  // Searchable Road Dropdown State
  const [roadsList, setRoadsList] = useState([]);
  const [roadSearchQuery, setRoadSearchQuery] = useState('');
  const [roadDropdownOpen, setRoadDropdownOpen] = useState(false);
  const [selectedRoadCategory, setSelectedRoadCategory] = useState('All');
  const [impactThreshold, setImpactThreshold] = useState('90');

  const selectedRoadHighlightRef = useRef(null);
  const selectedRoadFeatureRef = useRef(null);
  const corridorLayerRef = useRef(null);
  const affectedParcelsLayerRef = useRef(null);
  const parcelsFeaturesRef = useRef([]);
  const roadsFeaturesRef = useRef([]);
  const handleSelectRoadRef = useRef(null);
  const layersDockContainerRef = useRef(null);
  const roadDropdownContainerRef = useRef(null);

  // Authoritative grouping key generator based on reliable road attributes:
  // 1. Route reference number ('ref', e.g. NH275, NH75, SH100, SH88, LR, MDR6)
  // 2. Road name ('name', e.g. 'Vivekananda College Road', 'Puttur - Panaje road')
  // 3. ID / OSM ID for unnamed local roads without ref (preserves them without merging unrelated roads)
  // Helper to check if a road is SH 100 (must NOT be combined)
  const isSH100Road = useCallback((p) => {
    if (!p) return false;
    const refStr = String(p.ref || '').replace(/\s+/g, '').toUpperCase();
    if (refStr === 'SH100') return true;
    const nameStr = String(p.name || '').toLowerCase();
    if (nameStr.includes('ninthikal') || nameStr.includes('sh 100') || nameStr.includes('sh100')) return true;
    return false;
  }, []);

  const getRoadGroupKey = useCallback((featureOrProps) => {
    if (!featureOrProps) return null;
    const p = featureOrProps.properties || featureOrProps;
    const id = p.osm_id || p.id || featureOrProps.id;

    // SH 100 road segments must NOT be combined - keep each segment individual
    if (isSH100Road(p)) {
      return `ID:${id}`;
    }

    const rawRef = p.ref && p.ref !== 'None' && p.ref !== 'null' ? String(p.ref).trim() : null;
    const rawName = p.name && p.name !== 'None' && p.name !== 'null' ? String(p.name).trim() : null;

    if (rawRef) {
      // Normalize ref: uppercase and strip whitespace (e.g. "SH 88" and "SH88" match as "REF:SH88")
      return `REF:${rawRef.replace(/\s+/g, '').toUpperCase()}`;
    }
    if (rawName) {
      return `NAME:${rawName.trim().toLowerCase()}`;
    }
    return `ID:${id}`;
  }, [isSH100Road]);

  // Unifies all segments belonging to the selected road into its complete available geometry
  const getCompleteRoadFeature = useCallback((targetFeature, allRoadFeatures) => {
    if (!targetFeature) return null;
    const targetProps = targetFeature.properties || {};

    // Do NOT combine SH 100 segments - keep each segment individual
    if (isSH100Road(targetProps)) {
      return targetFeature;
    }

    const groupKey = getRoadGroupKey(targetFeature);
    if (!groupKey || groupKey.startsWith('ID:')) return targetFeature;

    const sourceFeatures = allRoadFeatures && allRoadFeatures.length > 0 ? allRoadFeatures : roadsFeaturesRef.current;
    if (!sourceFeatures || sourceFeatures.length === 0) return targetFeature;

    const matchingSegments = sourceFeatures.filter(f => getRoadGroupKey(f) === groupKey);

    // If single segment or no matches, return targetFeature directly
    if (matchingSegments.length <= 1) {
      return targetFeature;
    }

    // Combine all segment geometries into a clean MultiLineString
    const coordinates = [];
    let totalLengthM = 0;
    const representativeProps = { ...targetProps };
    const names = new Set();
    const refs = new Set();
    const highways = new Set();

    matchingSegments.forEach(seg => {
      const geom = seg.geometry;
      if (geom) {
        if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
          coordinates.push(geom.coordinates);
        } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
          geom.coordinates.forEach(c => {
            if (Array.isArray(c)) coordinates.push(c);
          });
        }
      }
      const p = seg.properties || {};
      const segLen = Number(p.length_m) || 0;
      totalLengthM += segLen;
      if (p.name && p.name !== 'None' && String(p.name).trim()) names.add(String(p.name).trim());
      if (p.ref && p.ref !== 'None' && String(p.ref).trim()) refs.add(String(p.ref).trim());
      if (p.highway) highways.add(String(p.highway).trim());
    });

    if (coordinates.length === 0) {
      return targetFeature;
    }

    // Canonical name / ref from all segments
    if (!representativeProps.name || representativeProps.name === 'None') {
      representativeProps.name = names.size > 0 ? Array.from(names)[0] : null;
    }
    if (!representativeProps.ref || representativeProps.ref === 'None') {
      representativeProps.ref = refs.size > 0 ? Array.from(refs)[0] : null;
    }
    if (!representativeProps.highway && highways.size > 0) {
      representativeProps.highway = Array.from(highways)[0];
    }

    representativeProps.total_segments = matchingSegments.length;
    representativeProps.length_m = Math.round(totalLengthM * 10) / 10;
    representativeProps.length_km = Math.round((totalLengthM / 1000) * 100) / 100;
    representativeProps.is_complete_route = true;

    return {
      type: 'Feature',
      id: targetFeature.id || representativeProps.id || representativeProps.osm_id || groupKey,
      geometry: {
        type: 'MultiLineString',
        coordinates: coordinates
      },
      properties: representativeProps,
      segmentFeatures: matchingSegments
    };
  }, [getRoadGroupKey]);

  // Helper formatting for road display
  const getRoadValueDisplay = (props) => {
    if (!props) return 'Not Available';
    const name = props.name && props.name !== 'None' ? props.name : '';
    const ref = props.ref && props.ref !== 'None' ? props.ref : '';
    const segInfo = props.total_segments && props.total_segments > 1 ? ` (${props.total_segments} segments)` : '';
    if (name && ref) return `${ref} — ${name}${segInfo}`;
    if (name) return `${name}${segInfo}`;
    if (ref) return `${ref}${segInfo}`;
    return props.highway ? `Puttur Road (${props.highway.toUpperCase()})${segInfo}` : 'Not Available';
  };

  const getRoadNameOnly = (props) => {
    if (!props) return 'Not Available';
    if (props.name && props.name !== 'None') return props.name;
    if (props.ref && props.ref !== 'None') return props.ref;
    return props.highway ? `Puttur Road (${props.highway.toUpperCase()})` : 'Not Available';
  };

  // Popup creator helper conforming strictly to requirement:
  // "If Survey Number or Village is not available in the dataset, display: Not Available"
  // Displays full attribute details for both affected and unaffected parcels.
  const createPopupContent = useCallback((props) => {
    if (!props) return '';
    const surveyNo = props.survey_number && props.survey_number !== 'None' ? props.survey_number : (props.Label || 'Not Available');
    const lgdCode = props.lgd_village_code && props.lgd_village_code !== 'None' ? props.lgd_village_code : 'Not Available';
    const village = getVillageName(lgdCode, props.village);
    const villageCode = props.village_code && props.village_code !== 'None' ? props.village_code : 'Not Available';
    const ulpin = props.ulpin && props.ulpin !== 'None' ? props.ulpin : 'Not Available';

    const totalAreaNum = typeof props.area_sqm === 'number'
      ? props.area_sqm
      : (typeof props.total_area === 'number' ? props.total_area : null);
    const areaSqm = totalAreaNum !== null ? totalAreaNum.toLocaleString('en-IN') : 'Not Available';
    const areaAcres = totalAreaNum !== null
      ? (typeof props.area_acres === 'number' ? props.area_acres.toFixed(3) : (totalAreaNum / 4046.86).toFixed(3))
      : 'Not Available';
    const perimeter = typeof props.perimeter_m === 'number' ? props.perimeter_m.toLocaleString('en-IN') : 'Not Available';
    const kharab = props.kharab && props.kharab !== 'None' ? props.kharab : 'Nil';
    const cadastralId = props.kgis_cadastral_id || props.parcel_id || 'Not Available';

    // Affected impact details if this parcel intersects acquisition corridor
    const isAffected = !!props.impact_type;
    const impactType = props.impact_type || '';
    const isFull = impactType === 'Full Impact';
    const affectedPct = props.affected_percentage != null ? `${props.affected_percentage}%` : '—';
    const affectedAreaNum = typeof props.affected_area === 'number' ? props.affected_area : null;
    const affectedAreaSqm = affectedAreaNum !== null ? affectedAreaNum.toLocaleString('en-IN') : '—';
    const affectedAreaAc = affectedAreaNum !== null ? (affectedAreaNum / 4046.86).toFixed(3) : '—';
    const roadRefOrName = props.road_name || props.road_ref ? `${props.road_ref ? props.road_ref + ' ' : ''}${props.road_name || ''}`.trim() : '';
    const priority = props.priority || (isAffected ? 'Medium' : '');
    const priorityColor = priority === 'High' ? '#DC2626' : (priority === 'Medium' ? '#F59E0B' : '#2563EB');
    const priorityBg = priority === 'High' ? '#FEF2F2' : (priority === 'Medium' ? '#FFFBEB' : '#EFF6FF');
    const priorityBorder = priority === 'High' ? '#FECACA' : (priority === 'Medium' ? '#FDE68A' : '#BFDBFE');

    return `
      <div class="parcel-popup-card">
        <div class="parcel-popup-header" style="background: ${isAffected ? priorityColor : '#173b63'};">
          <div class="parcel-popup-title">
            <span>${isAffected ? `⚠️ ${priority ? `${priority} Priority` : impactType}` : 'Land Parcel'}</span>
          </div>
          <span style="font-size: 10px; background: rgba(255,255,255,0.25); padding: 2px 7px; border-radius: 3px; font-weight: 700; color: #fff;">
            ${isAffected ? `${affectedPct} Impact` : `Survey No: ${surveyNo}`}
          </span>
        </div>
        <div class="parcel-popup-body">
          <table class="parcel-popup-table">
            <tbody>
              ${isAffected ? `
              ${priority ? `
              <tr style="background: ${priorityBg}; border-left: 3px solid ${priorityColor};">
                <td style="font-weight: 700; color: ${priorityColor};">Acquisition Priority:</td>
                <td style="font-weight: 800; color: ${priorityColor};">
                  <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: #fff; border: 1px solid ${priorityBorder}; font-size: 11px;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${priorityColor};"></span>
                    ${priority} Priority
                  </span>
                </td>
              </tr>
              ` : ''}
              <tr style="background: ${isFull ? '#fef2f2' : '#fff7ed'};">
                <td style="font-weight: 700; color: ${isFull ? '#991b1b' : '#9a3412'};">Impact Status:</td>
                <td style="font-weight: 800; color: ${isFull ? '#b91c1c' : '#c2410c'};">${impactType} (${affectedPct})</td>
              </tr>
              <tr style="background: ${isFull ? '#fef2f2' : '#fff7ed'};">
                <td style="font-weight: 700; color: ${isFull ? '#991b1b' : '#9a3412'};">Affected Area:</td>
                <td style="font-weight: 800; color: ${isFull ? '#b91c1c' : '#c2410c'};">${affectedAreaSqm} m² <span style="font-size: 10.5px; font-weight: normal; color: #64748b;">(${affectedAreaAc} Ac)</span></td>
              </tr>
              ${roadRefOrName ? `
              <tr>
                <td style="font-weight: 600;">Highway Alignment:</td>
                <td style="font-weight: 700; color: #b45309;">${roadRefOrName}</td>
              </tr>
              ` : ''}
              ` : ''}
              <tr>
                <td>Survey Number:</td>
                <td style="color: #0B2545; font-weight: 700;">${surveyNo}</td>
              </tr>
              <tr>
                <td>Village:</td>
                <td style="color: #0B2545; font-weight: 600;">${village}</td>
              </tr>
              <tr>
                <td>Village Code:</td>
                <td>${villageCode}</td>
              </tr>
              <tr>
                <td>LGD Village Code:</td>
                <td>${lgdCode}</td>
              </tr>
              <tr>
                <td>Total Area:</td>
                <td>${areaSqm} m² <span style="color: #64748b; font-size: 10.5px;">(${areaAcres} Ac)</span></td>
              </tr>
              <tr>
                <td>Perimeter:</td>
                <td>${perimeter} m</td>
              </tr>
              
               
              <tr>
                <td>Survey Reference:</td>
                <td>${cadastralId}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="parcel-popup-footer">
          <span>Puttur Taluk Land Records</span>
          <span style="color: ${isAffected ? (isFull ? '#b91c1c' : '#c2410c') : '#0284c7'}; font-weight: 700;">
            ${isAffected ? impactType : 'Cadastral Boundary'}
          </span>
        </div>
      </div>
    `;
  }, []);

  // Helper calculating dynamic style for any parcel (strictly uses unique IDs to avoid false-positive survey matches)
  const getParcelStyle = useCallback((feature) => {
    const isAffectedMode = affectedParcelsMapRef.current && affectedParcelsMapRef.current.size > 0;
    if (!isAffectedMode) {
      return {
        color: '#0369a1',
        weight: 1.2,
        opacity: 0.9,
        fillColor: '#38bdf8',
        fillOpacity: 0.16,
        lineJoin: 'round'
      };
    }
    const fid = feature?.id != null ? String(feature.id) : (feature?.properties?.fid != null ? String(feature.properties.fid) : null);
    const kgisId = feature?.properties?.kgis_cadastral_id != null && String(feature.properties.kgis_cadastral_id) !== 'None' && String(feature.properties.kgis_cadastral_id) !== 'Not Available'
      ? String(feature.properties.kgis_cadastral_id)
      : null;
    const ulpin = feature?.properties?.ulpin != null && String(feature.properties.ulpin) !== 'None' && String(feature.properties.ulpin) !== 'Not Available'
      ? String(feature.properties.ulpin)
      : null;

    const affected = (fid && affectedParcelsMapRef.current.get(fid)) ||
      (kgisId && affectedParcelsMapRef.current.get(kgisId)) ||
      (ulpin && affectedParcelsMapRef.current.get(ulpin));

    if (affected) {
      const prio = affected.priority;
      let strokeColor = '#2563EB';
      let fillOp = 0.25;
      if (prio === 'High') {
        strokeColor = '#DC2626';
        fillOp = 0.25;
      } else if (prio === 'Medium') {
        strokeColor = '#F59E0B';
        fillOp = 0.25;
      } else if (prio === 'Low') {
        strokeColor = '#2563EB';
        fillOp = 0.25;
      } else {
        strokeColor = affected.impact_type === 'Full Impact' ? '#DC2626' : '#F59E0B';
        fillOp = 0.25;
      }
      return {
        color: strokeColor,
        weight: 2.0,
        opacity: 1.0,
        fillColor: strokeColor,
        fillOpacity: fillOp,
        lineJoin: 'round'
      };
    }
    return {
      color: '#0369a1',
      weight: 1.0,
      opacity: 0.8,
      fillColor: '#38bdf8',
      fillOpacity: 0.12,
      lineJoin: 'round'
    };
  }, []);

  // Reset parcels layer styles to default normal view
  const resetParcelsLayerStyle = useCallback(() => {
    if (affectedParcelsMapRef.current) {
      affectedParcelsMapRef.current.clear();
    }
    if (parcelsLayerGroupRef.current) {
      parcelsLayerGroupRef.current.eachLayer((groupLayer) => {
        if (groupLayer.eachLayer) {
          groupLayer.eachLayer((l) => {
            l.setStyle({
              color: '#0369a1',
              weight: 1.0,
              opacity: 0.8,
              fillColor: '#38bdf8',
              fillOpacity: 0.12
            });
            if (l.feature && l.feature.properties) {
              delete l.feature.properties.impact_type;
              delete l.feature.properties.affected_area;
              delete l.feature.properties.affected_percentage;
              l.setPopupContent(createPopupContent(l.feature.properties));
            }
          });
        }
      });
    }
  }, [createPopupContent]);

  // Handler for selecting a road from popup
  // Handler for selecting a road from popup or dropdown
  const handleSelectRoad = useCallback((feature, layer) => {
    if (!feature) return;

    // Unify all segments belonging to this road to highlight and buffer complete available geometry
    const completeRoad = getCompleteRoadFeature(feature, roadsFeaturesRef.current);
    const props = completeRoad.properties || {};

    // 1. Store the selected road (replaces previous selection) and open corridor step directly
    setSelectedRoad(props);
    setSelectedRoadFeature(completeRoad);
    selectedRoadFeatureRef.current = completeRoad;
    setRoadWorkflowStep('corridor');
    setRoadDropdownOpen(false);
    setCorridorCreated(false);
    setCorridorNotice(null);
    setAffectedParcels([]);
    setAffectedSummary(null);

    // Clean up any existing corridor layer and affected parcels layer
    if (corridorLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(corridorLayerRef.current);
      corridorLayerRef.current = null;
    }
    if (affectedParcelsLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(affectedParcelsLayerRef.current);
      affectedParcelsLayerRef.current = null;
    }
    resetParcelsLayerStyle();

    // 2. Close the popup
    if (mapInstanceRef.current) {
      mapInstanceRef.current.closePopup();
    }

    // 3. Highlight the complete selected road on the map (all segments)
    if (selectedRoadHighlightRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(selectedRoadHighlightRef.current);
      selectedRoadHighlightRef.current = null;
    }

    if (mapInstanceRef.current && completeRoad.geometry) {
      // 3a. White casing beneath selected-road line (~8px)
      const whiteCasing = L.geoJSON(completeRoad, {
        pane: 'selectedRoadCasingPane',
        style: {
          color: '#FFFFFF',
          weight: 8.0,
          opacity: 1.0,
          lineCap: 'round',
          lineJoin: 'round'
        },
        interactive: false
      });

      // 3b. Purple selected road line (~5px) matching reference design (#8B5CF6 / #482414)
      const roadLine = L.geoJSON(completeRoad, {
        pane: 'roadHighlightPane',
        renderer: roadHighlightRendererRef.current || undefined,
        style: {
          color: '#482414ff',
          weight: 5.0,
          opacity: 1.0,
          lineCap: 'round',
          lineJoin: 'round'
        },
        interactive: false
      });

      const highlightGroup = L.featureGroup([whiteCasing, roadLine]);
      highlightGroup.addTo(mapInstanceRef.current);
      highlightGroup.bringToFront();
      selectedRoadHighlightRef.current = highlightGroup;

      const bounds = whiteCasing.getBounds();
      if (bounds.isValid() && mapInstanceRef.current) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      }
    }
  }, [getCompleteRoadFeature, resetParcelsLayerStyle]);

  // Handler to clear/deselect road
  const handleClearSelectedRoad = useCallback(() => {
    setSelectedRoad(null);
    setSelectedRoadFeature(null);
    selectedRoadFeatureRef.current = null;
    activePopupRoadFeatureRef.current = null;
    activePopupRoadLayerRef.current = null;
    lastClickedRoadFeatureRef.current = null;
    lastClickedRoadLayerRef.current = null;
    setRoadWorkflowStep('none');
    setCorridorCreated(false);
    setCorridorGeoJson(null);
    setCorridorNotice(null);
    setAffectedParcels([]);
    setAffectedSummary(null);

    if (selectedRoadHighlightRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(selectedRoadHighlightRef.current);
      selectedRoadHighlightRef.current = null;
    }

    if (corridorLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(corridorLayerRef.current);
      corridorLayerRef.current = null;
    }

    if (affectedParcelsLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(affectedParcelsLayerRef.current);
      affectedParcelsLayerRef.current = null;
    }

    resetParcelsLayerStyle();
  }, [resetParcelsLayerStyle]);

  // Handler for "Create Corridor" using the entered acquisition width
  const handleCreateCorridor = async () => {
    const widthVal = parseFloat(acquisitionWidth);
    if (isNaN(widthVal) || widthVal <= 0) {
      setCorridorNotice('Please enter a valid acquisition width in metres (e.g. 30).');
      return;
    }

    const featureToBuffer = selectedRoadFeature || selectedRoadFeatureRef.current;
    if (!featureToBuffer || !featureToBuffer.geometry) {
      setCorridorNotice('Road geometry not available to generate buffer.');
      return;
    }

    try {
      let buffered = null;
      // 1. Primary: backend metric buffer in UTM Zone 43N (EPSG:32643)
      try {
        const res = await fetch(`${API_BASE}/roads/corridor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            road_id: selectedRoad?.id || selectedRoad?.osm_id,
            road: featureToBuffer,
            width_meters: widthVal
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.geometry) buffered = data;
        }
      } catch (err) {
        console.warn('Backend corridor buffer fallback notice:', err);
      }

      // 2. Client-side Turf.js fallback
      if (!buffered) {
        buffered = buffer(featureToBuffer, widthVal / 2.0, { units: 'meters' });
      }

      // 3. Display the corridor/buffer clearly on the map
      if (corridorLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(corridorLayerRef.current);
        corridorLayerRef.current = null;
      }

      if (mapInstanceRef.current && buffered) {
        const corridorLayer = L.geoJSON(buffered, {
          pane: 'corridorPane',
          interactive: false, // Prevents acquisition corridor buffer from blocking parcel clicks
          renderer: corridorRendererRef.current || undefined,
          style: {
            color: '#6B7280',            // Medium-grey outline (~2px stroke)
            weight: 2.0,
            fillColor: '#6f6c77ff',        // Translucent grey corridor fill
            fillOpacity: 0.40,           // 0.40 fill opacity
            lineJoin: 'round',
            lineCap: 'round'
          }
        });

        corridorLayer.addTo(mapInstanceRef.current);
        corridorLayerRef.current = corridorLayer;
        setCorridorGeoJson(buffered);

        // Keep the selected road line + white casing visible on top
        if (selectedRoadHighlightRef.current) {
          selectedRoadHighlightRef.current.bringToFront();
        }

        // Fit map view to corridor bounds
        const bounds = corridorLayer.getBounds();
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
      }

      setCorridorCreated(true);
      setCorridorNotice(null);
    } catch (err) {
      console.error('Error creating corridor buffer:', err);
      setCorridorNotice('Unable to generate corridor buffer. Please check road geometry.');
    }
  };

  // Handler for "Find Affected Parcels"
  const handleFindAffectedParcels = async () => {
    const corridorData = corridorGeoJson;
    if (!corridorData) {
      setCorridorNotice('Please create an acquisition corridor first.');
      return;
    }

    setAnalyzingParcels(true);

    let parcels = [];
    let summary = { total_affected_parcels: 0, partial_impact_count: 0, full_impact_count: 0 };

    // 1. Primary: query backend spatial intersection
    try {
      const res = await fetch(`${API_BASE}/corridor/intersect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corridor: corridorData,
          impact_threshold: parseFloat(impactThreshold) || 90.0,
          road_details: {
            road_name: getRoadNameOnly(selectedRoad),
            road_ref: selectedRoad?.ref || '',
            width: acquisitionWidth
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.parcels && data.parcels.length > 0) {
          parcels = data.parcels;
          summary = data.summary || {
            total_affected_parcels: parcels.length,
            partial_impact_count: parcels.filter(p => p.impact_type === 'Partial Impact').length,
            full_impact_count: parcels.filter(p => p.impact_type === 'Full Impact').length
          };
        }
      }
    } catch (err) {
      console.warn('Backend spatial intersection fallback notice:', err);
    }

    // 2. Client-side Turf spatial intersection fallback if backend was unavailable or returned empty
    if (parcels.length === 0 && parcelsFeaturesRef.current.length > 0) {
      try {
        const cBbox = bbox(corridorData);
        const candidates = parcelsFeaturesRef.current.filter(p => {
          if (!p.geometry) return false;
          try {
            const pBbox = bbox(p);
            return !(pBbox[2] < cBbox[0] || pBbox[0] > cBbox[2] || pBbox[3] < cBbox[1] || pBbox[1] > cBbox[3]);
          } catch {
            return false;
          }
        });

        const thresholdVal = parseFloat(impactThreshold) || 90.0;
        let partialCount = 0;
        let fullCount = 0;

        for (const p of candidates) {
          try {
            if (!p.geometry) continue;
            const pFeat = { type: 'Feature', geometry: p.geometry, properties: p.properties || {} };
            const cFeat = corridorData.type === 'Feature' ? corridorData : { type: 'Feature', geometry: corridorData, properties: {} };

            // Accurate spatial intersection: parcel must genuinely intersect road-buffer polygon
            if (booleanIntersects(pFeat, cFeat)) {
              let intersection = null;
              try {
                intersection = intersect(featureCollection([pFeat, cFeat]));
              } catch {
                intersection = null;
              }

              // Only genuine positive intersections count (> 0.05 sqm). Exclude touching lines or points!
              if (!intersection || !intersection.geometry) continue;
              const interArea = area(intersection);
              if (interArea <= 0.05) continue;

              const geomArea = area(pFeat) > 0 ? Math.round(area(pFeat) * 100) / 100 : 0;
              const affectedArea = Math.round(interArea * 100) / 100;
              let totalArea = geomArea || p.properties?.area_sqm || 1000;
              if (totalArea <= 0 || totalArea < affectedArea) {
                totalArea = affectedArea;
              }
              const affectedPct = Math.min(100, Math.max(0, Math.round((affectedArea / totalArea) * 10000) / 100));
              const impactType = affectedPct >= thresholdVal ? 'Full Impact' : 'Partial Impact';

              if (impactType === 'Full Impact') fullCount++;
              else partialCount++;

              const surveyNo = p.properties?.survey_number && p.properties.survey_number !== 'None'
                ? p.properties.survey_number
                : (p.properties?.Label || 'Not Available');

              const parcelId = p.properties?.kgis_cadastral_id && p.properties.kgis_cadastral_id !== 'None'
                ? p.properties.kgis_cadastral_id
                : (p.properties?.ulpin || `PARCEL-${p.id || p.properties?.fid || Math.floor(Math.random() * 10000)}`);

              const lgdCode = p.properties?.lgd_village_code || 'Not Available';
              const villageName = getVillageName(lgdCode, p.properties?.village);

              // Predict priority using heuristic consistent with model
              const normPct = affectedPct / 100.0;
              const normArea = Math.min(affectedArea / 5000.0, 1.0);
              const score = 0.55 * normPct + 0.40 * normArea;
              const priority = score >= 0.55 ? 'High' : (score >= 0.25 ? 'Medium' : 'Low');

              parcels.push({
                id: p.id || p.properties?.fid,
                parcel_id: parcelId,
                survey_number: surveyNo,
                village: villageName,
                village_code: p.properties?.village_code || 'Not Available',
                lgd_village_code: lgdCode,
                total_area: totalArea,
                affected_area: affectedArea,
                affected_percentage: affectedPct,
                impact_type: impactType,
                priority: priority,
                geometry: p.geometry
              });
            }
          } catch {
            continue;
          }
        }

        parcels.sort((a, b) => b.affected_percentage - a.affected_percentage);
        summary = {
          total_affected_parcels: parcels.length,
          partial_impact_count: partialCount,
          full_impact_count: fullCount
        };
      } catch (err) {
        console.error('Local geometric intersection error:', err);
      }
    }

    // Filter to ensure every parcel strictly has a genuine positive intersection with corridorData
    const genuinelyAffectedParcels = [];
    const thresholdVal = parseFloat(impactThreshold) || 90.0;
    let genuinePartial = 0;
    let genuineFull = 0;

    for (const p of parcels) {
      if (!p) continue;
      let geom = p.geometry;
      if (!geom && parcelsFeaturesRef.current && parcelsFeaturesRef.current.length > 0) {
        const found = parcelsFeaturesRef.current.find(f => String(f.id) === String(p.id) || String(f.properties?.fid) === String(p.id));
        if (found) geom = found.geometry;
      }

      // If parcel has geometry, spatially double-check against actual corridor polygon to rule out edge-touching or false positives
      if (geom) {
        try {
          const pFeat = { type: 'Feature', geometry: geom, properties: {} };
          const cFeat = corridorData.type === 'Feature' ? corridorData : { type: 'Feature', geometry: corridorData, properties: {} };
          if (!booleanIntersects(pFeat, cFeat)) {
            continue; // Does not touch or intersect buffer
          }
          let inter = null;
          try {
            inter = intersect(featureCollection([pFeat, cFeat]));
          } catch {
            inter = null;
          }
          if (!inter || !inter.geometry || area(inter) <= 0.05) {
            continue; // Touching only at vertex or border line, not genuinely intersecting
          }
        } catch {
          // If Turf check fails on complex multipolygon, keep if backend metric affected_area was positive
          if (!p.affected_area || p.affected_area <= 0.05) continue;
        }
      } else {
        if (!p.affected_area || p.affected_area <= 0.05) continue;
      }

      if (p.impact_type === 'Full Impact') genuineFull++;
      else genuinePartial++;
      genuinelyAffectedParcels.push(p);
    }

    parcels = genuinelyAffectedParcels;
    summary = {
      total_affected_parcels: parcels.length,
      partial_impact_count: genuinePartial,
      full_impact_count: genuineFull
    };

    setAnalyzingParcels(false);
    setAffectedParcels(parcels);
    setAffectedSummary(summary);

    // Save to localStorage so Affected Parcels page tab gets the exact calculated records
    try {
      localStorage.setItem('landtrack_affected_parcels', JSON.stringify({
        parcels,
        summary,
        roadName: getRoadNameOnly(selectedRoad),
        roadRef: selectedRoad?.ref || '',
        width: acquisitionWidth,
        updatedAt: new Date().toISOString()
      }));
    } catch { }

    // 3. Highlight affected parcels on map & mute unaffected parcels
    if (mapInstanceRef.current) {
      if (affectedParcelsLayerRef.current) {
        mapInstanceRef.current.removeLayer(affectedParcelsLayerRef.current);
        affectedParcelsLayerRef.current = null;
      }

      if (parcels.length === 0) {
        resetParcelsLayerStyle();
        setCorridorNotice('No cadastral parcels genuinely intersect the selected road acquisition corridor.');
        return;
      }

      // Populate affectedParcelsMapRef strictly using unique parcel identifiers (id / fid / kgis_cadastral_id / ulpin).
      // NEVER use survey_number or generic values to prevent false positives across villages!
      const affectedMap = new Map();
      parcels.forEach((p) => {
        if (p.id != null && String(p.id).trim()) {
          affectedMap.set(String(p.id), p);
        }
        if (p.fid != null && String(p.fid).trim()) {
          affectedMap.set(String(p.fid), p);
        }
        if (p.parcel_id != null && !String(p.parcel_id).startsWith('PARCEL-') && String(p.parcel_id) !== 'Not Available' && String(p.parcel_id) !== 'None') {
          affectedMap.set(String(p.parcel_id), p);
        }
        if (p.kgis_cadastral_id != null && String(p.kgis_cadastral_id) !== 'Not Available' && String(p.kgis_cadastral_id) !== 'None') {
          affectedMap.set(String(p.kgis_cadastral_id), p);
        }
        if (p.ulpin != null && String(p.ulpin) !== 'Not Available' && String(p.ulpin) !== 'None') {
          affectedMap.set(String(p.ulpin), p);
        }
      });
      affectedParcelsMapRef.current = affectedMap;

      const affectedFeatures = parcels
        .filter(p => p.geometry)
        .map(p => ({
          type: 'Feature',
          id: p.id,
          properties: p,
          geometry: p.geometry
        }));

      const affectedLayer = L.geoJSON({ type: 'FeatureCollection', features: affectedFeatures }, {
        pane: 'affectedParcelsPane',
        renderer: affectedParcelsRendererRef.current || undefined,
        style: (feature) => {
          const prio = feature.properties?.priority;
          let polyColor = '#2563EB'; // Low = blue #2563EB
          let fillOp = 0.25;
          if (prio === 'High') {
            polyColor = '#DC2626'; // High = red #DC2626
            fillOp = 0.25;
          } else if (prio === 'Medium') {
            polyColor = '#F59E0B'; // Medium = orange #F59E0B
            fillOp = 0.25;
          } else if (prio === 'Low') {
            polyColor = '#2563EB'; // Low = blue #2563EB
            fillOp = 0.25;
          } else {
            polyColor = feature.properties?.impact_type === 'Full Impact' ? '#DC2626' : '#F59E0B';
            fillOp = 0.25;
          }
          return {
            color: polyColor,
            weight: 2.0,                 // ~2px clear outline with matching color
            opacity: 1.0,
            fillColor: polyColor,
            fillOpacity: fillOp,         // Transparent fill (0.20 / 0.22)
            lineJoin: 'round'
          };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindPopup(createPopupContent(p), {
            className: 'gov-parcel-popup',
            maxWidth: 340,
            minWidth: 280
          });

          layer.on({
            mouseover: (e) => {
              const target = e.target;
              target.setStyle({
                weight: 3.0,
                opacity: 1.0,
                fillOpacity: 0.38
              });
              if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                target.bringToFront();
              }
            },
            mouseout: (e) => {
              affectedLayer.resetStyle(e.target);
            },
            click: (e) => {
              setSelectedParcel(p);
              if (layer.openPopup) {
                layer.openPopup(e.latlng);
              }
              // Highlight clicked parcel on map
              if (selectedParcelHighlightRef.current && mapInstanceRef.current) {
                mapInstanceRef.current.removeLayer(selectedParcelHighlightRef.current);
                selectedParcelHighlightRef.current = null;
              }
              if (mapInstanceRef.current && feature) {
                const hl = L.geoJSON(feature, {
                  pane: 'parcelHighlightPane',
                  renderer: parcelHighlightRendererRef.current || undefined,
                  style: {
                    color: '#f97316',
                    weight: 3.0,
                    opacity: 1.0,
                    fillColor: '#fdba74',
                    fillOpacity: 0.35
                  },
                  interactive: false
                });
                hl.addTo(mapInstanceRef.current);
                selectedParcelHighlightRef.current = hl;
              }
            }
          });
        }
      });

      affectedLayer.addTo(mapInstanceRef.current);
      affectedParcelsLayerRef.current = affectedLayer;

      // Keep selected road highlight razor-sharp above the affected parcels
      if (selectedRoadHighlightRef.current) {
        selectedRoadHighlightRef.current.bringToFront();
      }

      // 4. Update base parcels: highlight affected ones with transparent styling and mute unaffected ones
      if (parcelsLayerGroupRef.current) {
        parcelsLayerGroupRef.current.eachLayer((groupLayer) => {
          if (groupLayer.eachLayer) {
            groupLayer.eachLayer((l) => {
              const feat = l.feature;
              const fid = feat?.id != null ? String(feat.id) : (feat?.properties?.fid != null ? String(feat.properties.fid) : null);
              const kgisId = feat?.properties?.kgis_cadastral_id != null && String(feat.properties.kgis_cadastral_id) !== 'None' && String(feat.properties.kgis_cadastral_id) !== 'Not Available'
                ? String(feat.properties.kgis_cadastral_id)
                : null;
              const ulpin = feat?.properties?.ulpin != null && String(feat.properties.ulpin) !== 'None' && String(feat.properties.ulpin) !== 'Not Available'
                ? String(feat.properties.ulpin)
                : null;

              const aff = (fid && affectedMap.get(fid)) ||
                (kgisId && affectedMap.get(kgisId)) ||
                (ulpin && affectedMap.get(ulpin));

              if (aff) {
                Object.assign(l.feature.properties, aff);
                const prio = aff.priority;
                let strokeColor = '#2563EB'; // Low = blue #2563EB
                let fillOp = 0.25;
                if (prio === 'High') {
                  strokeColor = '#DC2626'; // High = red #DC2626
                  fillOp = 0.25;
                } else if (prio === 'Medium') {
                  strokeColor = '#F59E0B'; // Medium = orange #F59E0B
                  fillOp = 0.25;
                } else if (prio === 'Low') {
                  strokeColor = '#2563EB'; // Low = blue #2563EB
                  fillOp = 0.25;
                } else {
                  strokeColor = aff.impact_type === 'Full Impact' ? '#DC2626' : '#F59E0B';
                  fillOp = 0.25;
                }
                l.setStyle({
                  color: strokeColor,
                  weight: 2.0,           // ~2px stroke width matching requirement
                  opacity: 1.0,
                  fillColor: strokeColor,
                  fillOpacity: fillOp    // Transparent fill (0.20 / 0.22)
                });
                l.setPopupContent(createPopupContent(l.feature.properties));
              } else {
                if (l.feature?.properties) {
                  delete l.feature.properties.impact_type;
                  delete l.feature.properties.affected_area;
                  delete l.feature.properties.affected_percentage;
                }
                l.setStyle({
                  color: '#94a3b8',
                  weight: 0.8,
                  opacity: 0.40,
                  fillColor: '#f8fafc',
                  fillOpacity: 0.03
                });
                l.setPopupContent(createPopupContent(l.feature.properties));
              }
            });
          }
        });
      }

      // Smoothly fit bounds to affected parcels
      const bounds = affectedLayer.getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }
  };

  // Handler for zoom to a specific affected parcel on the map
  const handleZoomToParcel = (parcel) => {
    if (!mapInstanceRef.current || !parcel.geometry) return;
    try {
      setSelectedParcel(parcel);
      const pLayer = L.geoJSON(parcel.geometry);
      const b = pLayer.getBounds();
      if (b.isValid()) {
        mapInstanceRef.current.fitBounds(b, { maxZoom: 18, padding: [60, 60] });
        if (mapContainerRef.current) {
          mapContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Highlight parcel
        if (selectedParcelHighlightRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(selectedParcelHighlightRef.current);
          selectedParcelHighlightRef.current = null;
        }
        const hl = L.geoJSON(parcel.geometry, {
          pane: 'parcelHighlightPane',
          renderer: parcelHighlightRendererRef.current || undefined,
          style: {
            color: '#f97316',
            weight: 3.5,
            opacity: 1.0,
            fillColor: '#fdba74',
            fillOpacity: 0.45
          },
          interactive: false
        });
        hl.addTo(mapInstanceRef.current);
        selectedParcelHighlightRef.current = hl;

        // Open popup at parcel center
        const center = b.getCenter();
        L.popup({ className: 'gov-parcel-popup', maxWidth: 340, minWidth: 280 })
          .setLatLng(center)
          .setContent(createPopupContent(parcel))
          .openOn(mapInstanceRef.current);
      }
    } catch { }
  };

  // Keep ref up to date
  useEffect(() => {
    handleSelectRoadRef.current = handleSelectRoad;
  }, [handleSelectRoad]);

  // Handle click outside to close road dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (roadDropdownContainerRef.current && !roadDropdownContainerRef.current.contains(e.target)) {
        setRoadDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ensure layer control container is securely mounted in the dock below the map
  useEffect(() => {
    if (layersDockContainerRef.current && layerControlRef.current) {
      const container = layerControlRef.current.getContainer();
      if (container && !layersDockContainerRef.current.contains(container)) {
        layersDockContainerRef.current.innerHTML = '';
        layersDockContainerRef.current.appendChild(container);
      }
    }
  });

  // Fetch dataset metadata on mount (Cadastral and Roads)
  useEffect(() => {
    fetch(`${API_BASE}/cadastral/metadata`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setMetadata(data);
      })
      .catch(err => {
        console.warn('Could not load cadastral metadata from API:', err);
      });

    fetch(`${API_BASE}/roads/metadata`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setRoadsMetadata(data);
      })
      .catch(err => {
        console.warn('Could not load roads metadata from API:', err);
      });

    fetch(`${API_BASE}/cadastral/villages`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.lookup) {
          setVillagesLookup(data.lookup);
        }
      })
      .catch(err => {
        console.warn('Could not load village list:', err);
      });
  }, []);


  // Fetch and display cadastral parcels
  const loadParcels = useCallback((bbox = null, queryOrSurvey = null, specificVillage = null) => {
    if (!parcelsLayerGroupRef.current) return;

    setLoading(true);
    setSearchError(null);
    setApiError(null);

    let url = `${API_BASE}/cadastral/parcels?limit=25000`;
    if (bbox) {
      url += `&bbox=${bbox.minx},${bbox.miny},${bbox.maxx},${bbox.maxy}`;
    }
    const q = queryOrSurvey !== null ? queryOrSurvey : searchSurveyNo;
    if (q && q.trim()) {
      url += `&search=${encodeURIComponent(q.trim())}`;
    }
    const v = specificVillage !== null ? specificVillage : selectedVillage;
    if (v && v !== 'All') {
      url += `&village_code=${encodeURIComponent(v)}`;
    }

    fetch(url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`API request failed with status HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then(geoJsonData => {
        setLoading(false);

        if (geoJsonData.error) {
          setApiError(geoJsonData.error);
          return;
        }

        const features = geoJsonData.features || [];
        setLoadedCount(features.length);
        parcelsFeaturesRef.current = features;

        if (features.length === 0) {
          if (q && q.trim()) {
            setSearchError(`Parcel / Survey / ID "${q.trim()}" was not found in Puttur cadastral dataset.`);
          } else if (v && v !== 'All') {
            setSearchError(`No parcels found for village code "${v}".`);
          } else {
            setApiError('The cadastral dataset returned 0 parcel features. Please check the dataset source.');
          }
          return;
        }

        // Clear existing parcels
        parcelsLayerGroupRef.current.clearLayers();

        // Create Leaflet GeoJSON layer
        const geoLayer = L.geoJSON(geoJsonData, {
          pane: 'parcelsPane',
          renderer: parcelsRendererRef.current || undefined,
          style: (feature) => getParcelStyle(feature),
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};

            // Bind popup
            layer.bindPopup(createPopupContent(props), {
              className: 'gov-parcel-popup',
              maxWidth: 340,
              minWidth: 280
            });

            // Interactive highlights on hover and selection
            layer.on({
              mouseover: (e) => {
                const target = e.target;
                target.setStyle({
                  color: '#ea580c',       // High-visibility amber on hover
                  weight: 2.6,
                  opacity: 1.0,
                  fillColor: '#fb923c',
                  fillOpacity: 0.42
                });
                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                  target.bringToFront();
                }
              },
              mouseout: (e) => {
                e.target.setStyle(getParcelStyle(e.target.feature));
              },
              click: (e) => {
                setSelectedParcel(props);
                if (layer.openPopup) {
                  layer.openPopup(e.latlng);
                }
                // Highlight clicked parcel on map
                if (selectedParcelHighlightRef.current && mapInstanceRef.current) {
                  mapInstanceRef.current.removeLayer(selectedParcelHighlightRef.current);
                  selectedParcelHighlightRef.current = null;
                }
                if (mapInstanceRef.current && feature) {
                  const hl = L.geoJSON(feature, {
                    pane: 'parcelHighlightPane',
                    renderer: parcelHighlightRendererRef.current || undefined,
                    style: {
                      color: '#f97316',      // Vivid saffron/amber border
                      weight: 3.5,
                      opacity: 1.0,
                      fillColor: '#fdba74',
                      fillOpacity: 0.45
                    },
                    interactive: false
                  });
                  hl.addTo(mapInstanceRef.current);
                  selectedParcelHighlightRef.current = hl;
                }
              }
            });
          }
        });

        // Add to layer group
        parcelsLayerGroupRef.current.addLayer(geoLayer);

        // Automatically fit the Leaflet map to the cadastral GeoJSON bounds after the data loads
        if (mapInstanceRef.current) {
          const bounds = geoLayer.getBounds();
          if (bounds.isValid()) {
            if (q && q.trim()) {
              mapInstanceRef.current.fitBounds(bounds, { maxZoom: 18, padding: [50, 50] });
              const firstLayer = Object.values(geoLayer._layers)[0];
              if (firstLayer && firstLayer.openPopup) {
                firstLayer.openPopup();
                setSelectedParcel(firstLayer.feature?.properties);
              }
            } else if (v && v !== 'All') {
              mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
            } else {
              mapInstanceRef.current.fitBounds(bounds, { padding: [25, 25] });
            }
          }
        }
      })
      .catch(err => {
        setLoading(false);
        console.error('Failed to load cadastral parcels:', err);
        setApiError(`Unable to load land parcel records (${err.message}). Please click Retry.`);
      });
  }, [createPopupContent, getParcelStyle, searchSurveyNo, selectedVillage]);

  // Popup creator helper for Puttur road network features
  const createRoadPopupContent = useCallback((featureOrProps) => {
    const isFeature = featureOrProps && (featureOrProps.geometry || featureOrProps.type === 'Feature');
    const feature = isFeature ? featureOrProps : null;
    const props = isFeature ? (featureOrProps.properties || {}) : (featureOrProps || {});

    // Compute route-level complete information across all segments
    const groupKey = getRoadGroupKey(props);
    const matchingSegs = (roadsFeaturesRef.current || []).filter(f => getRoadGroupKey(f) === groupKey);
    const hasMultiple = matchingSegs.length > 1;
    let totalLengthKm = null;
    let totalLengthM = 0;
    if (hasMultiple) {
      matchingSegs.forEach(s => {
        totalLengthM += Number(s.properties?.length_m) || 0;
      });
      totalLengthKm = (totalLengthM / 1000).toFixed(2);
    }

    const name = props.name && props.name !== 'None' ? props.name : 'Not Available';
    const ref = props.ref && props.ref !== 'None' ? props.ref : 'Not Available';
    const highway = props.highway ? props.highway.toUpperCase() : 'ROAD';
    const lengthKm = typeof props.length_km === 'number' ? `${props.length_km.toFixed(2)} km` : 'Not Available';
    const lengthM = typeof props.length_m === 'number' ? `${props.length_m.toLocaleString('en-IN')} m` : '';
    const osmId = props.osm_id || 'Not Available';
    const uniqueFeatureId = feature && feature.id != null ? String(feature.id) : (props.id != null ? String(props.id) : String(osmId));

    const headerLabel = ref !== 'Not Available'
      ? `🛣️ ${ref}${name !== 'Not Available' ? ' — ' + name : ''}`
      : `🛣️ ${name !== 'Not Available' ? name : 'Puttur Road (' + highway + ')'}`;

    return `
      <div class="road-popup-card">
        <div class="road-popup-header">
          <div class="road-popup-title">
            <span>${headerLabel}</span>
          </div>
          <span style="font-size: 10px; background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 2px; color: #fff;">
            ${highway}
          </span>
        </div>
        <div class="parcel-popup-body">
          <table class="parcel-popup-table">
            <tbody>
              <tr>
                <td>Road Ref / No:</td>
                <td style="color: #b45309; font-weight: 700; font-size: 13px;">${ref}</td>
              </tr>
              <tr>
                <td>Road Name:</td>
                <td style="color: #0f172a; font-weight: 600;">${name}</td>
              </tr>
              <tr>
                <td>Classification:</td>
                <td>${highway}</td>
              </tr>
              ${hasMultiple ? `
              <tr>
                <td>Complete Route:</td>
                <td style="color: #1e40af; font-weight: 700;">${totalLengthKm} km <span style="font-size: 10.5px; color: #64748b;"></span></td>
              </tr>
              
              ` : `
              <tr>
                <td>Segment Length:</td>
                <td>${lengthKm} <span style="color: #64748b; font-size: 10px;">(${lengthM})</span></td>
              </tr>
              `}
              <tr>
                <td>Road Reference:</td>
                <td style="font-size: 11px;">${osmId}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="parcel-popup-footer">
          <span>Puttur Roads &amp; Highways</span>
          <span style="color: #d97706; font-weight: 600;">Road Network</span>
        </div>
        <div style="padding: 10px 12px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
          <button
            type="button"
            class="select-road-btn"
            data-road-feature-id="${uniqueFeatureId}"
            data-road-osm-id="${osmId}"
            data-road-ref="${ref}"
            onclick="window.__landtrackSelectRoad && window.__landtrackSelectRoad('${uniqueFeatureId}')"
            style="width: 100%; padding: 8px 14px; background: #173b63; color: #ffffff; border: none; border-radius: 4px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.15); transition: background-color 0.2s;"
            onmouseover="this.style.backgroundColor='#0e2540'"
            onmouseout="this.style.backgroundColor='#173b63'"
          >
            ${hasMultiple ? `Select This Road` : 'Select This Road'}
          </button>
        </div>
      </div>
    `;
  }, [getRoadGroupKey]);

  // Fetch and display Puttur roads / highways
  const loadRoads = useCallback(() => {
    if (!roadsLayerGroupRef.current) return;

    setRoadsLoading(true);

    fetch(`${API_BASE}/roads`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(geoJsonData => {
        setRoadsLoading(false);
        const features = geoJsonData.features || [];
        setRoadsCount(features.length);
        setRoadsList(features);
        roadsFeaturesRef.current = features;

        // Build exact ID map for zero-ambiguity road lookup
        const idMap = new Map();
        features.forEach(f => {
          if (f.id != null) idMap.set(String(f.id), f);
          if (f.properties?.id != null) idMap.set(String(f.properties.id), f);
          if (f.properties?.osm_id != null) idMap.set(String(f.properties.osm_id), f);
        });
        roadFeaturesByIdRef.current = idMap;

        roadsLayerGroupRef.current.clearLayers();

        // 1. Casing underlay for road network
        const casingLayer = L.geoJSON(geoJsonData, {
          pane: 'roadsCasingPane',
          renderer: roadsCasingRendererRef.current || undefined,
          style: (feature) => {
            const hw = (feature?.properties?.highway || '').toLowerCase();
            const isMajor = ['trunk', 'primary', 'secondary'].includes(hw);
            return {
              color: '#78350f',      // Dark casing outline
              weight: isMajor ? 6.5 : 3.6,
              opacity: isMajor ? 0.95 : 0.65,
              lineCap: 'round',
              lineJoin: 'round'
            };
          },
          interactive: false
        });
        roadsLayerGroupRef.current.addLayer(casingLayer);

        // 2. High-visibility core road layer
        const roadLayer = L.geoJSON(geoJsonData, {
          pane: 'roadsPane',
          renderer: roadsRendererRef.current || undefined,
          style: (feature) => {
            const hw = (feature?.properties?.highway || '').toLowerCase();
            const isMajor = ['trunk', 'primary', 'secondary'].includes(hw);
            return {
              color: isMajor ? '#d97706' : '#f59e0b',   // Darker amber for highways, gold for local roads
              weight: isMajor ? 4.5 : 2.5,
              opacity: 1.0,
              lineCap: 'round',
              lineJoin: 'round'
            };
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            layer.feature = feature;
            layer.bindPopup(createRoadPopupContent(feature), {
              className: 'gov-road-popup',
              maxWidth: 320,
              minWidth: 280
            });

            layer.on({
              click: () => {
                lastClickedRoadFeatureRef.current = feature;
                lastClickedRoadLayerRef.current = layer;
                activePopupRoadFeatureRef.current = feature;
                activePopupRoadLayerRef.current = layer;
              },
              popupopen: (e) => {
                lastClickedRoadFeatureRef.current = feature;
                lastClickedRoadLayerRef.current = layer;
                activePopupRoadFeatureRef.current = feature;
                activePopupRoadLayerRef.current = layer;
                const popupEl = e.popup ? e.popup.getElement() : null;
                if (popupEl) {
                  const btn = popupEl.querySelector('.select-road-btn');
                  if (btn) {
                    btn.onclick = (event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      handleSelectRoad(feature, layer);
                    };
                  }
                }
              },
              mouseover: (e) => {
                const target = e.target;
                const hw = (props.highway || '').toLowerCase();
                const isMajor = ['trunk', 'primary', 'secondary'].includes(hw);
                target.setStyle({
                  color: '#ea580c',
                  weight: isMajor ? 6.5 : 4.5,
                  opacity: 1.0
                });
                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                  target.bringToFront();
                }
              },
              mouseout: (e) => {
                roadLayer.resetStyle(e.target);
              }
            });
          }
        });

        roadsLayerGroupRef.current.addLayer(roadLayer);
      })
      .catch(err => {
        setRoadsLoading(false);
        console.warn('Failed to load Puttur roads:', err);
      });
  }, [createRoadPopupContent, handleSelectRoad]);

  // Initialize Map
  useEffect(() => {
    if (mapInstanceRef.current || !mapContainerRef.current) return;

    // 1. Base Map Tile Layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Survey of India / KGIS'
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    });

    const cartoLightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    });

    // 2. Initialize Leaflet Map with Canvas renderer for supreme responsiveness across full dataset
    const map = L.map(mapContainerRef.current, {
      center: PUTTUR_CENTER,
      zoom: DEFAULT_ZOOM,
      layers: [osmLayer],
      preferCanvas: true
    });

    mapInstanceRef.current = map;

    // Dedicated Panes for strict layer hierarchy and visual stacking order:
    // 1. Base map: tilePane (z-index 200)

    // 2. Cadastral parcel boundaries (z-index 350)
    const parcelsPane = map.createPane('parcelsPane');
    parcelsPane.style.zIndex = '350';

    // 2b. General Road casing outline (z-index 358)
    const roadsCasingPane = map.createPane('roadsCasingPane');
    roadsCasingPane.style.zIndex = '358';
    roadsCasingPane.style.pointerEvents = 'none';

    // 2c. Ordinary Roads & highways layer (z-index 360)
    const roadsPane = map.createPane('roadsPane');
    roadsPane.style.zIndex = '360';
    roadsPane.style.pointerEvents = 'none';

    // 3. Acquisition corridor buffer (z-index 420) - above base parcels, beneath affected fills & road
    const corridorPane = map.createPane('corridorPane');
    corridorPane.style.zIndex = '420';
    corridorPane.style.pointerEvents = 'none';

    // 4. Affected parcels priority fills (z-index 450) - transparent fills allow corridor to show through
    const affectedParcelsPane = map.createPane('affectedParcelsPane');
    affectedParcelsPane.style.zIndex = '450';

    // 4b. Single parcel selection highlight (z-index 460)
    const parcelHighlightPane = map.createPane('parcelHighlightPane');
    parcelHighlightPane.style.zIndex = '460';
    parcelHighlightPane.style.pointerEvents = 'none';

    // 5. Selected road white casing outline (z-index 550) - stands out against corridor
    const selectedRoadCasingPane = map.createPane('selectedRoadCasingPane');
    selectedRoadCasingPane.style.zIndex = '550';
    selectedRoadCasingPane.style.pointerEvents = 'none';

    // 6. Selected road purple core line (z-index 560) - purple selected road on top
    const roadHighlightPane = map.createPane('roadHighlightPane');
    roadHighlightPane.style.zIndex = '560';
    roadHighlightPane.style.pointerEvents = 'none';

    // Explicit renderers:
    // Canvas for parcels (high performance over 11,000+ polygons)
    parcelsRendererRef.current = L.canvas({ pane: 'parcelsPane' });
    // SVG renderers for overlays and roads so transparent/uncovered areas never intercept mouse clicks
    parcelHighlightRendererRef.current = L.svg({ pane: 'parcelHighlightPane' });
    corridorRendererRef.current = L.svg({ pane: 'corridorPane' });
    affectedParcelsRendererRef.current = L.svg({ pane: 'affectedParcelsPane' });
    roadsCasingRendererRef.current = L.svg({ pane: 'roadsCasingPane' });
    roadsRendererRef.current = L.svg({ pane: 'roadsPane' });
    roadHighlightRendererRef.current = L.svg({ pane: 'roadHighlightPane' });

    // Listen for popup opens to wire road selection button
    map.on('popupopen', (e) => {
      const popupEl = e.popup ? e.popup.getElement() : null;
      if (!popupEl) return;
      const sourceLayer = e.popup && e.popup._source;
      const feat = (sourceLayer && sourceLayer.feature) ||
        activePopupRoadFeatureRef.current ||
        lastClickedRoadFeatureRef.current;
      if (feat) {
        activePopupRoadFeatureRef.current = feat;
        if (sourceLayer) activePopupRoadLayerRef.current = sourceLayer;
      }
      const btn = popupEl.querySelector('.select-road-btn');
      if (btn) {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          const targetFeat = (e.popup && e.popup._source && e.popup._source.feature) ||
            activePopupRoadFeatureRef.current ||
            lastClickedRoadFeatureRef.current;
          if (targetFeat && handleSelectRoadRef.current) {
            handleSelectRoadRef.current(targetFeat, e.popup ? e.popup._source : null);
          } else {
            const fid = btn.getAttribute('data-road-feature-id') || btn.getAttribute('data-road-osm-id');
            if (window.__landtrackSelectRoad) {
              window.__landtrackSelectRoad(fid);
            }
          }
        };
      }
    });

    // Window global & capture click listener for road selection from popup
    window.__landtrackSelectRoad = (featureId) => {
      let feat = activePopupRoadFeatureRef.current;
      if (featureId) {
        const idStr = String(featureId);
        if (feat && (String(feat.id) === idStr || String(feat.properties?.id) === idStr || String(feat.properties?.osm_id) === idStr)) {
          // Exact clicked feature confirmed
        } else if (roadFeaturesByIdRef.current && roadFeaturesByIdRef.current.has(idStr)) {
          feat = roadFeaturesByIdRef.current.get(idStr);
        } else if (roadsFeaturesRef.current && roadsFeaturesRef.current.length > 0) {
          feat = roadsFeaturesRef.current.find(f => {
            return String(f.id) === idStr ||
              String(f.properties?.id) === idStr ||
              String(f.properties?.osm_id) === idStr;
          }) || null;
        }
      }
      if (!feat && lastClickedRoadFeatureRef.current) {
        feat = lastClickedRoadFeatureRef.current;
      }
      if (feat && handleSelectRoadRef.current) {
        handleSelectRoadRef.current(feat, activePopupRoadLayerRef.current || lastClickedRoadLayerRef.current);
      }
    };

    const handleDocumentSelectRoadClick = (e) => {
      const btn = e.target && e.target.closest && e.target.closest('.select-road-btn');
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        const fid = btn.getAttribute('data-road-feature-id') || btn.getAttribute('data-road-osm-id');
        if (window.__landtrackSelectRoad) {
          window.__landtrackSelectRoad(fid);
        }
      }
    };
    document.addEventListener('click', handleDocumentSelectRoadClick, true);

    // 3. Cadastral Parcels Layer Group
    const parcelsLayerGroup = L.layerGroup();
    parcelsLayerGroup.addTo(map);
    parcelsLayerGroupRef.current = parcelsLayerGroup;

    // 4. Puttur Roads & Highways Layer Group
    const roadsLayerGroup = L.layerGroup();
    roadsLayerGroup.addTo(map);
    roadsLayerGroupRef.current = roadsLayerGroup;

    // 5. Add Layer Control (Base maps + Overlays for Cadastral & Roads)
    const baseMaps = {
      "OpenStreetMap": osmLayer,
      // "CartoDB Clean Light": cartoLightLayer,
      "Esri World Satellite": satelliteLayer
    };

    const overlayMaps = {
      "Roads": roadsLayerGroup,
      "Cadastral Parcels": parcelsLayerGroup
    };

    const layerControl = L.control.layers(baseMaps, overlayMaps, {
      position: 'topright',
      collapsed: false
    });
    layerControl.addTo(map);
    layerControlRef.current = layerControl;

    // Reposition layer control (radio button box) into dedicated dock tray below map
    if (layersDockContainerRef.current) {
      layersDockContainerRef.current.innerHTML = '';
      layersDockContainerRef.current.appendChild(layerControl.getContainer());
    }

    // 6. Add Leaflet Scale Control
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    // Initial load of parcels and roads for the default view
    loadParcels();
    loadRoads();

    return () => {
      if (selectedParcelHighlightRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(selectedParcelHighlightRef.current);
        selectedParcelHighlightRef.current = null;
      }
      if (selectedRoadHighlightRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(selectedRoadHighlightRef.current);
        selectedRoadHighlightRef.current = null;
      }
      if (corridorLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(corridorLayerRef.current);
        corridorLayerRef.current = null;
      }
      if (affectedParcelsLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(affectedParcelsLayerRef.current);
        affectedParcelsLayerRef.current = null;
      }
      document.removeEventListener('click', handleDocumentSelectRoadClick, true);
      delete window.__landtrackSelectRoad;
      map.remove();
      mapInstanceRef.current = null;
      parcelsRendererRef.current = null;
      parcelHighlightRendererRef.current = null;
      corridorRendererRef.current = null;
      affectedParcelsRendererRef.current = null;
      roadsCasingRendererRef.current = null;
      roadsRendererRef.current = null;
      roadHighlightRendererRef.current = null;
    };
  }, [loadParcels, loadRoads]);

  // Handler for reset zoom to complete Puttur study area extent
  const handleResetExtent = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(PUTTUR_FULL_BOUNDS, { padding: [20, 20], animate: true });
      setSelectedVillage('All');
      setSearchSurveyNo('');
      if (selectedParcelHighlightRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(selectedParcelHighlightRef.current);
        selectedParcelHighlightRef.current = null;
      }
      loadParcels(null, '', 'All');
      loadRoads();
    }
  };

  // Handler for Universal Parcel Search (Survey No, Parcel ID, ULPIN)
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchSurveyNo.trim()) {
      loadParcels(null, '', selectedVillage);
      return;
    }
    setSearching(true);
    loadParcels(null, searchSurveyNo.trim(), selectedVillage);
    setSearching(false);
  };

  return (
    <div className="gis-map-page">
      {/* Configuration & Status Strip */}
      <div className="gov-card" style={{ marginBottom: '16px' }}>
        <div className="gov-card-header">
          <div className="gov-card-title">
            <Layers size={18} style={{ color: 'var(--gov-saffron)', display: 'inline', marginRight: '8px' }} />
            Puttur Land &amp; Road Map
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="sys-badge" style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-color)', fontWeight: 600 }}>
              Study Area: Puttur Taluk
            </span>
            <span className="sys-badge" style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-color)', color: '#475569' }}>
              District: Dakshina Kannada
            </span>
          </div>
        </div>

        <div className="gov-card-body" style={{ padding: '14px 18px' }}>
          {/* Top Controls Toolbar */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>

            {/* Universal Search (Survey Number, Parcel ID, ULPIN) */}
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1', minWidth: '280px', maxWidth: '440px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  placeholder="Search Survey No, Parcel ID, or ULPIN..."
                  value={searchSurveyNo}
                  onChange={(e) => setSearchSurveyNo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    fontSize: '13px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    backgroundColor: '#ffffff'
                  }}
                />
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              </div>

              <button
                type="submit"
                className="gov-btn gov-btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
                disabled={searching}
              >
                Find Parcel
              </button>

              {searchSurveyNo && (
                <button
                  type="button"
                  onClick={() => { setSearchSurveyNo(''); loadParcels(null, '', selectedVillage); }}
                  className="gov-btn gov-btn-secondary"
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                >
                  Clear
                </button>
              )}
            </form>

            {/* Village Filter Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '220px', maxWidth: '280px' }}>
              <select
                id="village-filter-select"
                value={selectedVillage}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedVillage(val);
                  loadParcels(null, searchSurveyNo, val);
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '12.5px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="All">🏛️ All Villages (Puttur Taluk)</option>
                {Object.entries(villagesLookup)
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({code})
                    </option>
                  ))}
              </select>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleResetExtent}
                className="gov-btn gov-btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 14px' }}
                title="Reset zoom to Puttur Taluk center"
              >
                <ZoomIn size={14} /> Center Puttur
              </button>

              <button
                type="button"
                onClick={() => { loadParcels(); loadRoads(); }}
                className="gov-btn gov-btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 14px' }}
                title="Reload cadastral parcels & highways"
              >
                <RefreshCw size={14} className={(loading || roadsLoading) ? 'spinner' : ''} /> Reload
              </button>
            </div>
          </div>

          {/* Row 2: Searchable Road Dropdown & Highway Alignment Selection */}
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>

              {/* Dropdown Container */}
              <div ref={roadDropdownContainerRef} style={{ position: 'relative', flex: '1', minWidth: '320px', maxWidth: '640px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--gov-navy)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🛣️ Select Road Alignment:
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    ({roadsCount || roadsList.length} Network Features)
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search road by name, ref (NH275, SH55, MDR6), type or ID..."
                    value={roadSearchQuery}
                    onChange={(e) => {
                      setRoadSearchQuery(e.target.value);
                      setRoadDropdownOpen(true);
                    }}
                    onFocus={() => setRoadDropdownOpen(true)}
                    style={{
                      width: '100%',
                      padding: '8px 36px 8px 34px',
                      fontSize: '13px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      outline: 'none',
                      fontWeight: 500
                    }}
                  />
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />

                  {/* Toggle Dropdown arrow / clear button */}
                  <div style={{ position: 'absolute', right: '8px', top: '7px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {roadSearchQuery && (
                      <button
                        type="button"
                        onClick={() => { setRoadSearchQuery(''); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', padding: '2px 4px' }}
                        title="Clear filter"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRoadDropdownOpen(!roadDropdownOpen)}
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}
                      title="Toggle Road Dropdown"
                    >
                      {roadDropdownOpen ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {/* Dropdown Menu Popup */}
                {roadDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      backgroundColor: '#ffffff',
                      borderRadius: '6px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
                      border: '1px solid #cbd5e1',
                      zIndex: 1050,
                      overflow: 'hidden'
                    }}
                  >
                    {/* Category Filter Tabs */}
                    <div style={{ display: 'flex', gap: '4px', padding: '8px 10px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
                      {[
                        { label: 'All', key: 'All' },
                        { label: 'Highways (NH/SH/MDR)', key: 'Highways' },
                        { label: 'Classified', key: 'Classified' },
                        { label: 'Named Roads', key: 'Named' }
                      ].map(cat => (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setSelectedRoadCategory(cat.key)}
                          style={{
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '3px',
                            border: '1px solid',
                            borderColor: selectedRoadCategory === cat.key ? '#173b63' : '#cbd5e1',
                            backgroundColor: selectedRoadCategory === cat.key ? '#173b63' : '#ffffff',
                            color: selectedRoadCategory === cat.key ? '#ffffff' : '#334155',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* Filtered Road List */}
                    <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                      {(() => {
                        const q = roadSearchQuery.trim().toLowerCase();

                        // Build distinct complete roads for dropdown
                        const groupMap = new Map();
                        (roadsList || []).forEach(f => {
                          const key = getRoadGroupKey(f);
                          if (!key) return;
                          if (!groupMap.has(key)) {
                            groupMap.set(key, []);
                          }
                          groupMap.get(key).push(f);
                        });

                        const unifiedRoadList = [];
                        groupMap.forEach((segs) => {
                          const first = segs[0];
                          const complete = segs.length > 1 ? getCompleteRoadFeature(first, segs) : first;
                          unifiedRoadList.push(complete);
                        });

                        let filtered = unifiedRoadList.filter(f => {
                          const p = f.properties || {};
                          const hw = (p.highway || '').toLowerCase();
                          const name = (p.name || '').toLowerCase();
                          const ref = (p.ref || '').toLowerCase();
                          const osmId = String(p.osm_id || f.id || '').toLowerCase();

                          // Category filter
                          if (selectedRoadCategory === 'Highways') {
                            const isHw = ['trunk', 'primary', 'secondary'].includes(hw) || ref.startsWith('nh') || ref.startsWith('sh') || ref.startsWith('mdr');
                            if (!isHw) return false;
                          } else if (selectedRoadCategory === 'Classified') {
                            if (!['trunk', 'primary', 'secondary', 'tertiary', 'unclassified'].includes(hw)) return false;
                          } else if (selectedRoadCategory === 'Named') {
                            if (!p.name || p.name === 'None' || !p.name.trim()) return false;
                          }

                          // Query search (also matches any segment ID in unified road)
                          if (q) {
                            const directMatch = name.includes(q) || ref.includes(q) || hw.includes(q) || osmId.includes(q);
                            if (directMatch) return true;
                            if (f.segmentFeatures && f.segmentFeatures.some(s => String(s.properties?.osm_id || s.id || '').toLowerCase().includes(q))) {
                              return true;
                            }
                            return false;
                          }
                          return true;
                        });

                        // Sort: highways with ref/name first, then major, then by length
                        filtered.sort((a, b) => {
                          const ap = a.properties || {};
                          const bp = b.properties || {};
                          const aHasMajor = ap.ref || (ap.name && ap.name !== 'None');
                          const bHasMajor = bp.ref || (bp.name && bp.name !== 'None');
                          if (aHasMajor && !bHasMajor) return -1;
                          if (!aHasMajor && bHasMajor) return 1;
                          return (bp.length_m || 0) - (ap.length_m || 0);
                        });

                        if (filtered.length === 0) {
                          return (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                              No roads matching "{roadSearchQuery}"
                            </div>
                          );
                        }

                        return (
                          <div>
                            <div style={{ padding: '5px 12px', fontSize: '11px', fontWeight: 600, color: '#64748b', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                              Showing {Math.min(filtered.length, 60)} of {filtered.length} roads (Selects complete road route)
                            </div>
                            {filtered.slice(0, 60).map((f, i) => {
                              const p = f.properties || {};
                              const hw = (p.highway || 'road').toUpperCase();
                              const isSelected = selectedRoad && (
                                String(selectedRoad.id) === String(p.id) ||
                                String(selectedRoad.osm_id) === String(p.osm_id) ||
                                (!isSH100Road(selectedRoad) && !isSH100Road(p) && (
                                  (selectedRoad.ref && p.ref && selectedRoad.ref.replace(/\s+/g, '').toUpperCase() === p.ref.replace(/\s+/g, '').toUpperCase()) ||
                                  (selectedRoad.name && p.name && selectedRoad.name.toLowerCase() === p.name.toLowerCase())
                                ))
                              );
                              const isMajor = ['TRUNK', 'PRIMARY', 'SECONDARY'].includes(hw);
                              const displayName = p.ref && p.name ? `${p.ref} — ${p.name}` : (p.ref || p.name || `Road #${p.osm_id || f.id}`);
                              const segCount = p.total_segments || (f.segmentFeatures ? f.segmentFeatures.length : 1);

                              return (
                                <div
                                  key={p.id || p.osm_id || i}
                                  onClick={() => handleSelectRoad(f)}
                                  style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                                    transition: 'background-color 0.1s'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#dbeafe' : '#f8fafc'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#eff6ff' : '#ffffff'}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <span style={{ fontSize: '14px' }}>🛣️</span>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: isSelected ? '#1d4ed8' : '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {displayName}
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span>{p.ref ? `Route: ${p.ref}` : `ID: ${p.osm_id || p.id}`}</span>
                                        {segCount > 1 && (
                                          <span style={{ color: '#1d4ed8', fontWeight: 700, backgroundColor: '#eff6ff', padding: '1px 6px', borderRadius: '3px' }}>
                                            {segCount} segments
                                          </span>
                                        )}
                                        {p.surface && <span>• {p.surface}</span>}
                                        {p.lanes && <span>• {p.lanes} lanes</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                      {p.length_km ? `${Number(p.length_km).toFixed(2)} km` : (p.length_m ? `${Number(p.length_m).toFixed(0)} m` : '')}
                                    </span>
                                    <span style={{
                                      padding: '2px 6px',
                                      borderRadius: '3px',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      backgroundColor: isMajor ? '#fef3c7' : '#f1f5f9',
                                      color: isMajor ? '#92400e' : '#475569',
                                      border: isMajor ? '1px solid #fde68a' : '1px solid #e2e8f0'
                                    }}>
                                      {hw}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Road Status Bar / Actions */}
              {selectedRoad && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{
                    padding: '6px 12px',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>
                      Active Road:
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                      {getRoadValueDisplay(selectedRoad)}
                    </span>
                    <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>
                      ({selectedRoad.length_km ? `${selectedRoad.length_km} km` : ''})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setRoadWorkflowStep('corridor')}
                    className="gov-btn gov-btn-primary"
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700 }}
                  >
                    Acquisition Corridor ({acquisitionWidth}m)
                  </button>

                  <button
                    type="button"
                    onClick={handleClearSelectedRoad}
                    className="gov-btn gov-btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    title="Deselect Road"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search Alert */}
          {searchError && (
            <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '12px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{searchError}</span>
            </div>
          )}

          {/* Notice Display */}
          {apiError && (
            <div style={{
              marginTop: '12px',
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #f87171',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#991b1b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
                <div>
                  <strong>Notice:</strong> {apiError}
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadParcels()}
                className="gov-btn gov-btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
              >
                <RefreshCw size={12} style={{ marginRight: '4px' }} /> Retry
              </button>
            </div>
          )}

          {/* Information Strip */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: 'var(--gov-navy)' }}>Cadastral Parcels:</strong> {loadedCount.toLocaleString()} Records
            </div>
            <div>
              <strong style={{ color: 'var(--gov-navy)' }}>Road Network:</strong> {roadsCount || 425} Features
            </div>
            <div>
              <strong style={{ color: 'var(--gov-navy)' }}>Total Parcels:</strong> {metadata?.total_parcels ? metadata.total_parcels.toLocaleString() : '11,304'}
            </div>
            <div>
              <strong style={{ color: 'var(--gov-navy)' }}>Location:</strong> Puttur Taluk, Karnataka
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Map Card */}
      <div className="gov-card" style={{ marginBottom: '16px' }}>
        <div className="gov-card-header">
          <div className="gov-card-title">
            OpenStreetMap, Puttur Cadastral Parcels &amp; Roads Overlay
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Toggle layers in top-right control. Click parcels or roads for spatial attributes.
          </span>
        </div>

        <div style={{ padding: '16px' }}>
          <div className="gis-map-wrapper">
            {/* The Leaflet DOM Element */}
            <div ref={mapContainerRef} className="gis-leaflet-container" />

            {/* Phase: Selected Road Floating Panel (Step 1) */}
            {selectedRoad && roadWorkflowStep === 'selected' && (
              <div
                className="selected-road-panel"
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: '54px',
                  zIndex: 1000,
                  width: '320px',
                  maxWidth: 'calc(100% - 70px)',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
                  border: '1px solid #cbd5e1',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  backgroundColor: '#173b63',
                  color: '#ffffff',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '3px solid #b8792a'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                    SELECTED ROAD
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelectedRoad}
                    title="Deselect Road"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      opacity: 0.85
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: '14px 16px', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                      Road Name:
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                      {selectedRoad.name && selectedRoad.name !== 'None' ? selectedRoad.name : (selectedRoad.ref ? `${selectedRoad.ref} Alignment` : 'Unnamed Highway Segment')}
                    </div>
                  </div>

                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '14px' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>Ref / Route No:</td>
                        <td style={{ padding: '4px 0', fontWeight: 700, color: '#b45309', textAlign: 'right' }}>
                          {selectedRoad.ref && selectedRoad.ref !== 'None' ? selectedRoad.ref : 'Not Available'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>Classification:</td>
                        <td style={{ padding: '4px 0', textAlign: 'right' }}>
                          <span style={{ display: 'inline-block', padding: '1px 6px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>
                            {selectedRoad.highway ? selectedRoad.highway.toUpperCase() : 'ROAD'}
                          </span>
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>
                          {selectedRoad.total_segments && selectedRoad.total_segments > 1 ? 'Total Route Length:' : 'Segment Length:'}
                        </td>
                        <td style={{ padding: '4px 0', fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                          {selectedRoad.length_km ? `${Number(selectedRoad.length_km).toFixed(2)} km` : '—'}
                          {selectedRoad.total_segments && selectedRoad.total_segments > 1 && (
                            <span style={{ fontSize: '11px', color: '#1d4ed8', marginLeft: '6px', fontWeight: 700 }}>
                              ({selectedRoad.total_segments} segments)
                            </span>
                          )}
                          <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '4px' }}>
                            ({selectedRoad.length_m ? `${Number(selectedRoad.length_m).toLocaleString()} m` : ''})
                          </span>
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>Lanes / Surface:</td>
                        <td style={{ padding: '4px 0', color: '#334155', textAlign: 'right' }}>
                          {selectedRoad.lanes ? `${selectedRoad.lanes} lanes` : '—'} / {selectedRoad.surface || 'asphalt'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>Speed Limit:</td>
                        <td style={{ padding: '4px 0', color: '#334155', textAlign: 'right' }}>
                          {selectedRoad.maxspeed ? `${selectedRoad.maxspeed} km/h` : 'Not Specified'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>Bridge / Tunnel:</td>
                        <td style={{ padding: '4px 0', color: '#334155', textAlign: 'right' }}>
                          {selectedRoad.bridge ? `Bridge (${selectedRoad.bridge})` : (selectedRoad.tunnel ? `Tunnel (${selectedRoad.tunnel})` : 'None')}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>Road Identifier:</td>
                        <td style={{ padding: '4px 0', fontFamily: 'monospace', fontSize: '11px', color: '#0369a1', textAlign: 'right' }}>
                          {selectedRoad.osm_id || selectedRoad.id || 'N/A'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ marginTop: '12px', marginBottom: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                    <label
                      htmlFor="corridor-width-input-panel"
                      style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}
                    >
                      Acquisition Width (metres)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        id="corridor-width-input-panel"
                        type="number"
                        min="1"
                        max="500"
                        value={acquisitionWidth}
                        onChange={(e) => {
                          setAcquisitionWidth(e.target.value);
                          setCorridorNotice(null);
                        }}
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          fontSize: '13px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          outline: 'none',
                          fontWeight: 600
                        }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>m</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setRoadWorkflowStep('corridor')}
                      className="gov-btn gov-btn-secondary"
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                    >
                      Corridor Form
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRoadWorkflowStep('corridor');
                        handleCreateCorridor();
                      }}
                      className="gov-btn gov-btn-primary"
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Create Corridor Buffer →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Phase: Acquisition Corridor Floating Panel (Step 2 - Input Form) */}
            {selectedRoad && roadWorkflowStep === 'corridor' && !corridorCreated && (
              <div
                className="acquisition-corridor-panel"
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: '54px',
                  zIndex: 1000,
                  width: '320px',
                  maxWidth: 'calc(100% - 70px)',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
                  border: '1px solid #cbd5e1',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  backgroundColor: '#173b63',
                  color: '#ffffff',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '3px solid #b8792a'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                    ACQUISITION CORRIDOR
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelectedRoad}
                    title="Close"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      opacity: 0.85
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: '14px 16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                      Selected Road
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                      {getRoadNameOnly(selectedRoad)}
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label
                      htmlFor="corridor-width-input"
                      style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}
                    >
                      Acquisition Width
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        id="corridor-width-input"
                        type="number"
                        min="1"
                        max="500"
                        value={acquisitionWidth}
                        onChange={(e) => {
                          setAcquisitionWidth(e.target.value);
                          setCorridorNotice(null);
                        }}
                        placeholder="enter width in metres"
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '13px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          outline: 'none',
                          fontWeight: 600
                        }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>metres</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>

                    </div>
                  </div>

                  {corridorNotice && (
                    <div style={{
                      marginBottom: '14px',
                      padding: '8px 10px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '4px',
                      fontSize: '11.5px',
                      color: '#991b1b',
                      lineHeight: '1.4'
                    }}>
                      {corridorNotice}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setRoadWorkflowStep('selected')}
                      className="gov-btn gov-btn-secondary"
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCorridor}
                      className="gov-btn gov-btn-primary"
                      style={{ flex: 1, padding: '8px 14px', fontSize: '13px', fontWeight: 700 }}
                    >
                      Create Corridor
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Phase: Acquisition Corridor Analysis Panel (Step 2 - Corridor Created) */}
            {selectedRoad && roadWorkflowStep === 'corridor' && corridorCreated && (
              <div
                className="acquisition-corridor-panel"
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: '54px',
                  zIndex: 1000,
                  width: '320px',
                  maxWidth: 'calc(100% - 70px)',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
                  border: '1px solid #cbd5e1',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  backgroundColor: '#173b63',
                  color: '#ffffff',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '3px solid #b8792a'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                    ACQUISITION CORRIDOR
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelectedRoad}
                    title="Close"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '14px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      opacity: 0.85
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: '14px 16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                      Selected Road:
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                      {getRoadNameOnly(selectedRoad)}
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                      Acquisition Width:
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                      {acquisitionWidth} metres
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Corridor:
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700 }}>
                      <span>✓</span> Created
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleFindAffectedParcels}
                    disabled={analyzingParcels}
                    className="gov-btn gov-btn-primary"
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: analyzingParcels ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {analyzingParcels ? (
                      <>
                        <span className="spinner" style={{ width: '13px', height: '13px' }} />
                        <span>Finding Affected Parcels...</span>
                      </>
                    ) : (
                      'Find Affected Parcels'
                    )}
                  </button>

                  {/* Requirement 8: Show an affected-parcel summary */}
                  {affectedSummary && (
                    <div style={{
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px solid #e2e8f0'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        color: '#173b63',
                        letterSpacing: '0.6px',
                        textTransform: 'uppercase',
                        marginBottom: '8px'
                      }}>
                        AFFECTED PARCELS
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '7px 10px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0'
                        }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                            Total Affected Parcels:
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                            {affectedSummary.total_affected_parcels}
                          </span>
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '7px 10px',
                          backgroundColor: '#fff7ed',
                          borderRadius: '4px',
                          border: '1px solid #fed7aa'
                        }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#c2410c' }}>
                            Partial Impact:
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#c2410c' }}>
                            {affectedSummary.partial_impact_count}
                          </span>
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '7px 10px',
                          backgroundColor: '#fef2f2',
                          borderRadius: '4px',
                          border: '1px solid #fecaca'
                        }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c' }}>
                            Full Impact:
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#b91c1c' }}>
                            {affectedSummary.full_impact_count}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('affected-parcels-table-section');
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        style={{
                          width: '100%',
                          marginTop: '10px',
                          padding: '7px 10px',
                          backgroundColor: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          color: '#1e293b',
                          cursor: 'pointer'
                        }}
                      >
                        View Parcel Table ↓
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCorridorCreated(false);
                        setAffectedParcels([]);
                        setAffectedSummary(null);
                        if (corridorLayerRef.current && mapInstanceRef.current) {
                          mapInstanceRef.current.removeLayer(corridorLayerRef.current);
                          corridorLayerRef.current = null;
                        }
                        if (affectedParcelsLayerRef.current && mapInstanceRef.current) {
                          mapInstanceRef.current.removeLayer(affectedParcelsLayerRef.current);
                          affectedParcelsLayerRef.current = null;
                        }
                        resetParcelsLayerStyle();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        fontSize: '11.5px',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Change Corridor Width
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Top-Right ML Priority Card (matching reference design) */}
            <div
              className="gis-ml-priority-legend"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 990,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                border: '1px solid #e2e8f0',
                padding: '10px 14px',
                fontSize: '11px',
                minWidth: '130px',
                pointerEvents: 'auto'
              }}
            >
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '8px', fontSize: '11.5px' }}>
                ML Priority
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '18px', height: '11px', backgroundColor: 'rgba(220, 38, 38, 0.25)', border: '1.5px solid #DC2626', borderRadius: '3px' }} />
                  <span style={{ color: '#334155', fontWeight: 500 }}>High Priority</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '18px', height: '11px', backgroundColor: 'rgba(245, 158, 11, 0.25)', border: '1.5px solid #F59E0B', borderRadius: '3px' }} />
                  <span style={{ color: '#334155', fontWeight: 500 }}>Medium Priority</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '18px', height: '11px', backgroundColor: 'rgba(37, 99, 235, 0.25)', border: '1.5px solid #2563EB', borderRadius: '3px' }} />
                  <span style={{ color: '#334155', fontWeight: 500 }}>Low Priority</span>
                </div>
              </div>
            </div>

            {/* On-Map Bottom-Right Legend (matching reference design) */}
            {/* <div
              className="gis-on-map-legend"
              style={{
                position: 'absolute',
                bottom: '24px',
                right: '12px',
                zIndex: 990,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                border: '1px solid #e2e8f0',
                padding: '10px 14px',
                fontSize: '11px',
                minWidth: '185px',
                pointerEvents: 'auto'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Selected Road */}
            {/* <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '22px',
                height: '8px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #e2e8f0',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 1px'
              }}>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#8B5CF6',
                  borderRadius: '1.5px'
                }} />
              </div>
              <span style={{ color: '#334155', fontWeight: 500 }}>Selected Road</span>
            </div>

            {/* Acquisition Corridor */}
            {/* <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '20px',
                height: '11px',
                backgroundColor: 'rgba(156, 163, 175, 0.40)',
                border: '1.5px solid #6B7280',
                borderRadius: '2px'
              }} />
              <span style={{ color: '#334155', fontWeight: 500 }}>Acquisition Corridor ({acquisitionWidth || 30} m)</span>
            </div> */}

            {/* Affected Parcels */}
            {/* <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '20px',
                height: '11px',
                backgroundColor: 'transparent',
                border: '1.5px solid #f87171',
                borderRadius: '2px'
              }} />
              <span style={{ color: '#334155', fontWeight: 500 }}>Affected Parcels</span>
            </div> */}

            {/* Other Roads */}
            {/* <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '22px',
                height: '2px',
                backgroundColor: '#94a3b8',
                borderRadius: '1px'
              }} />
              <span style={{ color: '#64748b', fontWeight: 500 }}>Other Roads</span>
            </div>
          </div>
        </div>   */}

            {/* Loading Indicator */}
            {(loading || roadsLoading) && (
              <div className="map-loading-indicator">
                <span className="spinner" />
                <span>{loading ? 'Loading cadastral parcels...' : 'Loading Puttur roads...'}</span>
              </div>
            )}
          </div>

          {/* Repositioned Map Controls & Legend Dock (Positioned cleanly below map canvas - 0% overlap with corridor/parcels) */}
          <div className="gis-map-controls-dock">
            {/* GIS Layers Legend */}
            <div className="map-dock-card">
              <div className="map-dock-card-header">
                <span style={{ fontWeight: 700, color: 'var(--gov-navy)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  GIS Layers &amp; Priority Legend
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Study Area: Puttur Taluk
                </span>
              </div>
              <div className="map-dock-card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px 16px' }}>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '22px',
                      height: '8px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #d1d5db',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 1px'
                    }}>
                      <div style={{
                        width: '100%',
                        height: '4px',
                        backgroundColor: '#42210eff',
                        borderRadius: '1.5px'
                      }} />
                    </div>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Selected Road</span>
                  </div>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="legend-swatch" style={{ border: '2px solid #6B7280', backgroundColor: 'rgba(156, 163, 175, 0.40)' }} />
                    <span>Acquisition Corridor ({acquisitionWidth || 30} m)</span>
                  </div>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="legend-swatch" style={{ border: '1.8px solid #f87171', backgroundColor: 'transparent' }} />
                    <span>Affected Parcels</span>
                  </div>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="legend-swatch" style={{ border: '2px solid #DC2626', backgroundColor: 'rgba(220, 38, 38, 0.25)' }} />
                    <span>High Priority</span>
                  </div>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="legend-swatch" style={{ border: '2px solid #F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.25)' }} />
                    <span>Medium Priority</span>
                  </div>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="legend-swatch" style={{ border: '2px solid #2563EB', backgroundColor: 'rgba(37, 99, 235, 0.25)' }} />
                    <span>Low Priority</span>
                  </div>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="legend-line" style={{ backgroundColor: '#d97706', border: '1px solid #78350f', height: '4px' }} />
                    <span>Highways (NH 275 / SH 100)</span>
                  </div>
                  <div className="legend-item" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="legend-line" style={{ backgroundColor: '#f59e0b', height: '2px' }} />
                    <span>Other Roads</span>
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '10.5px', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                  Transparent overlay styling preserves cadastral boundary visibility and corridor alignment.
                </div>
              </div>
            </div>

            {/* Map Layers & Base Maps (Radio Buttons & Checkboxes) */}
            <div className="map-dock-card">
              <div className="map-dock-card-header">
                <span style={{ fontWeight: 700, color: 'var(--gov-navy)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Map Layers &amp; Base Maps
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Interactive Layer Toggles
                </span>
              </div>
              <div className="map-dock-card-body gis-map-dock-layers">
                <div ref={layersDockContainerRef} />
              </div>
            </div>
          </div>
        </div>
      </div >

      {/* Requirement 9: Affected Parcels Assessment Table */}
      {
        affectedParcels.length > 0 && (
          <div className="gov-card" id="affected-parcels-table-section" style={{ marginBottom: '20px' }}>
            <div className="gov-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div className="gov-card-title">
                <Database size={16} style={{ color: 'var(--gov-navy)', display: 'inline', marginRight: '6px' }} />
                AFFECTED PARCELS ASSESSMENT
                <span style={{ marginLeft: '10px', fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                  ({affectedParcels.length} Parcels Intersecting Corridor)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="sys-badge" style={{ backgroundColor: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1', fontWeight: 700 }}>
                  Total: {affectedSummary?.total_affected_parcels ?? affectedParcels.length}
                </span>
                <span className="sys-badge" style={{ backgroundColor: '#fef2f2', color: '#DC2626', border: '1px solid #fecaca', fontWeight: 700 }}>
                  High Priority: {affectedSummary?.high_priority_count ?? affectedParcels.filter(p => p.priority === 'High').length}
                </span>
                <span className="sys-badge" style={{ backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontWeight: 700 }}>
                  Med Priority: {affectedSummary?.medium_priority_count ?? affectedParcels.filter(p => p.priority === 'Medium').length}
                </span>
                <span className="sys-badge" style={{ backgroundColor: '#eff6ff', color: '#2563EB', border: '1px solid #bfdbfe', fontWeight: 700 }}>
                  Low Priority: {affectedSummary?.low_priority_count ?? affectedParcels.filter(p => p.priority === 'Low').length}
                </span>
                <span className="sys-badge" style={{ backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5', fontWeight: 700 }}>
                  Partial: {affectedSummary?.partial_impact_count ?? 0}
                </span>
                <span className="sys-badge" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2', fontWeight: 700 }}>
                  Full: {affectedSummary?.full_impact_count ?? 0}
                </span>
              </div>
            </div>

            <div className="gov-card-body" style={{ padding: '16px' }}>
              {/* Filter and Search Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', marginRight: '4px' }}>
                    Filter:
                  </span>
                  {[
                    { label: 'All', key: 'All', count: affectedParcels.length },
                    { label: 'High Priority', key: 'High Priority', count: affectedSummary?.high_priority_count ?? affectedParcels.filter(p => p.priority === 'High').length },
                    { label: 'Medium Priority', key: 'Medium Priority', count: affectedSummary?.medium_priority_count ?? affectedParcels.filter(p => p.priority === 'Medium').length },
                    { label: 'Low Priority', key: 'Low Priority', count: affectedSummary?.low_priority_count ?? affectedParcels.filter(p => p.priority === 'Low').length },
                    { label: 'Partial Impact', key: 'Partial Impact', count: affectedSummary?.partial_impact_count ?? 0 },
                    { label: 'Full Impact', key: 'Full Impact', count: affectedSummary?.full_impact_count ?? 0 }
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setTableFilter(item.key);
                        setTablePage(1);
                      }}
                      style={{
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: '1px solid var(--border-color)',
                        backgroundColor: tableFilter === item.key ? 'var(--gov-navy)' : '#ffffff',
                        color: tableFilter === item.key ? '#ffffff' : 'var(--text-main)',
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
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setTablePage(1);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      outline: 'none',
                      width: '240px'
                    }}
                  />
                </div>
              </div>

              {/* Table */}
              {(() => {
                const filtered = affectedParcels.filter(p => {
                  if (tableFilter === 'High Priority' && p.priority !== 'High') return false;
                  if (tableFilter === 'Medium Priority' && p.priority !== 'Medium') return false;
                  if (tableFilter === 'Low Priority' && p.priority !== 'Low') return false;
                  if (tableFilter === 'Partial Impact' && p.impact_type !== 'Partial Impact') return false;
                  if (tableFilter === 'Full Impact' && p.impact_type !== 'Full Impact') return false;
                  if (tableSearch.trim()) {
                    const q = tableSearch.trim().toLowerCase();
                    const matchId = String(p.parcel_id || '').toLowerCase().includes(q);
                    const matchSurv = String(p.survey_number || '').toLowerCase().includes(q);
                    const matchPrio = String(p.priority || '').toLowerCase().includes(q);
                    return matchId || matchSurv || matchPrio;
                  }
                  return true;
                });

                const pageSize = 10;
                const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                const currentPage = Math.min(tablePage, totalPages);
                const startIdx = (currentPage - 1) * pageSize;
                const paginated = filtered.slice(startIdx, startIdx + pageSize);

                return (
                  <div>
                    <div className="gov-table-wrapper" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                      <table className="gov-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)' }}>Sl. No.</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)' }}>Parcel ID</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)' }}>Survey Number</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)' }}>Village</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'right' }}>Total Area (m²)</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'right' }}>Affected Area (m²)</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'right' }}>Affected Percentage</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'center' }}>Impact Type</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'center' }}>Priority</th>
                            <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textAlign: 'center' }}>Action</th>
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
                                    borderBottom: '1px solid #e2e8f0',
                                    transition: 'background-color 0.15s ease'
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
                                  <td style={{ padding: '10px 12px', fontSize: '12.5px', color: '#334155' }}>
                                    {p.village || 'Puttur'}
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
                                      onClick={() => handleZoomToParcel(p)}
                                      title="Center and zoom map on this parcel"
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
                                      Zoom to Map
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="10" style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px' }}>
                                No matching affected parcels found for the current search/filter.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
                        <div>
                          Showing {startIdx + 1}–{Math.min(startIdx + pageSize, filtered.length)} of {filtered.length} affected parcels
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            disabled={currentPage === 1}
                            onClick={() => setTablePage(p => Math.max(1, p - 1))}
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
                            onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
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
                  </div>
                );
              })()}
            </div>
          </div>
        )
      }


    </div >
  );
}
