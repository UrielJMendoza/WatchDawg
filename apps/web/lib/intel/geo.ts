/** Geometry helpers for the map's animated link layer. */

type LL = [number, number]; // [lon, lat]

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function toVec([lon, lat]: LL): [number, number, number] {
  const a = toRad(lat);
  const b = toRad(lon);
  return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
}

function toLL(v: [number, number, number]): LL {
  const [x, y, z] = v;
  return [toDeg(Math.atan2(y, x)), toDeg(Math.asin(z))];
}

/** Sample `n` points along the great-circle path between two coordinates. */
export function greatCircle(from: LL, to: LL, n = 48): LL[] {
  const a = toVec(from);
  const b = toVec(to);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return [from, to];
  const sinO = Math.sin(omega);
  const out: LL[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s0 = Math.sin((1 - t) * omega) / sinO;
    const s1 = Math.sin(t * omega) / sinO;
    out.push(
      toLL([
        s0 * a[0] + s1 * b[0],
        s0 * a[1] + s1 * b[1],
        s0 * a[2] + s1 * b[2],
      ]),
    );
  }
  return out;
}
