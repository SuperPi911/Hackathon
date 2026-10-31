import { TRPCError } from "@trpc/server";

type Aircraft = {
  icao24: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitudeMeters: number | null;
  onGround: boolean;
  speedKmh: number | null;
  trackDeg: number | null;
  verticalRateMps: number | null;
  distanceKm: number;
};

type TrafficSnapshot = {
  source: "OpenSky Network";
  sourceUrl: "https://openskynetwork.github.io/opensky-api/rest.html";
  capturedAt: string;
  radiusKm: number;
  detectedCount: number;
  nearby: Aircraft[];
};

type OpenSkyResponse = { time: number; states: unknown[] | null };

let statesCache: { expiresAt: number; payload: OpenSkyResponse } | null = null;
let statesRequest: Promise<OpenSkyResponse> | null = null;
const cacheTtlMs = 15_000;
const searchRadiusKm = 15;

function numberAt(state: unknown[], index: number) {
  const value = state[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function distanceKm(latitude: number, longitude: number, otherLatitude: number, otherLongitude: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = radians(otherLatitude - latitude);
  const deltaLongitude = radians(otherLongitude - longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(otherLatitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getOpenSkyStates(): Promise<OpenSkyResponse> {
  if (statesCache && statesCache.expiresAt > Date.now()) return statesCache.payload;
  if (statesRequest) return statesRequest;

  const url = new URL("https://opensky-network.org/api/states/all");
  url.search = new URLSearchParams({
    lamin: "43",
    lomin: "19.5",
    lamax: "49",
    lomax: "30.5"
  }).toString();

  statesRequest = (async () => {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (error) {
      console.error("OpenSky request failed:", error);
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "OpenSky nu este disponibil momentan. În CTR, nu continua fără confirmarea directă cu ATC." });
    }
    if (response.status === 429) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limita de interogări OpenSky a fost atinsă. În CTR, verifică traficul direct cu ATC și reîncearcă mai târziu." });
    }
    if (!response.ok) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `OpenSky a răspuns cu eroarea ${response.status}. În CTR, nu continua fără confirmarea directă cu ATC.` });
    }

    let payload: { time?: unknown; states?: unknown };
    try {
      payload = await response.json() as { time?: unknown; states?: unknown };
    } catch {
      throw new TRPCError({ code: "BAD_GATEWAY", message: "Răspunsul OpenSky nu este JSON valid." });
    }
    if (typeof payload.time !== "number" || (payload.states !== null && !Array.isArray(payload.states))) {
      throw new TRPCError({ code: "BAD_GATEWAY", message: "Răspunsul OpenSky nu are formatul de trafic așteptat." });
    }
    const snapshot = { time: payload.time, states: payload.states as unknown[] | null };
    statesCache = { expiresAt: Date.now() + cacheTtlMs, payload: snapshot };
    return snapshot;
  })();
  try {
    return await statesRequest;
  } finally {
    statesRequest = null;
  }
}

export async function getNearbyAircraft(latitude: number, longitude: number): Promise<TrafficSnapshot> {
  if (latitude < 43 || latitude > 49 || longitude < 19.5 || longitude > 30.5) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Traficul OpenSky din demo este disponibil doar pentru România și zonele imediat învecinate." });
  }
  const payload = await getOpenSkyStates();

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - payload.time > 90 || payload.time - nowSeconds > 5) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Instantaneul OpenSky este prea vechi pentru afișare live. În CTR, verifică direct cu ATC." });
  }
  const nearby = (payload.states || [])
    .filter((state): state is unknown[] => Array.isArray(state) && state.length >= 12)
    .flatMap((state) => {
      const stateLatitude = numberAt(state, 6);
      const stateLongitude = numberAt(state, 5);
      const lastContact = numberAt(state, 4);
      if (stateLatitude === null || stateLongitude === null || lastContact === null
        || nowSeconds - lastContact > 45 || lastContact - nowSeconds > 5) return [];
      const distance = distanceKm(latitude, longitude, stateLatitude, stateLongitude);
      if (distance > searchRadiusKm) return [];
      const callsign = typeof state[1] === "string" ? state[1].trim() || null : null;
      const speedMps = numberAt(state, 9);
      return [{
        icao24: String(state[0] || "unknown"),
        callsign,
        latitude: stateLatitude,
        longitude: stateLongitude,
        altitudeMeters: numberAt(state, 7),
        onGround: state[8] === true,
        speedKmh: speedMps === null ? null : speedMps * 3.6,
        trackDeg: numberAt(state, 10),
        verticalRateMps: numberAt(state, 11),
        distanceKm: Math.round(distance * 10) / 10
      }];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const snapshot: TrafficSnapshot = {
    source: "OpenSky Network",
    sourceUrl: "https://openskynetwork.github.io/opensky-api/rest.html",
    capturedAt: new Date(payload.time * 1000).toISOString(),
    radiusKm: searchRadiusKm,
    detectedCount: nearby.length,
    nearby: nearby.slice(0, 20)
  };
  return snapshot;
}
