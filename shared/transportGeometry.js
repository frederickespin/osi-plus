function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(point, a, b) {
  const tolerance = 1e-10;
  return Math.abs(cross(a, b, point)) <= tolerance
    && point[0] >= Math.min(a[0], b[0]) - tolerance && point[0] <= Math.max(a[0], b[0]) + tolerance
    && point[1] >= Math.min(a[1], b[1]) - tolerance && point[1] <= Math.max(a[1], b[1]) + tolerance;
}

function intersects(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
    || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}

export function transportRingError(ring) {
  const count = ring.length - 1;
  if (count < 3 || count > 200) return "TRANSPORT_GEOMETRY_INVALID";
  const first = ring[0], last = ring[count];
  if (first[0] !== last[0] || first[1] !== last[1] || new Set(ring.slice(0, -1).map((point) => point.join(","))).size !== count) return "TRANSPORT_GEOMETRY_INVALID";
  let area = 0;
  for (let i = 0; i < count; i += 1) {
    if (Math.abs(ring[i][0] - ring[i + 1][0]) > 180) return "TRANSPORT_GEOMETRY_INVALID";
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) continue;
      if (intersects(ring[i], ring[i + 1], ring[j], ring[j + 1])) return "TRANSPORT_GEOMETRY_SELF_INTERSECTION";
    }
  }
  return Math.abs(area) <= 1e-10 ? "TRANSPORT_GEOMETRY_INVALID" : null;
}

export function pointInTransportPolygon(point, geometry) {
  const ring = geometry.coordinates[0];
  let inside = false;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i], b = ring[i + 1];
    if (onSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
