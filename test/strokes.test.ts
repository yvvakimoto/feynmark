import { describe, expect, it } from 'vitest';
import { ArcPath, LinePath, arcBetween, loopAt } from '../src/layout/geometry';
import { coilStroke, dashedStroke, dottedStroke, doubleStroke, waveStroke } from '../src/render/strokes';
import { metrics } from '../src/render/theme';

const m = metrics(1);

describe('geometry paths', () => {
  it('line path endpoints, tangent, normal', () => {
    const p = new LinePath({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(p.length).toBeCloseTo(10);
    expect(p.point(5)).toEqual({ x: 5, y: 0 });
    expect(p.tangent(0)).toEqual({ x: 1, y: 0 });
    // Visual-left normal of rightward travel points up (negative y).
    expect(p.normal(0)).toEqual({ x: 0, y: -1 });
  });

  it('bend-left arc bulges to the visual left and hits both endpoints', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const arc = arcBetween(a, b, 45);
    expect(arc.start().x).toBeCloseTo(0, 6);
    expect(arc.start().y).toBeCloseTo(0, 6);
    expect(arc.end().x).toBeCloseTo(100, 6);
    expect(arc.end().y).toBeCloseTo(0, 6);
    const mid = arc.point(arc.length / 2);
    expect(mid.y).toBeLessThan(0); // above the chord = visual left of rightward travel
    // Sagitta = (L/2) tan(a/2)
    expect(-mid.y).toBeCloseTo(50 * Math.tan(Math.PI / 8), 4);
  });

  it('half-left bends form a semicircle', () => {
    const arc = arcBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, 90) as ArcPath;
    expect(arc.radius).toBeCloseTo(50, 6);
    expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI, 6);
  });

  it('tadpole loop is a closed circle tangent at the vertex', () => {
    const v = { x: 10, y: 20 };
    const loop = loopAt(v, { x: 0, y: -1 }, 30);
    expect(loop.start().x).toBeCloseTo(v.x, 6);
    expect(loop.end().y).toBeCloseTo(v.y, 6);
    expect(loop.length).toBeCloseTo(2 * Math.PI * 30, 6);
    // Tangent at the attachment point is horizontal (perpendicular to `dir`).
    expect(Math.abs(loop.tangent(0).y)).toBeLessThan(1e-9);
  });
});

describe('strokes (publication-quality invariants)', () => {
  const line = new LinePath({ x: 0, y: 0 }, { x: 120, y: 0 });

  it('wave lands exactly on both vertices with an integer half-period count', () => {
    const s = waveStroke(line, m);
    const first = s.bounds[0]!;
    const last = s.bounds[s.bounds.length - 1]!;
    expect(first).toEqual({ x: 0, y: 0 });
    expect(last.x).toBeCloseTo(120, 6);
    expect(Math.abs(last.y)).toBeLessThan(1e-9);
    // Zero-crossing count equals the half-period count (samples may land
    // exactly on zeros, so track the last nonzero sign).
    const offsets = s.bounds.map((p) => p.y);
    let crossings = 0;
    let lastSign = 0;
    for (const off of offsets) {
      const sign = off > 1e-9 ? 1 : off < -1e-9 ? -1 : 0;
      if (sign !== 0) {
        if (lastSign !== 0 && sign !== lastSign) crossings++;
        lastSign = sign;
      }
    }
    const halfPeriods = Math.max(3, Math.round((2 * line.length) / m.wavelength));
    expect(crossings).toBe(halfPeriods - 1);
    // Amplitude respected and reached.
    const maxOff = Math.max(...offsets.map(Math.abs));
    expect(maxOff).toBeLessThanOrEqual(m.waveAmplitude + 1e-6);
    expect(maxOff).toBeGreaterThan(0.9 * m.waveAmplitude);
  });

  it('wave on a half-circle arc carries an outward crest at the apex', () => {
    // Half-left arc from (0,0) to (100,0): bulges up (negative y), radius 50,
    // center at (50, 0). The decorated silhouette must reach R + ~A at the
    // top — a zero-crossing or inward crest there reads as a dented loop.
    const arc = arcBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, 90);
    const s = waveStroke(arc, m);
    const topY = Math.min(...s.bounds.map((p) => p.y));
    expect(topY).toBeLessThanOrEqual(-(50 + 0.9 * m.waveAmplitude));
    // Mirror case: half-right arc bulges down; crest points down at the apex.
    const arcR = arcBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, -90);
    const sR = waveStroke(arcR, m);
    const botY = Math.max(...sR.bounds.map((p) => p.y));
    expect(botY).toBeGreaterThanOrEqual(50 + 0.9 * m.waveAmplitude);
  });

  it('coil lands exactly on both vertices and forms loops (backtracking)', () => {
    const s = coilStroke(line, m);
    const first = s.bounds[0]!;
    const last = s.bounds[s.bounds.length - 1]!;
    expect(Math.hypot(first.x, first.y)).toBeLessThan(1e-6);
    expect(Math.hypot(last.x - 120, last.y)).toBeLessThan(1e-6);
    // Loops require the x-progress to reverse somewhere in the middle.
    let backtracks = 0;
    for (let i = 1; i < s.bounds.length; i++) {
      if (s.bounds[i]!.x < s.bounds[i - 1]!.x - 1e-6) backtracks++;
    }
    expect(backtracks).toBeGreaterThan(0);
  });

  it('dashes divide the length so both ends are ink', () => {
    const s = dashedStroke(line, m);
    const [dash, gap] = s.dasharray!.split(' ').map(Number);
    expect(dash).toBeCloseTo(gap!, 6);
    // (n+1) dashes + n gaps fill the length exactly: L = (2n+1) * dash.
    // The dasharray string is rounded to 2 decimals, so allow that tolerance.
    const k = line.length / dash!;
    expect(Math.round(k) % 2).toBe(1);
    expect(k).toBeCloseTo(Math.round(k), 1);
  });

  it('dot gaps divide the length so both ends are dots', () => {
    const s = dottedStroke(line, m);
    const gap = Number(s.dasharray!.split(' ')[1]);
    expect((line.length / gap) % 1).toBeCloseTo(0, 6);
  });

  it('double stroke keeps constant separation along an arc', () => {
    const arc = arcBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, 60);
    const s = doubleStroke(arc, m);
    const half = s.bounds.length / 2;
    for (let i = 0; i < half; i += 8) {
      const a = s.bounds[i]!;
      const b = s.bounds[half + i]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(m.doubleSep, 4);
    }
  });
});
