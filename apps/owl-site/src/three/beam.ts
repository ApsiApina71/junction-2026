// The atmosphere look's light cones (?fx=air, see fx.ts).
import * as THREE from 'three'

/**
 * A light cone with its tip at the lamp. Unlike a flat see-through cone it is brightest at the lamp and along its
 * middle, and fades out toward its edges and its far end, the way a beam looks in hazy air. Drawn additively.
 * It also fades out within `near` metres of the eye, so walking close to (or into) one never fills the view.
 */
export function softBeam(color: string, strength: number, near = 2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, near: { value: near } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vDepth;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        // Cone and cylinder uvs run from 1 at the top (the tip, at the lamp) to 0 at the open end.
        vAlong = 1.0 - uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      uniform float near;
      varying float vAlong;
      varying float vDepth;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        // Multisampling can read the varyings just outside the triangle, so clamp before pow: a NaN here would
        // spread over the whole frame through the bloom.
        float along = clamp(vAlong, 0.0, 1.0);
        // Faces seen head-on are the middle of the beam; the silhouette is its edge.
        float middle = pow(clamp(abs(dot(normalize(vNormal), normalize(vView))), 0.0, 1.0), 1.8);
        float reach = pow(1.0 - along, 0.6) * smoothstep(0.0, 0.06, along);
        float away = smoothstep(near * 0.35, near, vDepth);
        gl_FragColor = vec4(max(color * strength * middle * reach * away, 0.0), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}
