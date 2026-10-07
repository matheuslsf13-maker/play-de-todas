/**
 * Desenha a pele (malha deformada) com WebGL, em alta resolucao -- so na hora
 * de GERAR os quadros da animacao (scripts/hall/quadros.mjs). Cada quadro e
 * depois transformado em pixel art com a paleta fixa da menina.
 */
import type { Malha } from './malha'

const VERTICES = `
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform vec2 u_tela;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos.x / u_tela.x * 2.0 - 1.0, 1.0 - a_pos.y / u_tela.y * 2.0, 0.0, 1.0);
}`

const FRAGMENTOS = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv); // ja pre-multiplicado
}`

export class DesenhistaDaPele {
  readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private prog: WebGLProgram
  private bPos: WebGLBuffer
  private bUv: WebGLBuffer
  private bIdx: WebGLBuffer
  private texturas = new Map<string, WebGLTexture>()

  static criar(): DesenhistaDaPele | null {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true })
    if (!gl) return null
    return new DesenhistaDaPele(c, gl)
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas
    this.gl = gl
    const sh = (tipo: number, src: string) => {
      const s = gl.createShader(tipo)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERTICES))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAGMENTOS))
    gl.linkProgram(p)
    this.prog = p
    this.bPos = gl.createBuffer()!
    this.bUv = gl.createBuffer()!
    this.bIdx = gl.createBuffer()!
  }

  textura(nome: string, im: HTMLImageElement | HTMLCanvasElement): void {
    if (this.texturas.has(nome)) return
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.texturas.set(nome, tex)
  }

  /** Desenha a malha com as posicoes ja em pixels deste canvas. */
  desenhar(nome: string, malha: Malha, posicoes: Float32Array, uv: Float32Array, largura: number, altura: number) {
    const gl = this.gl
    const tex = this.texturas.get(nome)
    if (!tex) return
    if (this.canvas.width !== largura || this.canvas.height !== altura) {
      this.canvas.width = largura
      this.canvas.height = altura
    }
    gl.viewport(0, 0, largura, altura)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.prog)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_tela'), largura, altura)
    const aPos = gl.getAttribLocation(this.prog, 'a_pos')
    const aUv = gl.getAttribLocation(this.prog, 'a_uv')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bUv)
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(aUv)
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos)
    gl.bufferData(gl.ARRAY_BUFFER, posicoes, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, malha.indices, gl.DYNAMIC_DRAW)
    gl.drawElements(gl.TRIANGLES, malha.indices.length, gl.UNSIGNED_SHORT, 0)
  }
}
