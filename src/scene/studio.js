import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

export const PALETTE = {
  ivory: new THREE.Color(0xeee8de),
  backdrop: new THREE.Color(0xe9e3d8),
};

/**
 * Photographic studio: a soft cyclorama, a PMREM environment built from large
 * softboxes (that is what draws the long highlights on the paint), one shadow
 * casting key light, and an optional mirror layer for a polished-stone floor.
 */
export function buildStudio(renderer, scene, quality) {
  scene.background = PALETTE.backdrop.clone();
  // Exponential fog dissolves the floor into the backdrop, so there is no visible horizon.
  scene.fog = new THREE.FogExp2(PALETTE.backdrop.clone(), 0.042);

  // Environment for reflections
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x3c3934);
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: 0x4a463f, side: THREE.BackSide }));
  room.position.y = 7;
  env.add(room);
  const floorEnv = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xa69e90 }));
  floorEnv.rotation.x = -Math.PI / 2;
  env.add(floorEnv);
  const panel = (w, h, intensity, pos, look, warm = 1) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity * 0.985 * warm, intensity * 0.95 * warm), side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(...pos);
    p.lookAt(...look);
    env.add(p);
  };
  panel(14, 5, 7.5, [0, 12, 0], [0, 0, 0]); // overhead scrim
  panel(2.2, 12, 12, [-9, 5, 6], [0, 1, 0]); // long strip, front left
  panel(2.2, 12, 9, [9, 5, -5], [0, 1, 0]); // long strip, rear right
  panel(8, 4, 4.5, [12, 3, 8], [0, 1, 0], 1.02); // broad fill from camera side
  panel(1.2, 14, 10, [6, 6, 11], [0, 1, 0]); // thin strip for a crisp line on the chrome
  panel(6, 3, 2.0, [-12, 2.5, -8], [0, 1, 0]);
  panel(30, 1.2, 1.4, [0, 0.6, -18], [0, 1, 0]); // horizon line
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(env, 0.03).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 1.0;
  pmrem.dispose();

  // Cyclorama: floor sweeping up into the back wall
  const cyc = new THREE.Group();
  const floorGeo = new THREE.PlaneGeometry(120, 120);
  const floorMat = new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.92, metalness: 0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  cyc.add(floor);
  scene.add(cyc);

  // Polished-stone floor: a mirror render, softened and blended into the opaque floor shader.
  // The floor stays opaque so ambient occlusion and contact shadows read where tyres meet it.
  let reflector = null;
  const reflUniforms = {
    tReflect: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    reflStrength: { value: 0 },
  };
  if (quality.reflections) {
    reflector = new Reflector(floorGeo, {
      textureWidth: Math.round(window.innerWidth * 0.5 * quality.dpr),
      textureHeight: Math.round(window.innerHeight * 0.5 * quality.dpr),
      clipBias: 0.003,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.visible = false;
    scene.add(reflector);
    reflUniforms.tReflect.value = reflector.getRenderTarget().texture;
    reflUniforms.textureMatrix.value = reflector.material.uniforms.textureMatrix.value;
    reflUniforms.reflStrength.value = 0.13;
    floorMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, reflUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform mat4 textureMatrix;\nvarying vec4 vReflUv;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vReflUv = textureMatrix * vec4( position, 1.0 );');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform sampler2D tReflect;\nuniform float reflStrength;\nvarying vec4 vReflUv;\nvoid main() {')
        .replace('#include <opaque_fragment>', `
          vec4 rp = vReflUv;
          vec2 o = vec2( 0.0035 ) * rp.w;
          vec3 refl = texture2DProj( tReflect, rp ).rgb * 0.28;
          refl += texture2DProj( tReflect, rp + vec4( o.x, 0.0, 0.0, 0.0 ) ).rgb * 0.18;
          refl += texture2DProj( tReflect, rp - vec4( o.x, 0.0, 0.0, 0.0 ) ).rgb * 0.18;
          refl += texture2DProj( tReflect, rp + vec4( 0.0, o.y * 1.6, 0.0, 0.0 ) ).rgb * 0.18;
          refl += texture2DProj( tReflect, rp - vec4( 0.0, o.y * 1.6, 0.0, 0.0 ) ).rgb * 0.18;
          // Only darker reflected objects show; the bright backdrop does not double up.
          float lum = dot( refl, vec3( 0.299, 0.587, 0.114 ) );
          float amt = reflStrength * smoothstep( 0.9, 0.25, lum ) * 2.2;
          outgoingLight = mix( outgoingLight, refl, clamp( amt, 0.0, 0.35 ) );
          #include <opaque_fragment>`);
    };
  }
  function renderReflection(camera) {
    if (!reflector || !reflector.parent || reflUniforms.reflStrength.value === 0) return;
    floor.visible = false;
    reflector.onBeforeRender(renderer, scene, camera);
    reflector.visible = false;
    floor.visible = true;
  }

  // Lights: hemisphere for gentle bounce, key light for the shadow.
  const hemi = new THREE.HemisphereLight(0xfffaf0, 0xcfc6b6, 0.35);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff6ea, 1.9);
  key.position.set(3, 12, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadow, quality.shadow);
  const sc = key.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 2; sc.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 9;
  key.shadow.blurSamples = 20;
  scene.add(key);
  // Focus light: follows the subject of each beat for a soft highlight
  const focus = new THREE.SpotLight(0xfff1dc, 0, 9, 0.42, 0.85, 1.2);
  focus.position.set(4, 4, 4);
  scene.add(focus, focus.target);
  const rim = new THREE.DirectionalLight(0xfff2e0, 0.0);
  rim.position.set(-6, 5, -6);
  scene.add(rim);

  return {
    floor, reflector, key, focus, rim, hemi, renderReflection,
    disableReflections() { reflUniforms.reflStrength.value = 0; },
    resize(w, h, dpr) {
      if (reflector) reflector.getRenderTarget().setSize(Math.round(w * 0.5 * dpr), Math.round(h * 0.5 * dpr));
    },
  };
}
