// BLHS overworld — the iso sea. Water is a stylized-realistic shader (Octopath-ish): it sits
// in the pixel world via a chunky posterize. Islands are EXTRUDED into real iso volumes — a
// raised grass top over a dirt/rock cliff face with a beach rim and a cast shadow on the water,
// so they read as land sitting IN the sea, not flat blobs floating on it. Structures + Thor
// compose on top next.

import { ISLANDS } from '../app/world'
import { HW, HH, CLIFF, PROP_ZOOM, camera } from './iso'

const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uHW, uHH, uTime, uCliff;
uniform vec4 uIslands[5];
uniform int uCount;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+1.7;a*=0.5;} return v; }

float coastR(float th, float baseR, float seed){
  return baseR*(1.0 + 0.22*sin(2.0*th+seed) + 0.13*sin(3.0*th+seed*1.7)
                    + 0.08*sin(5.0*th+seed*2.3) + 0.05*sin(8.0*th+seed*3.1));
}
float coastSD(vec2 g){
  float sd = 1e9;
  for(int i=0;i<5;i++){ if(i>=uCount) break;
    vec2 c = uIslands[i].xy; vec2 d = g - c;
    sd = min(sd, length(d) - coastR(atan(d.y,d.x), uIslands[i].z, uIslands[i].w));
  }
  return sd;
}
vec2 worldAt(vec2 s){
  float fx=(s.x-uOrigin.x)/uHW, fy=(s.y-uOrigin.y)/uHH;
  return vec2((fx+fy)*0.5, (fy-fx)*0.5);
}

float waveH(vec2 p, float t){
  float h = 0.0;
  h += 0.50*sin(dot(p, vec2( 0.80, 0.60))*0.85 + t*1.20);
  h += 0.34*sin(dot(p, vec2(-0.30, 0.95))*1.30 + t*1.70);
  h += 0.22*sin(dot(p, vec2( 0.95,-0.25))*2.20 + t*2.20);
  h += 0.30*(0.5 - abs(fbm(p*1.6 + vec2(t*0.25, -t*0.16)) - 0.5));
  return h;
}

void main(){
  float PIX = 3.0;
  vec2 frag = floor(gl_FragCoord.xy/PIX)*PIX + PIX*0.5;
  float sx = frag.x, sy = uRes.y - frag.y;
  vec2 g = worldAt(vec2(sx, sy));
  float t = uTime;
  float sd = coastSD(g);

  // iso extrusion: the island TOP is the footprint raised uCliff px up the screen; the
  // southern footprint band (not covered by the raised top) is the visible cliff face.
  float sdTop = coastSD(worldAt(vec2(sx, sy + uCliff)));
  bool isTop = sdTop < 0.0;
  bool isCliff = (!isTop) && (sd < 0.0);

  vec3 col;
  if (isTop) {
    // ---- raised GRASS top ----
    vec2 gT = worldAt(vec2(sx, sy + uCliff));
    float n1 = fbm(gT*0.5 + 3.0), n2 = noise(gT*1.9);
    vec3 gDark = vec3(0.15,0.42,0.19), gLite = vec3(0.46,0.74,0.36);   // lush tropical green
    col = mix(gDark, gLite, n1) + (n2-0.5)*0.06;
    col *= 0.88 + 0.22*fbm(gT*0.20 + 9.0);                 // sunlit clearings / shade
    col += 0.05*vec3(0.10,0.20,0.0)*noise(gT*3.3);         // fine leafy mottle
    float bt = smoothstep(-2.4, -0.2, sdTop);              // near the top's coastline
    vec3 sand = mix(vec3(0.82,0.72,0.50), vec3(0.97,0.90,0.68), n2); // bright tropical sand
    col = mix(col, sand, smoothstep(0.45, 1.0, bt));
  } else if (isCliff) {
    // ---- dirt/rock CLIFF FACE (the volume) ----
    float fy = clamp(sdTop*0.7, 0.0, 1.0);                 // 0 just under grass -> 1 at base
    vec3 rTop = vec3(0.44,0.32,0.22), rBot = vec3(0.16,0.11,0.09);
    col = mix(rTop, rBot, fy);
    col *= 0.92 + 0.10*sin(sy*0.5) + 0.07*(noise(vec2(sx*0.07, sy*0.12))-0.5); // strata + grain
    col = mix(col, vec3(0.50,0.66,0.32), smoothstep(0.18, 0.0, fy)*0.85);      // sunlit grass lip
    col *= mix(0.62, 1.0, smoothstep(1.0, 0.25, fy));      // AO into the waterline
  } else {
    // ===== OCEAN: layered swells, depth color, warm sun sheen, crisp foam =====
    float depth = clamp(sd / 26.0, 0.0, 1.0);
    vec3 cAqua  = vec3(0.56, 0.92, 0.85);
    vec3 cTeal  = vec3(0.14, 0.64, 0.67);
    vec3 cDeep  = vec3(0.05, 0.27, 0.41);
    vec3 cAbyss = vec3(0.02, 0.12, 0.24);
    col = depth < 0.22 ? mix(cAqua, cTeal, depth / 0.22)
        : depth < 0.55 ? mix(cTeal, cDeep, (depth - 0.22) / 0.33)
                       : mix(cDeep, cAbyss, (depth - 0.55) / 0.45);

    float Hh = 0.0; vec2 grad = vec2(0.0);
    vec2 D1 = normalize(vec2(0.85, 0.52)); float k1 = 6.2831 / 13.0; float p1 = dot(D1, g) * k1 + t * 0.75;
    Hh += 1.00 * sin(p1); grad += 1.00 * cos(p1) * k1 * D1;
    vec2 D2 = normalize(vec2(-0.45, 0.90)); float k2 = 6.2831 / 8.0; float p2 = dot(D2, g) * k2 + t * 1.05;
    Hh += 0.55 * sin(p2); grad += 0.55 * cos(p2) * k2 * D2;
    vec2 D3 = normalize(vec2(0.90, -0.25)); float k3 = 6.2831 / 4.5; float p3 = dot(D3, g) * k3 + t * 1.6;
    Hh += 0.28 * sin(p3); grad += 0.28 * cos(p3) * k3 * D3;
    Hh += 0.5 * (fbm(g * 1.3 + vec2(t * 0.22, -t * 0.15)) - 0.5);

    vec3 N = normalize(vec3(-grad * 0.21, 1.0));
    vec3 L = normalize(vec3(-0.5, -0.34, 0.74));
    vec3 V = normalize(vec3(0.0, -0.42, 1.0));

    float diff = dot(N, L) * 0.5 + 0.5;
    col *= mix(0.66, 1.30, diff);
    col = mix(col, col * vec3(0.9, 0.97, 1.06), depth * 0.5);

    vec3 Hv = normalize(L + V);
    float spec = pow(max(dot(N, Hv), 0.0), 22.0);
    vec2 uvp = gl_FragCoord.xy / uRes;
    float sunMask = smoothstep(1.15, 0.1, length(uvp - vec2(0.32, 0.74)));
    col += vec3(1.0, 0.93, 0.72) * spec * 0.5 * (0.35 + 0.65 * sunMask) * smoothstep(2.0, 8.0, sd);

    float capN = fbm(g * 2.0 + vec2(t * 0.3, 0.0));
    float caps = smoothstep(0.93, 1.04, Hh * 0.5 + 0.5) * smoothstep(0.58, 0.82, capN);
    col = mix(col, vec3(0.93, 0.98, 0.97), caps * 0.5 * smoothstep(4.0, 11.0, sd));

    float sdShadow = coastSD(worldAt(vec2(sx + 7.0, sy + 16.0)));
    float shadow = smoothstep(0.0, -2.0, sdShadow) * smoothstep(3.5, 0.0, sd);
    col *= mix(1.0, 0.74, clamp(shadow, 0.0, 1.0));

    float shelf = (1.0 - smoothstep(0.0, 4.0, sd)) * step(0.0, sd);
    float caus = smoothstep(0.5, 1.0, (sin(g.x * 1.7 + t) * sin(g.y * 1.6 - t * 0.7)) * 0.5 + 0.5);
    col += vec3(0.14, 0.24, 0.20) * caus * shelf * 0.5;

    float foamMask = smoothstep(1.5, 0.2, sd) * step(0.0, sd);
    float foamN = fbm(g * 2.6 + vec2(t * 0.35, -t * 0.22)) + 0.16 * sin(t * 2.0 + (g.x + g.y) * 2.0);
    float foam = smoothstep(0.55, 0.72, foamN * foamMask + foamMask * 0.4);
    col = mix(col, vec3(0.97, 1.0, 0.98), foam);
  }

  col *= vec3(1.04,1.02,0.97);   // warm golden grade
  col = floor(col*14.0)/14.0;    // posterize -> sits in a pixel world
  o = vec4(col, 1.0);
}`

// HD-2D post pass (the Octopath layer): the scene is rendered to a texture, then this blooms
// the bright bits (sun glints, foam, lit grass) into a soft glow + a warm cinematic grade +
// vignette. This is what lifts the pixel base toward the "realism over pixels" look.
const FRAG_POST = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uScene;
uniform vec2 uRes;
vec3 brightPass(vec3 c){ float l = dot(c, vec3(0.299,0.587,0.114)); return c * smoothstep(0.68, 0.98, l); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 texel = 1.0 / uRes;
  vec3 base = texture(uScene, uv).rgb;
  // radial multi-tap bloom on the bright pass (two rings)
  vec3 bloom = vec3(0.0); float wsum = 0.0;
  for(int i=0;i<16;i++){
    float a = (float(i)+0.5)/16.0 * 6.28318;
    vec2 dir = vec2(cos(a), sin(a));
    for(int r=1;r<=2;r++){
      vec2 off = dir * float(r) * 3.2 * texel;
      float w = 1.0/float(r);
      bloom += brightPass(texture(uScene, uv + off).rgb) * w; wsum += w;
    }
  }
  bloom /= wsum;
  vec3 col = base + bloom * 0.8;                  // additive HD-2D glow
  col *= vec3(1.05, 1.01, 0.95);                  // warm cinematic grade
  col = clamp(col, 0.0, 1.0);
  col = pow(col, vec3(0.94));                      // gentle lift / filmic
  float vig = 1.0 - dot(uv-0.5, uv-0.5) * 0.55;   // soft vignette
  o = vec4(col * vig, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s))
  return s
}

// ---- JS mirror of the shader coast math, for placing props on the land ----
function coastRjs(th: number, baseR: number, seed: number) {
  return baseR * (1 + 0.22 * Math.sin(2 * th + seed) + 0.13 * Math.sin(3 * th + seed * 1.7)
    + 0.08 * Math.sin(5 * th + seed * 2.3) + 0.05 * Math.sin(8 * th + seed * 3.1))
}
function coastSDjs(gx: number, gy: number) {
  let sd = 1e9
  for (const is of ISLANDS) {
    const dx = gx - is.cx, dy = gy - is.cy
    sd = Math.min(sd, Math.hypot(dx, dy) - coastRjs(Math.atan2(dy, dx), is.r, is.seed))
  }
  return sd
}

const PROP_FILES: Record<string, string> = {
  palm1: '/art/overworld/palm1.png', palm2: '/art/overworld/palm2.png',
  fern: '/art/overworld/fern.png', boulder: '/art/overworld/boulder.png',
}
type Prop = { gx: number; gy: number; kind: string; scl: number }

// designed planting: palms ring the coast, ferns fill, boulders sit at the beach; the hub
// keeps an open centre for the Commons structure + dock.
function buildProps(): Prop[] {
  const rng = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }
  const props: Prop[] = []
  let s = 1
  for (const is of ISLANDS) {
    const hub = is.cx === 0 && is.cy === 0
    const palms = Math.round(is.r * 1.7)
    for (let k = 0; k < palms; k++) {
      const ang = k * 2.399963 + is.seed
      const rad = (0.50 + 0.42 * rng(s++)) * is.r
      const gx = is.cx + Math.cos(ang) * rad, gy = is.cy + Math.sin(ang) * rad
      if (coastSDjs(gx, gy) > -0.6) continue
      if (hub && Math.hypot(gx, gy) < is.r * 0.34) continue // keep the plaza clear
      props.push({ gx, gy, kind: rng(s++) < 0.5 ? 'palm1' : 'palm2', scl: 0.42 + 0.16 * rng(s++) })
    }
    const ferns = Math.round(is.r * 2.4)
    for (let k = 0; k < ferns; k++) {
      const ang = rng(s++) * Math.PI * 2, rad = (0.15 + 0.78 * Math.sqrt(rng(s++))) * is.r
      const gx = is.cx + Math.cos(ang) * rad, gy = is.cy + Math.sin(ang) * rad
      if (coastSDjs(gx, gy) > -0.8) continue
      if (hub && Math.hypot(gx, gy) < is.r * 0.3) continue
      props.push({ gx, gy, kind: 'fern', scl: 0.5 + 0.4 * rng(s++) })
    }
    const rocks = Math.max(1, Math.round(is.r * 0.35))
    for (let k = 0; k < rocks; k++) {
      const ang = rng(s++) * Math.PI * 2, rad = 0.82 * is.r
      const gx = is.cx + Math.cos(ang) * rad, gy = is.cy + Math.sin(ang) * rad
      if (coastSDjs(gx, gy) > -0.3) continue
      props.push({ gx, gy, kind: 'boulder', scl: 0.5 + 0.3 * rng(s++) })
    }
  }
  return props.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy))
}

export function startOverworld(container: HTMLElement): () => void {
  // two stacked layers sharing one iso camera: WebGL sea + island below, Canvas2D props above
  const canvas = document.createElement('canvas')
  const propCanvas = document.createElement('canvas')
  for (const c of [canvas, propCanvas]) {
    c.style.position = 'absolute'; c.style.inset = '0'; c.style.width = '100%'; c.style.height = '100%'; c.style.display = 'block'
    container.appendChild(c)
  }
  const pctx = propCanvas.getContext('2d')!

  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
  if (!gl) throw new Error('WebGL2 not available')
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p))
  gl.useProgram(p)

  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(p, 'aPos')
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const uRes = gl.getUniformLocation(p, 'uRes'), uOrigin = gl.getUniformLocation(p, 'uOrigin')
  const uHWl = gl.getUniformLocation(p, 'uHW'), uHHl = gl.getUniformLocation(p, 'uHH')
  const uTime = gl.getUniformLocation(p, 'uTime'), uCliffl = gl.getUniformLocation(p, 'uCliff')
  const uIslands = gl.getUniformLocation(p, 'uIslands'), uCount = gl.getUniformLocation(p, 'uCount')
  const islandData = new Float32Array(5 * 4)
  ISLANDS.forEach((is, i) => { islandData[i * 4] = is.cx; islandData[i * 4 + 1] = is.cy; islandData[i * 4 + 2] = is.r; islandData[i * 4 + 3] = is.seed })

  // ---- HD-2D post pass: scene renders to an offscreen texture, then bloom+grade to screen ----
  const postP = gl.createProgram()!
  gl.attachShader(postP, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(postP, compile(gl, gl.FRAGMENT_SHADER, FRAG_POST))
  gl.linkProgram(postP)
  if (!gl.getProgramParameter(postP, gl.LINK_STATUS)) throw new Error('link post: ' + gl.getProgramInfoLog(postP))
  const aPosPost = gl.getAttribLocation(postP, 'aPos')
  const uScenePost = gl.getUniformLocation(postP, 'uScene'), uResPost = gl.getUniformLocation(postP, 'uRes')
  const fbo = gl.createFramebuffer()
  const sceneTex = gl.createTexture()!
  let texW = 0, texH = 0
  function ensureTarget(w: number, h: number) {
    if (w === texW && h === texH) return
    texW = w; texH = h
    gl!.bindTexture(gl!.TEXTURE_2D, sceneTex)
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, sceneTex, 0)
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
  }

  // ---- props (Canvas2D overlay) ----
  const props = buildProps()
  const TEX: Record<string, HTMLImageElement> = {}
  let propsReady = false
  let W = 1, H = 1
  Promise.all(Object.entries(PROP_FILES).map(([k, u]) => new Promise<void>((res) => {
    const img = new Image(); img.onload = () => { TEX[k] = img; res() }; img.onerror = () => res(); img.src = u
  }))).then(() => { propsReady = true })
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h; propCanvas.width = w; propCanvas.height = h
      pctx.imageSmoothingEnabled = false
    }
    W = canvas.width; H = canvas.height
  }

  function drawProps() {
    pctx.clearRect(0, 0, W, H)
    const z = camera.zoom, ehw = HW * z, ehh = HH * z
    const ox = W / 2 - (camera.cx - camera.cy) * ehw, oy = H / 2 - (camera.cx + camera.cy) * ehh
    for (const p of props) {
      const img = TEX[p.kind]; if (!img) continue
      const sxP = ox + (p.gx - p.gy) * ehw
      const syP = oy + (p.gx + p.gy) * ehh - CLIFF * z
      const w = img.width * p.scl * PROP_ZOOM * z, h = img.height * p.scl * PROP_ZOOM * z
      // grounded directional shadow (sun upper-left -> shadow lower-right)
      pctx.save()
      pctx.translate(sxP + w * 0.10, syP)
      pctx.rotate(0.5)
      pctx.fillStyle = 'rgba(6,34,34,0.30)'
      pctx.beginPath(); pctx.ellipse(0, 0, w * 0.34, w * 0.13, 0, 0, Math.PI * 2); pctx.fill()
      pctx.restore()
      pctx.drawImage(img, Math.round(sxP - w / 2), Math.round(syP - h), Math.round(w), Math.round(h))
    }
  }

  let raf = 0
  const start = performance.now()
  function frame(now: number) {
    resize()
    ensureTarget(W, H)
    // camera -> projection (zoom + centre, animatable for cutscenes)
    const z = camera.zoom, ehw = HW * z, ehh = HH * z
    const ox = W / 2 - (camera.cx - camera.cy) * ehw, oy = H / 2 - (camera.cx + camera.cy) * ehh
    // 1) render the sea + islands into the offscreen scene texture
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
    gl!.viewport(0, 0, W, H)
    gl!.useProgram(p)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buf)
    gl!.enableVertexAttribArray(aPos); gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0)
    gl!.uniform2f(uRes, W, H); gl!.uniform2f(uOrigin, ox, oy)
    gl!.uniform1f(uHWl, ehw); gl!.uniform1f(uHHl, ehh)
    gl!.uniform1f(uTime, (now - start) / 1000); gl!.uniform1f(uCliffl, CLIFF * z)
    gl!.uniform4fv(uIslands, islandData); gl!.uniform1i(uCount, ISLANDS.length)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    // 2) bloom + cinematic grade -> screen (the Octopath HD-2D pass)
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
    gl!.viewport(0, 0, W, H)
    gl!.useProgram(postP)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buf)
    gl!.enableVertexAttribArray(aPosPost); gl!.vertexAttribPointer(aPosPost, 2, gl!.FLOAT, false, 0, 0)
    gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, sceneTex)
    gl!.uniform1i(uScenePost, 0); gl!.uniform2f(uResPost, W, H)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    if (propsReady) drawProps() // redraw every frame so props track the animating camera
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf); gl.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.remove(); propCanvas.remove()
  }
}
