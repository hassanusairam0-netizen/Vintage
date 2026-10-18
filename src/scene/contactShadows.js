import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

/**
 * Soft contact shadows, the way a studio photograph grounds a car: an orthographic
 * depth pass looking up from the floor, blurred twice and laid back on the floor.
 * Parts lifted higher cast fainter, wider shadows, which keeps the exploded view grounded.
 */
export function createContactShadows(renderer, scene, { size = 16, res = 512, far = 2.4, blur = 2.8, opacity = 1, x = 0, hide = [] } = {}) {
  const rt = new THREE.WebGLRenderTarget(res, res);
  const rtBlur = new THREE.WebGLRenderTarget(res, res);
  rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;

  const group = new THREE.Group();
  group.position.set(x, 0.003, 0);
  group.rotation.x = Math.PI / 2;

  const planeGeo = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
  const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
    map: rt.texture, transparent: true, opacity, depthWrite: false, fog: false,
  }));
  plane.scale.y = -1;
  plane.rotation.x = -Math.PI / 2;
  plane.renderOrder = 1;
  group.add(plane);

  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
  group.add(cam);
  scene.add(group);

  const depthMat = new THREE.MeshDepthMaterial();
  // Nearest surface to the floor wins, so the underside of the car sets the darkness.
  depthMat.depthTest = depthMat.depthWrite = true;
  depthMat.side = THREE.DoubleSide;
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.ucolor = { value: new THREE.Color(0x1d1a16) };
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {');
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'vec4( ucolor, min( 1.0, 1.25 * pow( 1.0 - fragCoordZ, 0.9 ) ) );',
    );
  };

  const blurPlane = new THREE.Mesh(planeGeo);
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;
  // The blur quad sits inside the shadow camera's frustum, facing it (it is not part of the scene).
  blurPlane.position.set(x, 0.003 + far / 2, 0);
  blurPlane.updateMatrixWorld();

  function blurPass(amount) {
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = rt.texture;
    hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtBlur);
    renderer.render(blurPlane, cam);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = rtBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(rt);
    renderer.render(blurPlane, cam);
  }

  function update() {
    const bg = scene.background, fog = scene.fog, override = scene.overrideMaterial;
    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const states = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    group.visible = false;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = depthMat;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    group.visible = true;
    plane.visible = false;
    renderer.render(scene, cam);
    scene.overrideMaterial = override;
    blurPass(blur);
    blurPass(blur * 0.6);
    blurPass(blur * 0.3);
    plane.visible = true;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    scene.background = bg;
    scene.fog = fog;
    hide.forEach((o, i) => { o.visible = states[i]; });
  }

  return { update, group, rt, plane };
}
