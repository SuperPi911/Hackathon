import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import L from "leaflet";
import { classifyZones, zoneKind, type RectangleBounds } from "../lib/map";
import type { NearbyAircraft, NearbyHeliport, ZoneCollection } from "../lib/types";

type Props = {
  zones?: ZoneCollection;
  loading: boolean;
  error?: string;
  selectedArea: RectangleBounds | null;
  onAreaChange: (bounds: RectangleBounds | null) => void;
  aircraft?: NearbyAircraft[];
  heliports?: NearbyHeliport[];
};

const romaniaBounds = L.latLngBounds([43.5, 20.2], [48.3, 29.8]);

export function FlightMap({ zones, loading, error, selectedArea, onAreaChange, aircraft = [], heliports = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnRef = useRef<L.Rectangle | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const startPointRef = useRef<L.LatLng | null>(null);
  const previewRef = useRef<L.Rectangle | null>(null);
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { preferCanvas: true, zoomControl: false }).fitBounds(romaniaBounds);
    mapRef.current = map;
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const drawnItems = L.featureGroup().addTo(map);
    drawnItemsRef.current = drawnItems;
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(containerRef.current);

    return () => {
      drawingRef.current = false;
      drawnItemsRef.current = null;
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zones) return;
    const zoneLayer = L.geoJSON(zones as never, {
      style: (feature) => {
        const kind = zoneKind(feature as never);
        const styles = {
          ctr: { color: "#cf635d", fillColor: "#e2847d" },
          mapn: { color: "#bc8a45", fillColor: "#d9aa62" },
          restricted: { color: "#7963c6", fillColor: "#927dd7" }
        };
        return { ...styles[kind], weight: 1.1, opacity: 0.8, fillOpacity: 0.15 };
      },
      onEachFeature: (feature, layer) => {
        const properties = feature.properties || {};
        const safe = (value: unknown) => String(value || "Nespecificat").replace(/[&<>"']/g, (character) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]!);
        const kind = zoneKind(feature as never);
        const labels = { ctr: "CTR / contact cu TWR", mapn: "Aviz foto MApN", restricted: "Zonă UAS restricționată" };
        layer.bindPopup(`<strong>${safe(properties.zone_id || "Zonă UAS")}</strong><br/>${labels[kind]}<br/>${safe(properties.lower_lim)} – ${safe(properties.upper_lim)}<br/><small>Verifică sursele oficiale. Harta nu este o autorizare.</small>`);
      }
    }).addTo(map);
    return () => { zoneLayer.remove(); };
  }, [zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !aircraft.length) return;
    const aircraftLayer = L.featureGroup();
    for (const plane of aircraft) {
      const marker = L.circleMarker([plane.latitude, plane.longitude], {
        radius: 7,
        color: "#09131f",
        weight: 2,
        fillColor: "#4ed8e8",
        fillOpacity: 0.96
      });
      const label = (plane.callsign || plane.icao24).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]!);
      marker.bindPopup(`<strong>${label}</strong><br/>${plane.onGround ? "La sol" : `În aer · ${plane.altitudeMeters === null ? "altitudine necunoscută" : `${Math.round(plane.altitudeMeters)} m`}`}<br/><small>${plane.distanceKm.toFixed(1)} km · ADS-B OpenSky</small>`);
      aircraftLayer.addLayer(marker);
    }
    aircraftLayer.addTo(map);
    return () => { aircraftLayer.remove(); };
  }, [aircraft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !heliports.length) return;
    const heliportLayer = L.featureGroup();
    for (const heliport of heliports) {
      const marker = L.circleMarker([heliport.latitude, heliport.longitude], {
        radius: 8,
        color: "#2b2110",
        weight: 2,
        fillColor: "#ffc46b",
        fillOpacity: 0.96
      });
      const label = heliport.name.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]!);
      marker.bindPopup(`<strong>${label}</strong><br/><small>Heliport / landing site OpenStreetMap · ${heliport.distanceKm.toFixed(1)} km de zonă</small>`);
      heliportLayer.addLayer(marker);
    }
    heliportLayer.addTo(map);
    return () => { heliportLayer.remove(); };
  }, [heliports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    if (selectedArea) {
      const rectangle = drawnRef.current;
      const bounds = L.latLngBounds([selectedArea.south, selectedArea.west], [selectedArea.north, selectedArea.east]);
      if (rectangle) rectangle.setBounds(bounds);
      else drawnRef.current = L.rectangle(bounds, {
        color: "#456bdf", weight: 2, fillColor: "#6485e8", fillOpacity: 0.16
      }).addTo(map);
    } else if (drawnRef.current) {
      drawnRef.current.remove();
      drawnRef.current = null;
    }
  }, [selectedArea]);

  const startDrawing = () => {
    const map = mapRef.current;
    if (!map) return;
    drawnRef.current?.remove();
    drawnRef.current = null;
    onAreaChange(null);
    drawingRef.current = true;
    map.dragging.disable();
    setDrawing(true);
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current || event.button !== 0 || (event.target instanceof Element && event.target.closest(".leaflet-control"))) return;
    const map = mapRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    startPointRef.current = map.containerPointToLatLng(L.point(event.clientX - rect.left, event.clientY - rect.top));
    previewRef.current = L.rectangle(L.latLngBounds(startPointRef.current, startPointRef.current), {
      color: "#456bdf", weight: 2, fillColor: "#6485e8", fillOpacity: 0.16
    }).addTo(drawnItems);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const map = mapRef.current;
    if (!drawingRef.current || !map || !startPointRef.current || !previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const currentPoint = map.containerPointToLatLng(L.point(event.clientX - rect.left, event.clientY - rect.top));
    previewRef.current.setBounds(L.latLngBounds(startPointRef.current, currentPoint));
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current || !startPointRef.current || !previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointercancel") {
      drawnItemsRef.current?.clearLayers();
      onAreaChange(null);
    } else {
      const bounds = previewRef.current.getBounds();
      if (bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 8) {
        drawnItemsRef.current?.clearLayers();
        onAreaChange(null);
      } else {
        drawnRef.current = previewRef.current;
        onAreaChange({
          west: bounds.getWest(),
          east: bounds.getEast(),
          south: bounds.getSouth(),
          north: bounds.getNorth()
        });
      }
    }
    startPointRef.current = null;
    previewRef.current = null;
    drawingRef.current = false;
    mapRef.current?.dragging.enable();
    setDrawing(false);
  };

  const locatePilot = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Acest browser nu oferă acces la locație.");
      return;
    }
    setLocationMessage("Se caută locația ta…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = L.latLng(coords.latitude, coords.longitude);
        const map = mapRef.current;
        if (!map) return;
        map.setView(point, 13);
        locationMarkerRef.current?.remove();
        locationMarkerRef.current = L.circleMarker(point, {
          radius: 8, color: "#fff", weight: 3, fillColor: "#4772e5", fillOpacity: 1
        }).addTo(map).bindPopup("Locația ta curentă");
        setLocationMessage(`Locație găsită · ±${Math.round(coords.accuracy)} m`);
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "Accesul la locație a fost refuzat. Îl poți activa din setările browserului.",
          2: "Locația nu este disponibilă acum. Încearcă din nou.",
          3: "Căutarea locației a durat prea mult. Încearcă din nou."
        };
        setLocationMessage(messages[error.code] || "Nu am putut obține locația.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const analysis = selectedArea && zones ? classifyZones(zones.features, selectedArea) : null;
  const clearArea = () => onAreaChange(null);

  return (
    <section className="map-card">
      <div className="map-toolbar">
        <div>
          <strong>Planifică pe hartă</strong>
          <span>Hărți OpenStreetMap · fără cheie API</span>
        </div>
        <div className="map-actions">
          <button type="button" className="button button-quiet" onClick={locatePilot}>⌖ <span>Locația mea</span></button>
          <button type="button" className={`button ${drawing ? "button-active" : "button-primary"}`} onClick={startDrawing}>
            {drawing ? "Trage pe hartă…" : "＋ Desenează zona"}
          </button>
        </div>
      </div>
      <div className={`map-canvas ${drawing ? "map-drawing" : ""}`} ref={containerRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="Hartă de planificare a zborului" />
      <div className="map-footer">
        <div className="map-legend"><span><i className="legend-ctr" /> CTR / TWR</span><span><i className="legend-mapn" /> Foto MApN</span><span><i className="legend-restricted" /> Restricții UAS</span></div>
        <a href="https://flightplan.romatsa.ro/init/drones/index" target="_blank" rel="noreferrer">Sursa oficială ROMATSA ↗</a>
      </div>
      {(loading || error || locationMessage) && (
        <div className={error ? "map-status map-error" : "map-status"} role="status">
          {loading ? "Se încarcă zonele ROMATSA…" : error || locationMessage}
        </div>
      )}
      {analysis && (
        <section className={`zone-analysis ${analysis.matches.length ? "zone-warning" : "zone-clear"}`}>
          <div className="zone-analysis-heading">
            <span className="analysis-icon">{analysis.matches.length ? "!" : "✓"}</span>
            <div>
              <strong>{analysis.matches.length ? `DA · ${analysis.matches.length} ${analysis.matches.length === 1 ? "zonă intersectată" : "zone intersectate"}` : "NU · Nicio suprapunere găsită în acest strat"}</strong>
              <p>{analysis.matches.length
                ? "Nu decola înainte să verifici condițiile și aprobările necesare."
                : "Asta nu confirmă permisiunea de zbor și nu include NOTAM-uri curente."}</p>
            </div>
            <button type="button" className="button button-quiet" onClick={clearArea}>Șterge selecția</button>
          </div>
          {analysis.matches.length > 0 && (
            <ul className="zone-list">
              {analysis.matches.slice(0, 6).map((zone, index) => (
                <li key={`${zone.properties.zone_id}-${index}`}>
                  <span>{zoneKind(zone) === "mapn" ? "Foto MApN · " : ""}{zone.properties.zone_id}</span>
                  <small>{zone.properties.lower_lim || "?"} – {zone.properties.upper_lim || "?"}</small>
                </li>
              ))}
              {analysis.matches.length > 6 && <li className="more-zones">și încă {analysis.matches.length - 6} zone</li>}
            </ul>
          )}
          <p className="map-disclaimer">Date ROMATSA statice · consultă NOTAM și autoritățile. Aripi nu emite aprobări.</p>
        </section>
      )}
    </section>
  );
}
