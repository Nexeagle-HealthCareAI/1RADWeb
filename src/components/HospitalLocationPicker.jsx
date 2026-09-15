import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Falls back to a wide view of India when the centre has no pin yet — this
// deployment's clinics are all India-based, so this is a sane "somewhere to
// start" rather than the ocean off West Africa (Mapbox's own 0,0 default).
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 4;
const PINNED_ZOOM = 15;

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * HospitalLocationPicker — lets an admin set a centre's GPS location via a
 * "use my current location" button (browser geolocation) and/or by dragging
 * a pin on an embedded Mapbox map. Purely controlled: the parent owns
 * latitude/longitude state and this component only reports changes via
 * onChange — it never persists anything itself.
 *
 * @param {number|null} latitude
 * @param {number|null} longitude
 * @param {(lat: number, lng: number) => void} onChange
 */
export default function HospitalLocationPicker({ latitude, longitude, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  const hasPin = typeof latitude === 'number' && typeof longitude === 'number';

  // Initialise the map once. Later latitude/longitude changes are applied by
  // a separate effect below (moving the existing marker) rather than
  // recreating the map, so dragging/clicking doesn't fight re-renders.
  useEffect(() => {
    if (!MAPBOX_TOKEN) return undefined;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const start = hasPin ? { lat: latitude, lng: longitude } : DEFAULT_CENTER;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [start.lng, start.lat],
      zoom: hasPin ? PINNED_ZOOM : DEFAULT_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const marker = new mapboxgl.Marker({ draggable: true, color: '#0f52ba' })
      .setLngLat([start.lng, start.lat]);
    if (hasPin) marker.addTo(map);
    markerRef.current = marker;

    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat();
      onChangeRef.current(lat, lng);
    });

    // Click anywhere on the map to drop/move the pin — faster than
    // dragging from wherever it currently sits.
    map.on('click', (e) => {
      marker.setLngLat(e.lngLat).addTo(map);
      onChangeRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    return () => map.remove();
    // Intentionally mount-only — see the sync effect below for prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker/camera in sync when latitude/longitude change from
  // OUTSIDE this component (e.g. "Use my current location", or the form
  // loading a previously-saved pin) without re-creating the map.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !hasPin) return;
    marker.setLngLat([longitude, latitude]).addTo(map);
    map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), PINNED_ZOOM) });
  }, [latitude, longitude, hasPin]);

  const useCurrentLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported on this device/browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChangeRef.current(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — allow it in your browser settings, or drag the pin on the map instead.'
            : 'Could not get your current location. Drag the pin on the map instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        Map unavailable — no Mapbox token configured.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: hasPin ? '#1e293b' : '#94a3b8' }}>
          {hasPin ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'No location set yet'}
        </span>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          style={{
            padding: '8px 14px', borderRadius: '8px', border: '1.5px solid #0f52ba',
            background: locating ? '#e2e8f0' : 'white', color: locating ? '#94a3b8' : '#0f52ba',
            fontSize: '12px', fontWeight: 700, cursor: locating ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
          }}
        >
          📍 {locating ? 'Locating…' : 'Use my current location'}
        </button>
      </div>

      {geoError && (
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
          {geoError}
        </div>
      )}

      <div
        ref={containerRef}
        style={{ width: '100%', height: '260px', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e2e8f0' }}
      />
      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500, marginTop: '6px' }}>
        Click the map or drag the pin to fine-tune the exact spot.
      </div>
    </div>
  );
}
