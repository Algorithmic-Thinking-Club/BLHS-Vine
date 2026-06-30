// The BLHS overworld: ONE isometric sea world rendered in a single coherent pass.
// A full-screen shader is sampled in ISO-GROUND space (I invert the screen->iso
// projection per pixel), so ocean, beach, and grass all lie on the ground plane and
// read isometric with zero tile seams. Each island has an organic noise-perturbed
// coastline; the land is gently domed for real volume (hillshade from one light), with
// shallows + a breathing foam ring hugging every coast. All discrete ART (trees, rocks,
// bushes, dock, boat, the panther lighthouse) is PixelLab, drawn on top with soft
// grounding shadows, depth-sorted. The engine only animates + composites.

const SCALE = 0.52            // zoom-out so the archipelago reads vast
const BW = 32, BH = 16
const HW = BW * SCALE, HH = BH * SCALE

type Island = { cx: number; cy: number; r: number; seed: number; dressed: boolean }
const ISLANDS: Island[] = [
  { cx: 70, cy: 70, r: 8.5, seed: 0.0, dressed: true },   // hub (home base, lighthouse)
  { cx: 42, cy: 50, r: 4.2, seed: 1.7, dressed: false },
  { cx: 98, cy: 54, r: 5.0, seed: 3.1, dressed: false },
  { cx: 54, cy: 100, r: 4.6, seed: 4.6, dressed: false },
  { cx: 102, cy: 98, r: 3.6, seed: 2.2, dressed: false },
]
function coastR(theta: number, baseR: number, seed: number): number {
  return baseR * (1 + 0.20 * Math.sin(3 * theta + seed) + 0.11 * Math.sin(5 * theta + seed * 1.7) + 0.06 * Math.sin(7 * theta + seed * 2.3))
}

const VERT = `#version 300 es
in vec2 aPos; in vec2 aUV; out vec2 vUV;
void main(){ vUV = aUV; gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG_QUAD = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec3 uTint;
void main(){ vec4 c = texture(uTex, vUV); if (c.a < 0.04) discard; o = vec4(c.rgb * uTint, c.a); }`

// soft elliptical grounding shadow
const FRAG_SHADOW = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o; uniform float uAlpha;
void main(){ float d = length(vUV - 0.5) * 2.0; float a = smoothstep(1.0, 0.15, d); o = vec4(0.0,0.0,0.0, a*uAlpha); }`

const FRAG_WORLD = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform vec2 uOrigin; uniform float uHW, uHH, uTime, uPix;
uniform vec4 uIslands[6]; uniform int uIslandCount;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=0.5;} return v; }
float coastR(float theta, float baseR, float seed){
  return baseR*(1.0 + 0.20*sin(3.0*theta+seed) + 0.11*sin(5.0*theta+seed*1.7) + 0.06*sin(7.0*theta+seed*2.3));
}
void main(){
  vec2 frag = floor(gl_FragCoord.xy/uPix)*uPix + uPix*0.5;
  float sx = frag.x;
  float sy = uRes.y - frag.y;
  float fx = (sx - uOrigin.x)/uHW;
  float fy = (sy - uOrigin.y)/uHH;
  vec2 g = vec2((fx+fy)*0.5, (fy-fx)*0.5);
  float t = uTime;

  // signed distance to nearest coast + nearest center (for the island dome)
  float sd = 1e9; vec2 nc = vec2(0.0);
  for(int i=0;i<6;i++){
    if(i>=uIslandCount) break;
    vec2 c = uIslands[i].xy; float baseR = uIslands[i].z; float seed = uIslands[i].w;
    vec2 d = g - c; float dist = length(d);
    float s = dist - coastR(atan(d.y,d.x), baseR, seed);
    if(s < sd){ sd = s; nc = c; }
  }

  vec3 col;
  if (sd > 0.0) {
    // ---- OCEAN: bright tropical, CALM smooth swell, clean cel crest lines (not gloomy/choppy) ----
    float d = pow(clamp(sd / 26.0, 0.0, 1.0), 0.9);
    d = clamp(d + (noise(g*0.5 + 7.0) - 0.5) * 0.05, 0.0, 1.0);
    // luminous BLHS-teal ramp sampled from real references (Wind Waker / Windward):
    // pale aqua at the sand -> bright teal sea -> a CONFIDENT MEDIUM teal deep (never navy/gloomy)
    vec3 c0 = vec3(0.70,0.93,0.87);   // pale aqua shallows (Wind Waker shallow)
    vec3 c1 = vec3(0.34,0.75,0.71);   // bright BLHS teal sea
    vec3 c2 = vec3(0.22,0.62,0.63);   // teal sea
    vec3 c3 = vec3(0.17,0.51,0.57);   // deep, still luminous (confident medium teal)
    vec3 base = d < 0.40 ? mix(c0,c1,d/0.40)
              : d < 0.74 ? mix(c1,c2,(d-0.40)/0.34)
                         : mix(c2,c3,(d-0.74)/0.26);
    // very gentle warm/cool drift (subtle, never darkens)
    float zone = fbm(g*0.05 + vec2(t*0.012,t*0.009));
    base *= mix(vec3(0.98,0.99,1.02), vec3(1.05,1.02,0.97), smoothstep(0.35,0.65,zone));

    // CALM smooth swell: low freq + low amplitude -> rolling light, NOT choppy noise
    float swell = sin(g.x*0.16 + g.y*0.09 + t*0.5)*0.6 + sin(g.x*0.06 - g.y*0.12 + t*0.33)*0.4;
    base *= 1.0 + 0.05*swell;

    // clean cel wave-crest lines: sparse thin brighter arcs, only in open water
    float cf = sin(g.x*0.45 + g.y*0.28 + t*0.7) + 0.5*sin(g.x*0.22 - g.y*0.40 - t*0.5);
    float lines = smoothstep(0.55, 0.85, sin(cf*1.3)*0.5+0.5);
    base = mix(base, base*1.10 + vec3(0.04,0.05,0.05), lines*0.30*smoothstep(0.5,4.0,sd));

    // shoreline foam ring: lacey, bright, animated
    float fb = 1.0 - smoothstep(0.0, 1.2, sd);
    float lace = (0.5 + 0.5*sin(t*1.6 + (g.x+g.y)*1.5)) * (0.6 + 0.5*noise(g*1.1 + vec2(t*0.15,0.0)));
    float foamA = clamp(fb*fb*lace*1.7, 0.0, 1.0);
    base = mix(base, mix(vec3(0.82,0.93,0.92), vec3(0.95,0.99,0.97), smoothstep(0.4,1.0,foamA)), foamA);

    // shallow caustic shimmer over the sandy shelf
    float shelf = (1.0 - smoothstep(0.0, 0.30, d)) * step(0.05, sd);
    float caus = smoothstep(0.55, 1.0, (sin(g.x*1.9 + t)*sin(g.y*1.7 - t*0.7))*0.5+0.5);
    base += vec3(0.10,0.18,0.16) * caus * shelf * 0.45;

    col = floor(base * 13.0) / 13.0;   // banded value steps -> crafted pixel-art water
  } else {
    // ---- LAND (sand band -> domed grass) ----
    float nd = -sd;
    float gp1 = fbm(g*0.22 + 3.0);
    float gp2 = noise(g*1.7);
    vec3 gDark = vec3(0.22,0.35,0.16);
    vec3 gLite = vec3(0.54,0.63,0.30);   // warm sunlit meadow
    vec3 grass = mix(gDark, gLite, gp1) + (gp2-0.5)*0.05;
    vec3 sandC = mix(vec3(0.80,0.71,0.47), vec3(0.91,0.82,0.57), noise(g*2.0));
    float wet = smoothstep(0.0,0.55,nd);
    vec3 sand = mix(sandC*vec3(0.74,0.73,0.66), sandC, wet);
    float SB = 1.7;
    float toGrass = smoothstep(SB-0.5, SB+0.7, nd);
    col = mix(sand, grass, toGrass);
    // gentle dome hillshade (one light, upper-left), steeper near the coast
    vec2 outward = normalize(g - nc + 1e-4);
    vec2 L = normalize(vec2(-1.0,-0.45));
    float edge = smoothstep(4.0, 0.0, nd);
    col *= clamp(1.0 + 0.22*dot(outward, L)*edge, 0.80, 1.20);
    // tiny coastal AO just inland of the waterline
    col *= 0.90 + 0.10*smoothstep(0.0,0.7,nd);
    // foam lapping onto the wet sand
    float lap = smoothstep(0.0,0.45,nd)*smoothstep(1.0,0.45,nd);
    float flick = 0.5 + 0.5*sin(t*2.0 + (g.x+g.y)*1.6);
    col = mix(col, vec3(0.95,0.99,0.97), lap*flick*0.45);
    col *= vec3(1.06, 1.02, 0.92);   // golden-hour warmth on land
  }
  // gentle warm sun grade + a LIGHT airy haze at the edges (never a dark vignette -> never gloomy)
  col *= vec3(1.03, 1.02, 0.99);
  vec2 uvp = gl_FragCoord.xy / uRes;
  float edge = smoothstep(0.45, 1.05, length(uvp - 0.5));
  col = mix(col, vec3(0.78, 0.90, 0.90), edge * 0.12);
  o = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s))
  return s
}
function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p))
  return p
}
type Tex = { tex: WebGLTexture; w: number; h: number }
function loadTex(gl: WebGL2RenderingContext, url: string): Promise<Tex> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      res({ tex, w: img.width, h: img.height })
    }
    img.onerror = rej
    img.src = url
  })
}

const PROP_FILES: Record<string, string> = {
  pine: '/art/overworld/pine.png', fir: '/art/overworld/fir.png', leafy: '/art/overworld/leafy.png',
  rock: '/art/overworld/rock.png', bush: '/art/overworld/bush.png',
  dock: '/art/overworld/dock.png', boat: '/art/overworld/boat.png', lighthouse: '/art/overworld/lighthouse.png',
}
const PROP_SCALE: Record<string, number> = {
  pine: 0.95, fir: 0.95, leafy: 0.95, rock: 0.85, bush: 0.8, dock: 1.0, boat: 0.9, lighthouse: 0.72,
}

type Prop = { gx: number; gy: number; prop: string; scl: number }

export function startOverworld(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
  if (!gl) throw new Error('WebGL2 not available')
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  const worldP = link(gl, VERT, FRAG_WORLD)
  const quadP = link(gl, VERT, FRAG_QUAD)
  const shadowP = link(gl, VERT, FRAG_SHADOW)

  const vao = gl.createVertexArray(); gl.bindVertexArray(vao)
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(24), gl.DYNAMIC_DRAW)
  const aPos = gl.getAttribLocation(quadP, 'aPos'), aUV = gl.getAttribLocation(quadP, 'aUV')
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8)

  const uRes = gl.getUniformLocation(worldP, 'uRes'), uOrigin = gl.getUniformLocation(worldP, 'uOrigin')
  const uHWl = gl.getUniformLocation(worldP, 'uHW'), uHHl = gl.getUniformLocation(worldP, 'uHH')
  const uTime = gl.getUniformLocation(worldP, 'uTime'), uPix = gl.getUniformLocation(worldP, 'uPix')
  const uIslands = gl.getUniformLocation(worldP, 'uIslands'), uIslandCount = gl.getUniformLocation(worldP, 'uIslandCount')
  const uTexQ = gl.getUniformLocation(quadP, 'uTex'), uTintQ = gl.getUniformLocation(quadP, 'uTint')
  const uAlphaS = gl.getUniformLocation(shadowP, 'uAlpha')

  const islandData = new Float32Array(6 * 4)
  ISLANDS.forEach((is, i) => { islandData[i * 4] = is.cx; islandData[i * 4 + 1] = is.cy; islandData[i * 4 + 2] = is.r; islandData[i * 4 + 3] = is.seed })

  // land test for prop placement (matches shader: grass = well inside the coast)
  const onGrass = (gx: number, gy: number): boolean => {
    let sd = 1e9
    for (const is of ISLANDS) {
      const dx = gx - is.cx, dy = gy - is.cy
      sd = Math.min(sd, Math.hypot(dx, dy) - coastR(Math.atan2(dy, dx), is.r, is.seed))
    }
    return sd < -1.9
  }

  // ---- props (deterministic) ----
  const rng = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
  const props: Prop[] = []
  let seedN = 1
  for (const is of ISLANDS) {
    const trees = ['pine', 'fir', 'leafy']
    const count = is.dressed ? 120 : Math.round(is.r * 5)
    for (let k = 0; k < count; k++) {
      const ang = rng(seedN++) * Math.PI * 2
      // hub keeps an open meadow at its heart (lighthouse + dock approach); satellites fill in
      const rad = is.dressed
        ? (0.42 + 0.56 * Math.sqrt(rng(seedN++))) * is.r
        : (0.08 + 0.88 * Math.sqrt(rng(seedN++))) * is.r
      const gx = is.cx + Math.cos(ang) * rad, gy = is.cy + Math.sin(ang) * rad
      if (!onGrass(gx, gy)) continue
      // keep a clearing around the lighthouse and a corridor down to the dock
      if (is.dressed) {
        const dc = Math.hypot(gx - is.cx, gy - is.cy)
        if (dc < 3.0) continue
        const towardDock = (gx - is.cx) > 0 && (gy - is.cy) > 0 && Math.abs((gx - is.cx) - (gy - is.cy)) < 1.4
        if (towardDock && dc < 6.0) continue
      }
      const roll = rng(seedN++)
      let prop: string
      if (!is.dressed) prop = trees[Math.floor(rng(seedN++) * 3)]
      else if (roll < 0.52) prop = trees[Math.floor(rng(seedN++) * 3)]
      else if (roll < 0.80) prop = 'bush'
      else prop = 'rock'
      // per-instance size variation: trees vary most, ground props stay small
      const isTree = prop === 'pine' || prop === 'fir' || prop === 'leafy'
      const scl = isTree ? 0.78 + 0.5 * rng(seedN++) : 0.7 + 0.35 * rng(seedN++)
      props.push({ gx, gy, prop, scl })
    }
  }
  const hub = ISLANDS[0]
  props.push({ gx: hub.cx + hub.r * 0.58, gy: hub.cy + hub.r * 0.58, prop: 'dock', scl: 1 })
  props.push({ gx: hub.cx + hub.r * 1.02, gy: hub.cy + hub.r * 1.02, prop: 'boat', scl: 1 })
  props.push({ gx: hub.cx, gy: hub.cy - 0.6, prop: 'lighthouse', scl: 1 })
  props.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy))

  const TEX: Record<string, Tex> = {}
  let ready = false
  Promise.all(Object.entries(PROP_FILES).map(([k, u]) => loadTex(gl, u).then((t) => { TEX[k] = t }).catch(() => {})))
    .then(() => { ready = true })

  let W = 1, H = 1
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    W = canvas.width; H = canvas.height
  }
  function fullQuad() {
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, new Float32Array([-1, 1, 0, 0, 1, 1, 1, 0, 1, -1, 1, 1, -1, 1, 0, 0, 1, -1, 1, 1, -1, -1, 0, 1]))
  }
  function putQuad(cx: number, gy: number, dw: number, dh: number, anchorY: number) {
    const x0 = cx - dw / 2, x1 = cx + dw / 2, yTop = gy - anchorY, yBot = gy - anchorY + dh
    const X = (v: number) => (v / W) * 2 - 1, Y = (v: number) => 1 - (v / H) * 2
    const X0 = X(x0), X1 = X(x1), Y0 = Y(yTop), Y1 = Y(yBot)
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, new Float32Array([X0, Y0, 0, 0, X1, Y0, 1, 0, X1, Y1, 1, 1, X0, Y0, 0, 0, X1, Y1, 1, 1, X0, Y1, 0, 1]))
  }

  let raf = 0
  const start = performance.now()
  function frame(now: number) {
    resize()
    gl!.viewport(0, 0, W, H)
    gl!.clearColor(0.03, 0.10, 0.14, 1); gl!.clear(gl!.COLOR_BUFFER_BIT)
    const time = (now - start) / 1000
    const ox = W / 2 - (hub.cx - hub.cy) * HW
    const oy = H / 2 - (hub.cx + hub.cy) * HH - 20
    gl!.bindVertexArray(vao); gl!.bindBuffer(gl!.ARRAY_BUFFER, buf)

    // 1) world (ocean + land) full screen
    gl!.useProgram(worldP)
    gl!.uniform2f(uRes, W, H); gl!.uniform2f(uOrigin, ox, oy)
    gl!.uniform1f(uHWl, HW); gl!.uniform1f(uHHl, HH)
    gl!.uniform1f(uTime, time); gl!.uniform1f(uPix, 3.0)
    gl!.uniform4fv(uIslands, islandData); gl!.uniform1i(uIslandCount, ISLANDS.length)
    fullQuad(); gl!.drawArrays(gl!.TRIANGLES, 0, 6)

    if (!ready) { raf = requestAnimationFrame(frame); return }

    // 2) props (soft shadow under each, then sprite), depth-sorted
    for (const p of props) {
      const tex = TEX[p.prop]; if (!tex) continue
      const sx = ox + (p.gx - p.gy) * HW, sy = oy + (p.gx + p.gy) * HH
      if (sx < -200 || sx > W + 200 || sy < -300 || sy > H + 300) continue
      const s = (PROP_SCALE[p.prop] ?? 0.8) * SCALE * p.scl
      const dw = tex.w * s, dh = tex.h * s
      // grounding shadow (skip the boat which sits on water)
      if (p.prop !== 'boat') {
        gl!.useProgram(shadowP); gl!.uniform1f(uAlphaS, 0.28)
        putQuad(sx, sy - 2 * SCALE, dw * 0.78, dw * 0.36, dw * 0.18)
        gl!.drawArrays(gl!.TRIANGLES, 0, 6)
      }
      gl!.useProgram(quadP); gl!.uniform1i(uTexQ, 0); gl!.uniform3f(uTintQ, 1, 1, 1)
      gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, tex.tex)
      putQuad(sx, sy - 6 * SCALE, dw, dh, dh - 8 * SCALE)
      gl!.drawArrays(gl!.TRIANGLES, 0, 6)
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => { cancelAnimationFrame(raf); gl.getExtension('WEBGL_lose_context')?.loseContext() }
}
