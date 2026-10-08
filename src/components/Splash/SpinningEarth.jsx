import { useEffect, useRef } from 'react'
import { asset } from '../../config/assets'
import { EARTH } from './earth'

// The Earth, turning. The same sphere as the still picture in earth.js, drawn live: each
// pixel of the disc is traced back to a longitude and latitude and looks up NASA's Blue
// Marble map there, then is lit from the upper left exactly as the picture was. Because the
// geometry and lighting match, the picture can sit underneath and this canvas fades in over it
// with no visible change until it starts to move.
//
// It draws only while the page is visible (requestAnimationFrame stops in a hidden tab), and
// not at all when the visitor has asked for less motion or the browser has no WebGL: the
// picture then stays as it is.

const MAP = asset('images/earth-map.webp')

// The Earth sways east and west of the run: a visible, unhurried turn that keeps the area in view
const SWAY_DEGREES = 18
const SWAY_PERIOD_MS = 32000

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

// Same arithmetic as the script that drew earth.webp (orthographic, sun from the upper left,
// blue haze at the edge); see CLAUDE.md before changing either.
const FRAGMENT = `
precision highp float;
uniform sampler2D u_map;
uniform float u_lat0;
uniform float u_lon0;
uniform float u_disc;
uniform float u_pixel;
varying vec2 v_uv;
const float PI = 3.14159265358979;
float ease(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
void main() {
  vec3 SUN = normalize(vec3(-0.62, 0.40, 0.68));
  vec2 p = (v_uv - 0.5) / (0.5 * u_disc);
  float nx = p.x;
  float ny = -p.y;
  float r = sqrt(nx * nx + ny * ny);
  if (r > 1.09) { gl_FragColor = vec4(0.0); return; }
  if (r > 1.0 + u_pixel) {
    // the thin atmosphere outside the edge, only where the sun reaches it
    vec2 edge = vec2(nx, ny) / r;
    float day = ease(-0.15, 0.5, edge.x * SUN.x + edge.y * SUN.y);
    float a = exp(-(r - 1.0) / 0.011) * 0.55 * day;
    gl_FragColor = vec4(vec3(90.0, 150.0, 255.0) / 255.0 * a, a);
    return;
  }
  float z = sqrt(max(0.0, 1.0 - r * r));
  float phi0 = u_lat0;
  float lat = asin(clamp(z * sin(phi0) + ny * cos(phi0), -1.0, 1.0));
  float lon = u_lon0 + atan(nx, z * cos(phi0) - ny * sin(phi0));
  vec3 land = texture2D(u_map, vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI)).rgb;
  float lambert = nx * SUN.x + ny * SUN.y + z * SUN.z;
  float day = ease(-0.10, 0.42, lambert);
  float shade = 0.07 + 0.93 * day;
  float rim = pow(1.0 - z, 2.4) * (0.25 + 0.75 * day);
  vec3 colour = land * shade * vec3(0.94, 0.94, 0.98) + vec3(70.0, 130.0, 235.0) / 255.0 * rim;
  float cover = clamp((1.0 - r) / u_pixel + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(min(colour, 1.0) * cover, cover);
}`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

// `onTurn(longitude)` is called on every frame with the longitude at the middle of the view, so
// things drawn on the Earth (the mark, the radar track) can follow it. `onShown` is called once
// the first frame is on the canvas.
export default function SpinningEarth({ onTurn, onShown }) {
  const canvasRef = useRef(null)
  const turnRef = useRef(onTurn)
  const shownRef = useRef(onShown)
  turnRef.current = onTurn
  shownRef.current = onShown

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
    if (!gl) return undefined

    let frame = 0
    let disposed = false
    let program
    let texture
    let buffer
    try {
      program = gl.createProgram()
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    } catch (error) {
      console.warn('The turning Earth could not start; the still picture stays.', error)
      return undefined
    }
    gl.useProgram(program)

    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uniform = (name) => gl.getUniformLocation(program, name)
    const radians = (degrees) => (degrees * Math.PI) / 180
    gl.uniform1f(uniform('u_lat0'), radians(EARTH.latitude0))
    gl.uniform1f(uniform('u_disc'), EARTH.disc)
    const lon0 = uniform('u_lon0')
    const pixel = uniform('u_pixel')

    // Sharp on a high-density screen, but never a bigger canvas than the picture is worth
    const resize = () => {
      const size = Math.min(2200, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)))
      if (size > 0 && canvas.width !== size) {
        canvas.width = size
        canvas.height = size
        gl.viewport(0, 0, size, size)
        // one pixel, in units of the planet's radius
        gl.uniform1f(pixel, 1 / (size * 0.5 * EARTH.disc))
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const started = performance.now()
    const draw = (now) => {
      const longitude = EARTH.longitude0 + SWAY_DEGREES * Math.sin(((now - started) / SWAY_PERIOD_MS) * 2 * Math.PI)
      gl.uniform1f(lon0, radians(longitude))
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      turnRef.current?.(longitude)
    }

    const image = new Image()
    image.decoding = 'async'
    image.src = MAP
    image
      .decode()
      .then(() => {
        if (disposed) return
        texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        const tick = (now) => {
          draw(now)
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame((now) => {
          tick(now)
          shownRef.current?.()
        })
      })
      .catch(() => {
        // The map could not be fetched: the still picture is all there is, and it is enough.
      })

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      // The context is not given up explicitly: React runs an effect twice in development, and
      // the second run gets this same canvas, where a context that was lost cannot be restarted.
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
}
