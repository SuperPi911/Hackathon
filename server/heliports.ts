import { TRPCError } from "@trpc/server";

type Heliport = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
};

type HeliportSnapshot = {
  source: "OpenStreetMap";
  sourceUrl: "https://www.openstreetmap.org/";
  radiusKm: number;
  facilities: Heliport[];
};

type OsmElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
};

const alertRadiusKm = 5;
const cache = new Map<string, { expiresAt: number; snapshot: HeliportSnapshot }>();
const activeRequests = new Map<string, Promise<HeliportSnapshot>>();

function haversineKm(latitude: number, longitude: number, otherLatitude: number, otherLongitude: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = radians(otherLatitude - latitude);
  const deltaLongitude = radians(otherLongitude - longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(otherLatitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceToAreaKm(
  latitude: number,
  longitude: number,
  bounds: { west: number; east: number; south: number; north: number }
) {
  const closestLatitude = Math.min(bounds.north, Math.max(bounds.south, latitude));
  const closestLongitude = Math.min(bounds.east, Math.max(bounds.west, longitude));
  return haversineKm(latitude, longitude, closestLatitude, closestLongitude);
}

async function fetchNearbyHeliports(
  latitude: number,
  longitude: number,
  searchRadius: number,
  bounds: { west: number; east: number; south: number; north: number }
): Promise<HeliportSnapshot> {
  const query = `[out:json][timeout:15];(node["aeroway"~"^(helipad|heliport)$"](around:${searchRadius * 1000},${latitude},${longitude});way["aeroway"~"^(helipad|heliport)$"](around:${searchRadius * 1000},${latitude},${longitude});relation["aeroway"~"^(helipad|heliport)$"](around:${searchRadius * 1000},${latitude},${longitude});node["emergency"="landing_site"](around:${searchRadius * 1000},${latitude},${longitude});way["emergency"="landing_site"](around:${searchRadius * 1000},${latitude},${longitude});relation["emergency"="landing_site"](around:${searchRadius * 1000},${latitude},${longitude}););out center tags;`;
  const url = new URL("https://overpass-api.de/api/interpreter");
  url.searchParams.set("data", query);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "AripiDronePlanner/1.0 (hackathon demo)" },
      signal: AbortSignal.timeout(18000)
    });
  } catch (error) {
    console.error("OpenStreetMap heliport lookup failed:", error);
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Verificarea heliporturilor OpenStreetMap nu este disponibilă acum." });
  }
  if (!response.ok) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `OpenStreetMap Overpass a răspuns cu eroarea ${response.status}.` });
  }

  let payload: { elements?: unknown };
  try {
    payload = await response.json() as { elements?: unknown };
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Răspunsul OpenStreetMap nu este JSON valid." });
  }
  if (!Array.isArray(payload.elements)) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Răspunsul OpenStreetMap nu conține elementele așteptate." });
  }

  const facilities = (payload.elements as OsmElement[]).flatMap((element) => {
    const pointLatitude = typeof element.lat === "number" ? element.lat : element.center?.lat;
    const pointLongitude = typeof element.lon === "number" ? element.lon : element.center?.lon;
    if (typeof element.id !== "number" || typeof pointLatitude !== "number" || typeof pointLongitude !== "number") return [];
    const distance = distanceToAreaKm(pointLatitude, pointLongitude, bounds);
    if (distance > alertRadiusKm) return [];
    const tags = element.tags || {};
    const name = [tags["name:ro"], tags.name, tags.operator, tags.aeroway]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0) || "Heliport / loc de aterizare";
    return [{
      id: `${String(element.type || "element")}/${element.id}`,
      name,
      latitude: pointLatitude,
      longitude: pointLongitude,
      distanceKm: Math.round(distance * 10) / 10
    }];
  });

  return {
    source: "OpenStreetMap",
    sourceUrl: "https://www.openstreetmap.org/",
    radiusKm: alertRadiusKm,
    facilities
  };
}

export async function getNearbyHeliports(bounds: { west: number; east: number; south: number; north: number }): Promise<HeliportSnapshot> {
  const latitude = (bounds.north + bounds.south) / 2;
  const longitude = (bounds.east + bounds.west) / 2;
  if (latitude < 43 || latitude > 49 || longitude < 19.5 || longitude > 30.5) {
    return { source: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/", radiusKm: alertRadiusKm, facilities: [] };
  }
  const cornerRadius = Math.max(
    haversineKm(latitude, longitude, bounds.north, bounds.east),
    haversineKm(latitude, longitude, bounds.north, bounds.west),
    haversineKm(latitude, longitude, bounds.south, bounds.east),
    haversineKm(latitude, longitude, bounds.south, bounds.west)
  );
  const searchRadius = Math.ceil(cornerRadius + alertRadiusKm);
  const key = [
    bounds.west.toFixed(5),
    bounds.east.toFixed(5),
    bounds.south.toFixed(5),
    bounds.north.toFixed(5),
    searchRadius
  ].join(",");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot;
  const inFlight = activeRequests.get(key);
  if (inFlight) return inFlight;

  const request = fetchNearbyHeliports(latitude, longitude, searchRadius, bounds)
    .then((snapshot) => {
      for (const [cacheKey, entry] of cache) {
        if (entry.expiresAt <= Date.now()) cache.delete(cacheKey);
      }
      if (cache.size >= 100) {
        const oldestEntry = cache.keys().next();
        if (!oldestEntry.done) cache.delete(oldestEntry.value);
      }
      cache.set(key, { expiresAt: Date.now() + 10 * 60_000, snapshot });
      return snapshot;
    })
    .finally(() => activeRequests.delete(key));
  activeRequests.set(key, request);
  return request;
}
