import type { Drone, ZoneFeature } from "./types";

export type RectangleBounds = { west: number; east: number; south: number; north: number };
export type ZoneKind = "ctr" | "mapn" | "restricted";

export function zoneKind(feature: ZoneFeature): ZoneKind {
  const contact = feature.properties.contact || "";
  if (/CTR/i.test(contact) || /TWR|TOWER|drone\.otp/i.test(contact)) return "ctr";
  if (/aerofoto@mapn\.ro|aero photogrammetry/i.test(contact)) return "mapn";
  return "restricted";
}

function pointOnSegment(point: number[], start: number[], end: number[]) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  return Math.abs(cross) <= 1e-10
    && point[0] >= Math.min(start[0], end[0]) - 1e-10
    && point[0] <= Math.max(start[0], end[0]) + 1e-10
    && point[1] >= Math.min(start[1], end[1]) - 1e-10
    && point[1] <= Math.max(start[1], end[1]) + 1e-10;
}

function pointInRing(point: number[], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (pointOnSegment(point, ring[j], ring[i])) return true;
    if ((yi > point[1]) !== (yj > point[1])
      && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: number[], b: number[], c: number[], d: number[]) {
  const orientation = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]));
  const [o1, o2, o3, o4] = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)];
  return (o1 !== o2 && o3 !== o4)
    || (o1 === 0 && pointOnSegment(c, a, b))
    || (o2 === 0 && pointOnSegment(d, a, b))
    || (o3 === 0 && pointOnSegment(a, c, d))
    || (o4 === 0 && pointOnSegment(b, c, d));
}

export function intersectsRectangle(feature: ZoneFeature, bounds: RectangleBounds) {
  const ring = feature.geometry.coordinates[0];
  if (!ring?.length) return false;
  const corners = [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north]
  ];
  const ringBounds = ring.reduce((result, [lng, lat]) => ({
    west: Math.min(result.west, lng),
    east: Math.max(result.east, lng),
    south: Math.min(result.south, lat),
    north: Math.max(result.north, lat)
  }), { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity });
  if (ringBounds.east < bounds.west || ringBounds.west > bounds.east
    || ringBounds.north < bounds.south || ringBounds.south > bounds.north) return false;
  if (ring.some(([lng, lat]) => lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north)) return true;
  if (corners.some((corner) => pointInRing(corner, ring))) return true;
  const rectEdges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]);
  for (let i = 0; i < ring.length - 1; i++) {
    if (rectEdges.some(([start, end]) => segmentsIntersect(ring[i], ring[i + 1], start, end))) return true;
  }
  return false;
}

export function classifyZones(features: ZoneFeature[], bounds: RectangleBounds) {
  const matches = features.filter((feature) => intersectsRectangle(feature, bounds));
  const ctr = matches.filter((feature) => zoneKind(feature) === "ctr");
  return {
    matches,
    ctr,
    explicitCtr: ctr.filter((feature) => /CTR/i.test(feature.properties.contact || "")),
    mapn: matches.filter((feature) => zoneKind(feature) === "mapn")
  };
}

export const categoryLabels: Record<Drone["category"], string> = {
  multirotor: "Multirotor",
  "fixed-wing": "Aripă fixă",
  fpv: "FPV",
  cinewhoop: "Cinewhoop",
  other: "Alt tip"
};
