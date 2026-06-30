import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

// chunky pixel-art texture (HD-2D = pixel texels on 3D geometry, not smooth materials)
function pixelTex(shades: string[], size = 24): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size
  const x = c.getContext('2d')!
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    x.fillStyle = shades[(Math.random() * shades.length) | 0]
    x.fillRect(i, j, 1, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3)
  return t
}

// The real fresh start: a 3D HD-2D overworld (the Octopath approach). A true reflective +
// refractive water surface (THREE.Water) under a golden-hour Sky the water mirrors, real
// island geometry lit by a real sun, and cinematic bloom. Pixel-art textures + sprites layer
// onto this next; first prove the WATER actually looks like water, not a flat painted sheet.
export default function Overworld3D() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current!
    const W = () => el.clientWidth, H = () => el.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W(), H())
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.42
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, W() / H(), 1, 20000)
    camera.position.set(0, 230, 330)
    camera.lookAt(0, 0, 0)

    // --- water (true reflection + refraction + normal-map waves) ---
    const water = new Water(new THREE.PlaneGeometry(12000, 12000), {
      textureWidth: 1024, textureHeight: 1024,
      waterNormals: new THREE.TextureLoader().load('/art/water/waternormals.jpg', (tx) => { tx.wrapS = tx.wrapT = THREE.RepeatWrapping }),
      sunDirection: new THREE.Vector3(),
      sunColor: 0xfff0d8,
      waterColor: 0x0b566a,
      distortionScale: 2.2,
      fog: false,
    })
    water.rotation.x = -Math.PI / 2
    scene.add(water)

    // --- golden-hour sky (what the water reflects) ---
    const sky = new Sky()
    sky.scale.setScalar(12000)
    scene.add(sky)
    const su = (sky.material as THREE.ShaderMaterial).uniforms
    su.turbidity.value = 8
    su.rayleigh.value = 2.6
    su.mieCoefficient.value = 0.005
    su.mieDirectionalG.value = 0.86

    const sun = new THREE.Vector3()
    const elevation = 32, azimuth = 135
    const phi = THREE.MathUtils.degToRad(90 - elevation)
    const theta = THREE.MathUtils.degToRad(azimuth)
    sun.setFromSphericalCoords(1, phi, theta)
    su.sunPosition.value.copy(sun)
    ;(water.material as THREE.ShaderMaterial).uniforms.sunDirection.value.copy(sun).normalize()

    // --- light ---
    const dl = new THREE.DirectionalLight(0xfff1d6, 2.4)
    dl.position.copy(sun).multiplyScalar(300)
    scene.add(dl)
    scene.add(new THREE.AmbientLight(0x9fc2dd, 0.75))

    // --- islands (pixel-art textured 3D geometry = the HD-2D blend) ---
    const grassTex = pixelTex(['#3f7d2e', '#4f9239', '#5aa244', '#356e29', '#69ad4f'])
    const sandTex = pixelTex(['#e3cd92', '#d9c184', '#ecd9a2', '#cdb878'])
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
    const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 })
    function island(x: number, z: number, r: number) {
      const g = new THREE.Group()
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.32, 9, 28), sandMat)
      sand.position.y = 1.5
      g.add(sand)
      const grass = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), grassMat)
      grass.scale.y = 0.42
      grass.position.y = 6
      g.add(grass)
      g.position.set(x, 0, z)
      scene.add(g)
    }
    island(0, 0, 56)
    island(-165, -130, 34)
    island(180, -95, 36)
    island(-120, 150, 34)
    island(160, 130, 30)

    // --- HD-2D post: render the 3D scene PIXELATED (the realism+pixelism blend), then a gentle glow ---
    const composer = new EffectComposer(renderer)
    const pixelPass = new RenderPixelatedPass(4, scene, camera)
    pixelPass.normalEdgeStrength = 0.3
    pixelPass.depthEdgeStrength = 0.4
    composer.addPass(pixelPass)
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.13, 0.4, 0.96))

    let raf = 0
    function loop() {
      ;(water.material as THREE.ShaderMaterial).uniforms.time.value += 1 / 60
      composer.render()
      raf = requestAnimationFrame(loop)
    }
    loop()

    function onResize() {
      camera.aspect = W() / H()
      camera.updateProjectionMatrix()
      renderer.setSize(W(), H())
      composer.setSize(W(), H())
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#0a1a22' }} />
}
