// src/render/Renderer.js
// Shadowmatic 풍 3/4 원근 룩: 어둡고 따뜻한 방, 단일 온광, 떠 있는 3D 물체가
// 뒷벽에 부드러운 실그림자를 드리운다. 그림자 상단 윤곽이 "도로".
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Renderer {
  constructor(container) {
    this.scene = new THREE.Scene();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // 거의 검은 따뜻한 그라디언트 배경 → 밝게 채광되는 벽이 도드라지도록.
    this.scene.background = this._makeGradientTexture('#120d0a', '#080606');
    this.scene.fog = new THREE.Fog(0x0a0706, 40, 160);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

    // 자유 궤도 카메라(우드래그=orbit, 휠=zoom). 좌버튼은 물체 조작에 양보(LEFT:null).
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

    // 채움광: 그림자가 순흑이 되지 않게 하되, 너무 밝아 그림자를 씻어내지 않도록 절제.
    this.hemi = new THREE.HemisphereLight(0x3a2c22, 0x0a0807, 0.22);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x3a2a1e, 0.28);
    this.scene.add(this.ambient);

    // 광원(레벨별로 setLight에서 point/directional 구성). 물리적 감쇠(decay=2).
    // 부드러운 페넘브라: 큰 shadow map + PCFSoft radius/blurSamples, acne 방지 bias.
    this.pointLight = new THREE.PointLight(0xfff1da, 1.0, 0, 2);
    this.pointLight.castShadow = true;
    // 점광원은 큐브맵(6면)이라 VRAM 부담이 크다 → 2048 유지하고 부드러움은 radius/blurSamples로.
    this.pointLight.shadow.mapSize.set(2048, 2048);
    this.pointLight.shadow.radius = 9;
    this.pointLight.shadow.blurSamples = 25;
    this.pointLight.shadow.bias = -0.0004;
    this.pointLight.shadow.normalBias = 0.04;
    this.scene.add(this.pointLight);
    this.pointLight.visible = false;

    this.dirLight = new THREE.DirectionalLight(0xfff1da, 1.0);
    this.dirLight.castShadow = true;
    // 평행광은 단일 2D 맵이라 4096이 부담 적고 페넘브라 디테일에 유리.
    this.dirLight.shadow.mapSize.set(4096, 4096);
    this.dirLight.shadow.radius = 9;
    this.dirLight.shadow.blurSamples = 25;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.04;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);
    this.dirLight.visible = false;

    // 림/필 라이트: 키광 반대편에서 아주 약하게 차가운 톤으로 3D 물체 엣지를 살린다.
    // 그림자를 드리우지 않고(키광이 지배), 순흑 측면만 살짝 분리시킨다.
    this.rimLight = new THREE.DirectionalLight(0x6b86c4, 0.32);
    this.rimLight.castShadow = false;
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // 광원 위치를 보여주는 부드러운 따뜻한 글로우 기즈모(점광원일 때만).
    // 코어 구 + 반투명 additive 헤일로 2겹.
    this.lightGizmo = new THREE.Group();
    const giCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff0c8 })
    );
    const giHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    giHalo.renderOrder = 3;
    this.lightGizmo.add(giCore, giHalo);
    this.lightGizmo.visible = false;
    this.scene.add(this.lightGizmo);

    // 그림자가 깃드는 뒷벽(z≈-0.05). 따뜻한 밝은 탄색 → 채광 받아 도드라지는 실표면.
    this.wallMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0xcdb792, roughness: 0.88, metalness: 0.0,
        emissive: 0x140d06, emissiveIntensity: 1.0 })
    );
    this.wallMesh.position.set(0, 0, -0.05);
    this.wallMesh.receiveShadow = true;
    this.scene.add(this.wallMesh);

    // 동적 그룹.
    this.occluderGroup = new THREE.Group();
    this.roadGroup = new THREE.Group();      // 빛나는 도로(floor 윤곽)
    this.ceilingGroup = new THREE.Group();   // 옅은 천장 윤곽(옵션)
    this.padGroup = new THREE.Group();
    this.scene.add(this.occluderGroup, this.roadGroup, this.ceilingGroup, this.padGroup);

    this.car = this._makeCar();
    this.scene.add(this.car);

    window.addEventListener('resize', () => this._onResize());
  }

  // 세로 그라디언트 CanvasTexture (배경용).
  _makeGradientTexture(top, bottom) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // 3/4 각도. 어두운 공간에 떠 있는 채광된 벽 패널을 담되, 프레이밍은 "플레이 띠"에 맞춘다.
  // (벽 전체가 아니라 START→GOAL 도로 띠 + 위쪽 오클루더 헤드룸을 채우도록.)
  // level: { wall, start, goal } 만 있으면 동작(하위호환: wall만 넘겨도 wall 전체로 폴백).
  fitToWall(level) {
    // 하위호환: wall 객체만 들어오면 level 형태로 승격.
    const wall = level.wall || level;
    const start = level.start || (this._frameStart) || [wall.width * 0.1, 0];
    const goal = level.goal || (this._frameGoal) || [wall.width * 0.9, 0];
    this._wall = wall;
    this._frameStart = start;
    this._frameGoal = goal;

    const cx = wall.width / 2, cy = wall.height / 2;
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;

    // 벽 패널: 플레이 영역 + 넉넉한 여백. 어두운 배경에 뜬 한 장의 면.
    const margin = 3.0;
    const wallW = wall.width + margin * 2;
    const wallH = wall.height + margin * 2;
    this.wallMesh.geometry.dispose();
    this.wallMesh.geometry = new THREE.PlaneGeometry(wallW, wallH);
    this.wallMesh.position.set(cx, cy, -0.05);

    // ── 플레이 띠 박스 계산 ──
    // 가로: start.x → goal.x + 좌우 여백. 세로: 가장 낮은 패드 ~ max(startY,goalY)+헤드룸.
    const startY = start[1], goalY = goal[1];
    const sx = start[0], gx = goal[0];
    const xMargin = 2.2;           // 패드/라벨이 잘리지 않게.
    const roadHeadroom = 4.5;      // 도로 위 떠 있는 오클루더/그림자 자리.
    const bottomPad = 1.4;         // 패드 아래 약간.

    const boxLeft = Math.min(sx, gx) - xMargin;
    const boxRight = Math.max(sx, gx) + xMargin;
    const boxBottom = Math.min(startY, goalY) - bottomPad;
    const boxTop = Math.max(startY, goalY) + roadHeadroom;

    const boxW = boxRight - boxLeft;
    const boxH = boxTop - boxBottom;
    const boxCx = (boxLeft + boxRight) / 2;
    const boxCy = (boxBottom + boxTop) / 2;

    // 박스를 약간의 여백과 함께 프레임에 채우는 거리. (가로/세로 중 더 빡빡한 쪽 기준.)
    const fov = (this.camera.fov * Math.PI) / 180;
    const span = Math.max(boxH, boxW / aspect) * 1.12;
    const dist = (span / 2) / Math.tan(fov / 2);

    // 절제된 3/4: 좌측·상단에서 살짝 비스듬히, 거의 정면(키스톤 왜곡 최소). 박스 크기에 비례.
    this.camera.position.set(boxCx - boxW * 0.07, boxCy + boxH * 0.10, dist);
    this.camera.lookAt(boxCx, boxCy, 0);
    this.camera.updateProjectionMatrix();

    // 초기 배치 후 OrbitControls가 카메라를 소유. 피벗 = 플레이 띠 중심.
    this._sceneCenter = [boxCx, boxCy, 0];
    if (this.controls) {
      this.controls.target.set(boxCx, boxCy, 0);
      this.controls.update();
    }
  }

  // orbit 피벗을 선택된 물체 위치로 옮긴다.
  setOrbitTarget(pos) {
    if (!this.controls) return;
    this.controls.target.set(pos[0], pos[1], pos[2]);
    this.controls.update();
  }

  // orbit 피벗을 씬 중심으로 되돌린다.
  resetOrbitTarget() {
    if (!this.controls || !this._sceneCenter) return;
    const c = this._sceneCenter;
    this.controls.target.set(c[0], c[1], c[2]);
    this.controls.update();
  }

  _makeCar() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0x5a1500, roughness: 0.4 })
    );
    body.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xff7a5c, emissive: 0x401000, roughness: 0.4 })
    );
    cabin.position.set(-0.05, 0.32, 0);
    cabin.castShadow = true;
    g.add(body, cabin);
    g.userData.halfHeight = 0.2;
    return g;
  }

  setLight(light) {
    const cx = this._wall ? this._wall.width / 2 : 0;
    const cy = this._wall ? this._wall.height / 2 : 0;
    if (light.type === 'point') {
      this.pointLight.position.set(light.vec[0], light.vec[1], light.vec[2]);
      this.pointLight.shadow.camera.near = 0.5;
      this.pointLight.shadow.camera.far = light.vec[2] * 3 + 20;
      // decay=2 물리감쇠: 벽까지 거리² 보상해 "어둑한 따뜻함"이 되도록 보수적으로.
      const distToWall = Math.max(1, light.vec[2]);
      this.pointLight.intensity = distToWall * distToWall * 1.6;
      this.pointLight.visible = true;
      this.dirLight.visible = false;
      this.lightGizmo.position.copy(this.pointLight.position);
      this.lightGizmo.visible = true;
      // 림광: 키광 반대편(벽 중심 기준)에서 비스듬히 비춘다.
      this.rimLight.position.set(2 * cx - light.vec[0], cy + 3, light.vec[2] * 0.6 + 2);
      this.rimLight.target.position.set(cx, cy, 0);
    } else {
      // directional: vec = 빛이 향하는 방향. 광원은 -vec 방향 멀리에 둔다.
      const d = new THREE.Vector3(light.vec[0], light.vec[1], light.vec[2]).normalize();
      const dist = this._wall ? this._wall.width : 20;
      this.dirLight.position.set(cx - d.x * dist, cy - d.y * dist, Math.max(8, dist) - d.z * dist);
      this.dirLight.target.position.set(cx, cy, 0);
      this.dirLight.intensity = 2.2;
      const half = (this._wall ? Math.max(this._wall.width, this._wall.height) : 12) * 0.8;
      const sc = this.dirLight.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.near = 0.5; sc.far = dist * 3 + 20;
      sc.updateProjectionMatrix();
      this.dirLight.visible = true;
      this.pointLight.visible = false;
      this.lightGizmo.visible = false;
      // 림광: 키광 반대편에서.
      this.rimLight.position.set(cx + d.x * dist, cy + 3, Math.max(8, dist));
      this.rimLight.target.position.set(cx, cy, 0);
    }
  }

  // 오클루더(고정+가동) 실제 3D 메시. castShadow=true.
  renderOccluders(occluders) {
    this.occluderGroup.clear();
    for (const occ of occluders) {
      for (const part of occ.parts) {
        this.occluderGroup.add(this._partMesh(part, occ.role));
      }
    }
  }

  // GO 연출: 물체 "본체"만 투명하게(보이지 않게) 만들되 castShadow는 유지 →
  // 벽에 드리운 그림자는 그대로 남는다. (visible=false로 하면 그림자도 사라지므로 opacity로 처리.)
  // 다음 renderOccluders 호출(레벨 전환/리셋)이 머티리얼을 새로 만들어 다시 보이게 한다.
  setOccluderBodiesVisible(visible) {
    this.occluderGroup.traverse((o) => {
      if (!o.isMesh) return;
      o.material.transparent = !visible;
      o.material.opacity = visible ? 1 : 0;
      o.material.depthWrite = visible;     // 투명일 때 뒤 벽을 가리지 않게
      o.material.needsUpdate = true;
      o.castShadow = true;                 // 그림자는 계속 드리운다
    });
  }

  _partMesh(part, role) {
    let geo;
    if (part.shape === 'prism') {
      geo = new THREE.CylinderGeometry(part.size[0] / 2, part.size[0] / 2, part.size[2], 3);
      geo.rotateX(Math.PI / 2);
    } else {
      geo = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
    }

    const movable = !!part.movable;
    let color, baseEmissive, hoverEmissive;
    if (role === 'ceiling') {
      color = 0x5a78b0; // 천장은 탈채도 블루
      if (movable) { baseEmissive = 0x4a2c00; hoverEmissive = 0xb86a00; }
      else { baseEmissive = 0x10182e; hoverEmissive = 0x10182e; }
    } else if (movable) {
      color = 0xffb24d; baseEmissive = 0x4a2c00; hoverEmissive = 0xb86a00; // 앰버, "grab me"
    } else {
      color = 0x6b7280; baseEmissive = 0x14171c; hoverEmissive = 0x14171c; // 슬레이트, "locked"(순흑 방지)
    }

    const mat = new THREE.MeshStandardMaterial({ color, emissive: baseEmissive, roughness: 0.5, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
    // 전체 회전: 길이-4 배열=쿼터니언, 길이-3 배열=오일러 도, 숫자=z축 도.
    if (Array.isArray(part.rot) && part.rot.length === 4) {
      mesh.quaternion.set(part.rot[0], part.rot[1], part.rot[2], part.rot[3]);
    } else if (Array.isArray(part.rot)) {
      const d = Math.PI / 180;
      mesh.rotation.set(part.rot[0] * d, part.rot[1] * d, part.rot[2] * d);
    } else {
      mesh.rotation.z = ((part.rot || 0) * Math.PI) / 180;
    }
    mesh.userData.part = part;
    mesh.userData.baseEmissive = baseEmissive;
    mesh.userData.hoverEmissive = hoverEmissive;
    return mesh;
  }

  // floor 윤곽을 벽면(z≈0.02)에 빛나는 도로로 그린다. null(void)에서 끊는다.
  renderHeightfield(hf) {
    this.roadGroup.clear();
    this.ceilingGroup.clear();

    // 윤곽선을 따라 위·아래 half만큼 두께를 가진 띠 지오메트리.
    const ribbon = (run, half, zPos) => {
      const pos = [];
      for (let k = 0; k < run.length - 1; k++) {
        const [x0, y0] = run[k];
        const [x1, y1] = run[k + 1];
        pos.push(
          x0, y0 - half, zPos, x0, y0 + half, zPos, x1, y1 + half, zPos,
          x0, y0 - half, zPos, x1, y1 + half, zPos, x1, y1 - half, zPos
        );
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return g;
    };

    // 연속 구간별로 글로우(넓고 옅은 additive) + 코어(밝은 골드) 2겹 도로.
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        const glow = new THREE.Mesh(ribbon(run, 0.22, 0.03),
          new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.28,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.renderOrder = 4;
        const core = new THREE.Mesh(ribbon(run, 0.07, 0.05),
          new THREE.MeshBasicMaterial({ color: 0xffeec2, transparent: true, opacity: 0.98,
            side: THREE.DoubleSide, depthWrite: false }));
        core.renderOrder = 6;
        this.roadGroup.add(glow, core);
      }
      run = [];
    };
    for (let i = 0; i < hf.xs.length; i++) {
      if (hf.floor[i] === null) { flush(); continue; }
      run.push([hf.xs[i], hf.floor[i]]);
    }
    flush();

    // 옅은 천장 윤곽(옵션).
    if (hf.ceiling) {
      let crun = [];
      const cflush = () => {
        if (crun.length >= 2) {
          const pos = [];
          for (let k = 0; k < crun.length - 1; k++) {
            pos.push(crun[k][0], crun[k][1], 0.05, crun[k + 1][0], crun[k + 1][1], 0.05);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
            color: 0x88aaff, transparent: true, opacity: 0.25,
          }));
          this.ceilingGroup.add(line);
        }
        crun = [];
      };
      for (let i = 0; i < hf.xs.length; i++) {
        if (!isFinite(hf.ceiling[i])) { cflush(); continue; }
        crun.push([hf.xs[i], hf.ceiling[i]]);
      }
      cflush();
    }
  }

  // 떠 있는 텍스트 라벨(CanvasTexture Sprite).
  _makeLabel(text, hexColor) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, 128, 48);
    ctx.fillStyle = hexColor;
    ctx.fillText(text, 128, 48);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(1.8, 0.68, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // start: 작은 출발 패드. goal: 반투명 골드 목표 "영역"(반폭 hw, 반높이 hh).
  renderPads(start, goal, hw = 0.6, hh = 0.8) {
    this.padGroup.clear();

    // START — 작은 초록 패드 + 라벨
    {
      const [px, py] = start;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.22, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x33cc66, emissive: 0x0d4d22, emissiveIntensity: 1.4, roughness: 0.4 }));
      m.position.set(px, py - 0.11, 0.2);
      m.castShadow = true;
      this.padGroup.add(m);
      const lbl = this._makeLabel('START', '#8effb8');
      lbl.position.set(px, py + 0.9, 0.5);
      this.padGroup.add(lbl);
    }

    // GOAL — 벽면(z≈0.04)에 (2*hw)×(2*hh) 반투명 골드 존 + 밝은 윤곽선
    {
      const [gx, gy] = goal;
      const w = 2 * hw, h = 2 * hh;
      const zone = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.22,
          side: THREE.DoubleSide, depthWrite: false }));
      zone.position.set(gx, gy, 0.04);
      zone.renderOrder = 5;
      this.padGroup.add(zone);

      // 밝은 골드 윤곽선(가장자리)으로 영역 경계를 또렷하게.
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
        new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 }));
      edges.position.set(gx, gy, 0.05);
      edges.renderOrder = 7;
      this.padGroup.add(edges);

      const lbl = this._makeLabel('GOAL', '#ffe08a');
      lbl.position.set(gx, gy + hh + 0.6, 0.5);
      this.padGroup.add(lbl);
    }
  }

  setCar(x, y) {
    const hh = this.car.userData.halfHeight || 0.2;
    this.car.position.set(x, y + hh, 0.3);
    this.car.visible = true;
  }

  render() { this.renderer.render(this.scene, this.camera); }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this._wall) this.fitToWall({ wall: this._wall, start: this._frameStart, goal: this._frameGoal });
  }
}
