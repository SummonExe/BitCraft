export function noise(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  
  const hash = (x, y) => {
    const h = (x * 374761393 + y * 668265263) & 0x7fffffff;
    return (h ^ (h >> 13)) / 0x7fffffff;
  };
  
  const u = fade(xf);
  const v = fade(yf);
  
  const a = hash(X, Y);
  const b = hash(X + 1, Y);
  const c = hash(X, Y + 1);
  const d = hash(X + 1, Y + 1);
  
  return lerp(v, lerp(u, a, b), lerp(u, c, d));
}

export function getTerrainHeight(x, z) {
  let height = 0;
  let amplitude = 4;
  let frequency = 0.05;
  
  for (let i = 0; i < 4; i++) {
    height += noise(x * frequency, z * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  
  return height;
}