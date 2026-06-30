// The BLHS sea: a live, animated, stylized pixel-art ocean.
// Self-contained WebGL2 full-screen shader. Not tiles, not static — a real moving
// surface with depth bands, travelling foam crests, swell, and golden sun glints.
// The look stays anchored on BLHS teal (the school color lives in the water itself).
// Engine system per the art direction; discrete art (islands, props) comes from PixelLab.

const VERT = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform float uT;     // time, seconds
uniform vec2  uR;     // resolution, px
uniform float uPix;   // pixel size (chunkiness)

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// rolling directional swell (clean, structured — not isotropic noise blobs)
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

float swell(vec2 p, float t){
  float h = sin(p.x * 2.4 + p.y * 0.7 + t * 1.1);
  h += 0.55 * sin(p.x * 1.3 - p.y * 1.6 + t * 0.9);
  h += 0.40 * sin(p.x * 3.7 + p.y * 2.2 - t * 1.4);
  return h / 2.0;
}

void main(){
  vec2 frag = floor(gl_FragCoord.xy / uPix) * uPix;
  vec2 uv = frag / uR;
  vec2 p = uv * vec2(uR.x / uR.y, 1.0) * 4.5;
  float t = uT * 0.5;

  // large-scale WARM / COLD zones, slowly drifting across the sea
  float zone = fbm(p * 0.45 + vec2(uT * 0.015, uT * 0.010));
  vec3 coolWater = vec3(0.086, 0.255, 0.318); // deep cool teal
  vec3 warmWater = vec3(0.298, 0.627, 0.604); // sunlit warm teal
  vec3 base = mix(coolWater, warmWater, smoothstep(0.35, 0.62, zone));

  // travelling swell -> crisp wave brightness bands
  float h = swell(p, t);
  h += 0.14 * noise(p * 5.0 + vec2(t * 0.4));
  float n = clamp(h * 0.32 + 0.5, 0.0, 1.0);
  float wb = floor(n * 4.0) / 4.0;
  vec3 col = base * (0.80 + 0.26 * wb);

  // thin travelling foam crests
  float foam = step(0.80, n) * (1.0 - step(0.875, n));
  col = mix(col, vec3(0.92, 0.97, 0.95), foam * 0.95);

  // genuinely sparse golden glints (was too dense)
  vec2 gp = floor(p * 20.0 + vec2(floor(uT * 1.5)));
  float spark = step(0.9975, hash(gp)) * step(0.62, n);
  col += vec3(1.0, 0.82, 0.45) * spark * 0.6;

  o = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('ocean shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

/** Start the animated ocean on a canvas. Returns a stop() cleanup. */
export function startOcean(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 not available');

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('ocean link: ' + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // full-screen triangle
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uT = gl.getUniformLocation(prog, 'uT');
  const uR = gl.getUniformLocation(prog, 'uR');
  const uPix = gl.getUniformLocation(prog, 'uPix');

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(uR, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();
  gl.uniform1f(uPix, 3.0);

  let raf = 0;
  const start = performance.now();
  function frame(now: number) {
    resize();
    gl!.uniform1f(uT, (now - start) / 1000);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
