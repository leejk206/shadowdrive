// src/ui/InteractionController.js
// PLAN 단계에서 가동 오클루더를 3D 조작:
//  - hover: grab 커서 + emissive 부스트
//  - 좌드래그: 트랙볼 회전(전체 3D) → 오일러[rx,ry,rz] 도로 통지
//  - shift+좌드래그: 화면 평면(물체 깊이)에서 이동
//  - 휠: 깊이(z) 조절
// 변환은 onChange(index, {pos, rot}) 콜백으로 상태머신에 통지.
import * as THREE from 'three';

export class InteractionController {
  constructor(renderer, getPhase, onChange) {
    this.renderer = renderer;
    this.getPhase = getPhase;
    this.onChange = onChange;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.drag = null;       // { mesh, index, mode:'rotate'|'translate', lastX, lastY, planeZ }
    this.hovered = null;
    this.turn = new Map();  // index -> { yaw, pitch } 턴테이블 누적각(롤 없음)
    this.dom = renderer.renderer.domElement;
    const dom = this.dom;
    dom.addEventListener('pointerdown', (e) => this._down(e));
    // 우버튼(궤도) 시작 시에만 마지막으로 잡았던 물체를 피벗으로 — 평소엔 카메라를 건드리지 않는다.
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 2 && this.lastPicked) {
        const p = this.lastPicked.position;
        this.renderer.setOrbitTarget([p.x, p.y, p.z]);
      }
    });
    dom.addEventListener('pointermove', (e) => this._move(e));
    dom.addEventListener('pointerup', () => this._up());
    dom.addEventListener('pointerleave', () => this._up());
    dom.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    window.addEventListener('contextmenu', (e) => { if (this.drag) e.preventDefault(); });
    // shift를 누르는 동안 OrbitControls 줌을 끈다 → shift+휠은 물체 깊이만, 카메라 줌과 충돌 방지.
    // (OrbitControls의 wheel 리스너가 먼저 등록되어 먼저 발화하므로 stopPropagation으로는 막을 수 없다.)
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.renderer.controls.enableZoom = false; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.renderer.controls.enableZoom = true; });
    window.addEventListener('blur', () => { this.renderer.controls.enableZoom = true; });
  }

  // 레벨 전환 시 호출(현재 아크볼 방식은 드래그마다 시작 상태를 새로 잡으므로 별도 상태 불필요).
  resetTurn() { this.turn.clear(); }

  // 화면 좌표(px)를 물체 중심의 가상 구 위 벡터(아이 공간)로 매핑. 구 밖이면 적도(z=0)로 투영.
  _ballVec(px, py, d) {
    let x = (px - d.cx) / d.R;
    let y = -(py - d.cy) / d.R;
    const r2 = x * x + y * y;
    let z;
    if (r2 <= 1) { z = Math.sqrt(1 - r2); }
    else { const r = Math.sqrt(r2); x /= r; y /= r; z = 0; }
    return new THREE.Vector3(x, y, z);
  }

  _ndc(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  _pickMovable() {
    this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
    const hits = this.raycaster.intersectObjects(this.renderer.occluderGroup.children, false);
    for (const h of hits) {
      const part = h.object.userData.part;
      if (part && part.movable) return h.object;
    }
    return null;
  }

  _clearHover() {
    if (this.hovered) {
      this.hovered.material.emissive.setHex(this.hovered.userData.baseEmissive);
      this.hovered = null;
    }
  }

  _hover(e) {
    if (this.drag || this.getPhase() !== 'PLAN') return;
    this._ndc(e);
    const mesh = this._pickMovable();
    if (mesh !== this.hovered) {
      this._clearHover();
      if (mesh) {
        this.hovered = mesh;
        mesh.material.emissive.setHex(mesh.userData.hoverEmissive);
      }
    }
    this.dom.style.cursor = mesh ? 'grab' : 'default';
    this.renderer.render();
  }

  _down(e) {
    // 좌버튼만 물체 조작; 우/중버튼은 OrbitControls(궤도/줌)로 흘려보낸다.
    if (e.button !== 0) return;
    if (this.getPhase() !== 'PLAN') return;
    this._ndc(e);
    const mesh = this._pickMovable();
    if (!mesh) return;
    // 잡는 순간 카메라를 움직이지 않는다(뷰가 튀면 아크볼 그랩이 어긋나고 거슬림).
    // 우드래그 궤도 회전 시 이 물체를 피벗으로 쓰도록 기억만 해둔다.
    this.lastPicked = mesh;
    this.drag = {
      mesh,
      index: mesh.userData.part.index,
      mode: e.shiftKey ? 'translate' : 'rotate',
      lastX: e.clientX,
      lastY: e.clientY,
      planeZ: mesh.position.z,
    };
    // hover emissive 유지(드래그 중 강조).
    if (this.hovered !== mesh) { this._clearHover(); mesh.material.emissive.setHex(mesh.userData.hoverEmissive); this.hovered = mesh; }
    this.dom.style.cursor = 'grabbing';
  }

  _up() {
    if (this.drag) {
      this.drag = null;
      this.dom.style.cursor = this.hovered ? 'grab' : 'default';
    }
  }

  _notify(mesh, index) {
    // 회전은 메시 quaternion을 그대로 상태로 통지(쿼터니언이 단일 진실원).
    const q = mesh.quaternion;
    const clamped = this.onChange(index, {
      pos: [mesh.position.x, mesh.position.y, mesh.position.z],
      rot: [q.x, q.y, q.z, q.w],
    });
    // pos는 클램프 결과만 메시에 반영(물리=시각 일치). 회전은 readback하지 않는다.
    if (clamped && clamped.pos) {
      mesh.position.set(clamped.pos[0], clamped.pos[1], clamped.pos[2]);
    }
  }

  _move(e) {
    if (!this.drag || this.getPhase() !== 'PLAN') { this._hover(e); return; }
    const d = this.drag;
    const mesh = d.mesh;

    if (d.mode === 'rotate') {
      // 아크볼(arcball) 회전: 물체 위에 가상의 구를 두고, 잡은 점이 마우스를 따라오도록 회전.
      //  - 물체 오른쪽을 잡고 위로 올리면 → 시선축 회전(화면에서 2D 돌리듯).
      //  - 어떤 카메라 각도에서도 "보이는 대로" 직관적(시점 상대). 절대 매핑이라 되감으면 원위치(드리프트 없음).
      if (!d.q0) {
        d.q0 = mesh.quaternion.clone();
        const cam = this.renderer.camera;
        cam.updateMatrixWorld();
        mesh.updateWorldMatrix(true, false);
        // 가상 구를 물체 위치/크기에 맞춤 → 물체 가장자리를 잡으면 구의 적도(=시선축 2D 회전),
        // 중심을 잡으면 텀블. 중심은 메시 월드 위치, 반경은 지오메트리 bounding sphere에서 견고하게 계산.
        const center = mesh.getWorldPosition(new THREE.Vector3());
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        const sc = Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z) || 1;
        const radiusWorld = mesh.geometry.boundingSphere.radius * sc;
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        const c = center.clone().project(cam);
        const edge = center.clone().addScaledVector(right, radiusWorld).project(cam);
        d.cx = (c.x * 0.5 + 0.5) * window.innerWidth;
        d.cy = (-c.y * 0.5 + 0.5) * window.innerHeight;
        const ex = (edge.x * 0.5 + 0.5) * window.innerWidth;
        const ey = (-edge.y * 0.5 + 0.5) * window.innerHeight;
        d.R = Math.max(40, Math.hypot(ex - d.cx, ey - d.cy)); // 물체 화면 반경(px), 최소 40px
        d.v0 = this._ballVec(e.clientX, e.clientY, d);
      }
      const v1 = this._ballVec(e.clientX, e.clientY, d);
      const axis = new THREE.Vector3().crossVectors(d.v0, v1); // 아이(eye) 공간 회전축
      const len = axis.length();
      if (len > 1e-6) {
        const angle = Math.atan2(len, d.v0.dot(v1));
        axis.normalize().applyQuaternion(this.renderer.camera.quaternion); // eye→world
        const qDelta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        mesh.quaternion.copy(qDelta).multiply(d.q0).normalize();
        this._notify(mesh, d.index);
      }
    } else {
      // translate: 물체 깊이에 평행한 벽-평면(z=planeZ)에서 레이 교차점으로 이동.
      this._ndc(e);
      this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -d.planeZ);
      const pt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, pt)) {
        mesh.position.x = pt.x; mesh.position.y = pt.y;
        this._notify(mesh, d.index);
      }
    }
    this.renderer.render();
  }

  _wheel(e) {
    // shift+휠만 물체 깊이 조절. 일반 휠은 OrbitControls 줌으로 흘려보낸다(preventDefault 금지).
    if (!e.shiftKey) return;
    if (this.getPhase() !== 'PLAN') return;
    // 드래그 중이 아니어도 hover된 메시에 적용 가능.
    const mesh = this.drag ? this.drag.mesh : this.hovered;
    const index = this.drag ? this.drag.index : (this.hovered ? this.hovered.userData.part.index : -1);
    if (!mesh || index < 0) return;
    e.preventDefault();
    e.stopPropagation();
    mesh.position.z += (e.deltaY < 0 ? 0.3 : -0.3);
    if (this.drag) this.drag.planeZ = mesh.position.z;
    this._notify(mesh, index);
    this.renderer.render();
  }
}
