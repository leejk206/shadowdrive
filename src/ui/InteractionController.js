// src/ui/InteractionController.js
// PLAN 단계에서 가동 오클루더를 3D 조작:
//  - hover: grab 커서 + emissive 부스트
//  - 좌드래그: 화면 평면(z축) 회전 → deg(number) 도로 통지
//  - shift+좌드래그: 화면 평면(물체 깊이)에서 이동
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
    this.turn = new Map();  // index -> { deg } z축 누적 회전각(도)
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

  // 드래그 시작 시점의 메시 z축 회전(rad)을 deg로 — turn Map에 누적 기준값이 없을 때만 사용.
  _initialRotDeg(idx) {
    const mesh = this.drag ? this.drag.mesh : null;
    return mesh ? (mesh.rotation.z * 180) / Math.PI : 0;
  }

  _notify(mesh, index) {
    // iteration-2: 회전은 z축 deg(number) 단일 진실원. translate 통지에서도 현재 z 회전을
    // 숫자로 함께 보내 회전 상태가 유실되지 않게 한다(_occluders는 number rot만 적용).
    const clamped = this.onChange(index, {
      pos: [mesh.position.x, mesh.position.y, mesh.position.z],
      rot: (mesh.rotation.z * 180) / Math.PI,
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
      // iteration-2: z축(화면 평면) 1자유도 회전만 허용 — compound(L/T/notch) part posRel은
      // z축 회전만 합성하므로 yaw/pitch가 들어오면 실루엣이 깨진다.
      // 마우스 x 이동(px) 누적 → z축 회전(deg). 감도 0.6 deg/px, 우측 드래그 = +z(반시계).
      const dxPx = e.clientX - d.lastX;
      d.lastX = e.clientX;
      const idx = d.index;
      const cur = this.turn.get(idx) || { deg: this._initialRotDeg(idx) };
      cur.deg = (cur.deg + dxPx * 0.6) % 360;
      this.turn.set(idx, cur);
      // 메시 즉시 시각 반영 (Euler z → quaternion 동기화됨)
      mesh.rotation.set(0, 0, (cur.deg * Math.PI) / 180);
      this.onChange(idx, {
        pos: [mesh.position.x, mesh.position.y, mesh.position.z],
        rot: cur.deg,    // ★ 숫자(deg)만 통지 — 배열/쿼터니언 미통지
      });
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
    // iteration-2: depth 시스템 제거. 휠은 항상 OrbitControls(카메라 줌)에만 흘려보낸다.
    // shift+휠 분기는 폐기.
    return;
  }
}
