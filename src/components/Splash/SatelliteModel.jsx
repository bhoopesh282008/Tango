import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { asset } from '../../config/assets'

// NASA's Jason-1 model (github.com/nasa/NASA-3D-Resources): a gold body with a solar wing
// on each side. The Draco decoder in public/draco is there for compressed models.
const MODEL_URL = asset('models/jason1.glb')
const DRACO_PATH = asset('draco/')
// The satellite rocks gently about this pose, so both wings stay in view.
// At y = ±90° the wings spread left and right with their faces to the viewer.
const POSE = { x: 0.3, y: -1.9, z: 0.1 }
const ROCK_RADIANS = 0.22
const ROCK_PERIOD_MS = 24000

// Renders the satellite on a transparent canvas that fills its parent.
export default function SatelliteModel({ onShown }) {
  const hostRef = useRef(null)
  const shownRef = useRef(onShown)
  shownRef.current = onShown

  useEffect(() => {
    const host = hostRef.current
    let renderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return undefined // No WebGL: the scene simply has no satellite.
    }
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(30, 1, 0.1, 100)
    camera.position.set(0, 0, 6)

    // Sunlight from one side and almost nothing else, as in orbit.
    const sun = new DirectionalLight(0xfff4e0, 3.6)
    sun.position.set(2, 3, 6)
    scene.add(sun, new AmbientLight(0x8fb4ff, 0.6))

    const satellite = new Group()
    scene.add(satellite)

    const resize = () => {
      const { clientWidth, clientHeight } = host
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(clientHeight, 1)
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }
    resize()
    window.addEventListener('resize', resize)

    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH)
    let disposed = false
    let frame = 0

    new GLTFLoader().setDRACOLoader(draco).load(MODEL_URL, (gltf) => {
      if (disposed) return
      const model = gltf.scene
      // Centre the model and scale it to fill the view whatever its native units are.
      const box = new Box3().setFromObject(model)
      const size = box.getSize(new Vector3())
      model.position.sub(box.getCenter(new Vector3()))
      satellite.add(model)
      satellite.scale.setScalar(3 / Math.max(size.x, size.y, size.z))
      satellite.rotation.set(POSE.x, POSE.y, POSE.z)
      renderer.render(scene, camera)
      shownRef.current?.()

      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const started = performance.now()
      const tick = (now) => {
        const phase = ((now - started) / ROCK_PERIOD_MS) * 2 * Math.PI
        satellite.rotation.y = POSE.y + Math.sin(phase) * ROCK_RADIANS
        renderer.render(scene, camera)
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      draco.dispose()
      scene.traverse((object) => {
        object.geometry?.dispose()
        for (const material of [].concat(object.material ?? [])) material.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={hostRef} className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full" />
}
