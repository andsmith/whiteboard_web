import type { Vector } from "./vectors";
import type { Point } from "./view";

export function translateVector(v: Vector, dx: number, dy: number): Vector {
  const t = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  switch (v.kind) {
    case "pencil":
    case "polyline":
      return { ...v, points: v.points.map(t) };
    case "line":
    case "rect":
      return { ...v, a: t(v.a), b: t(v.b) };
    case "circle":
      return { ...v, center: t(v.center) };
    case "text":
      return { ...v, pos: t(v.pos) };
  }
}

export function scaleVector(v: Vector, factor: number, anchor: Point): Vector {
  const s = (p: Point): Point => ({
    x: anchor.x + (p.x - anchor.x) * factor,
    y: anchor.y + (p.y - anchor.y) * factor,
  });
  switch (v.kind) {
    case "pencil":
    case "polyline":
      return { ...v, points: v.points.map(s), thickness: v.thickness * factor };
    case "line":
    case "rect":
      return { ...v, a: s(v.a), b: s(v.b), thickness: v.thickness * factor };
    case "circle":
      return { ...v, center: s(v.center), radius: v.radius * factor, thickness: v.thickness * factor };
    case "text":
      return { ...v, pos: s(v.pos), fontSize: v.fontSize * factor };
  }
}

export function rotateVector(v: Vector, angleRad: number, center: Point): Vector {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const r = (p: Point): Point => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  };
  switch (v.kind) {
    case "pencil":
    case "polyline":
      return { ...v, points: v.points.map(r) };
    case "line":
      return { ...v, a: r(v.a), b: r(v.b) };
    case "rect": {
      // Translate the rect's center along the rotation, and accumulate the
      // local rotation so it renders rotated around its own center.
      const own = { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
      const newOwn = r(own);
      const dx = newOwn.x - own.x;
      const dy = newOwn.y - own.y;
      return {
        ...v,
        a: { x: v.a.x + dx, y: v.a.y + dy },
        b: { x: v.b.x + dx, y: v.b.y + dy },
        rotation: (v.rotation ?? 0) + angleRad,
      };
    }
    case "circle":
      return { ...v, center: r(v.center) };
    case "text": {
      // Translate the text's anchor point and accumulate rotation.
      return { ...v, pos: r(v.pos), rotation: (v.rotation ?? 0) + angleRad };
    }
  }
}

export function getCenter(v: Vector): Point {
  switch (v.kind) {
    case "pencil":
    case "polyline": {
      let sx = 0, sy = 0;
      for (const p of v.points) { sx += p.x; sy += p.y; }
      const n = v.points.length || 1;
      return { x: sx / n, y: sy / n };
    }
    case "line":
    case "rect":
      return { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
    case "circle":
      return { ...v.center };
    case "text":
      return { x: v.pos.x, y: v.pos.y - v.fontSize / 2 };
  }
}
