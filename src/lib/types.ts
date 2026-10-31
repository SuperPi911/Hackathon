export type CameraSpecs = {
  manufacturer: string;
  model: string;
  sensor: string;
  resolution: string;
  focalLengthMm: number | null;
  videoResolution: string;
  stabilization: string;
};

export type Drone = {
  id: string;
  model: string;
  manufacturer: string;
  weightGrams: number;
  category: "multirotor" | "fixed-wing" | "fpv" | "cinewhoop" | "other";
  uasClass: string;
  serial: string;
  operatorId: string;
  remoteId: string;
  camera: CameraSpecs;
};

export type ZoneFeature = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: Record<string, string>;
};

export type ZoneCollection = {
  type: "FeatureCollection";
  timeStamp?: string;
  features: ZoneFeature[];
};

export type NearbyAircraft = {
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

export type NearbyHeliport = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
};
