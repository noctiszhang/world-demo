import * as THREE from 'three';

export interface WorldData {
  groundHeight: (x: number, z: number) => number;
  colliders: { x: number; z: number; r: number }[];
}

// 简单确定性噪声（多正弦叠加，无需外部噪声库）
function makeHeightFn() {
  const heightAt = (x: number, z: number) => {
    // 中央出生区域压平
    const d = Math.hypot(x, z - 4);
    const flat = THREE.MathUtils.smoothstep(d, 6, 20); // 0 内 -> 1 外
    let h =
      Math.sin(x * 0.045) * 0.9 +
      Math.cos(z * 0.05) * 0.8 +
      Math.sin((x + z) * 0.08) * 0.4 +
      Math.cos(x * 0.13) * Math.sin(z * 0.11) * 0.6;
    h *= flat;
    // 出生点强制 0
    if (d < 7) h = 0;
    return h;
  };
  return heightAt;
}

export function buildWorld(scene: THREE.Scene): WorldData {
  const heightAt = makeHeightFn();
  const colliders: { x: number; z: number; r: number }[] = [];

  // ---------- 天空 ----------
  scene.background = new THREE.Color(0x8fc3ec);
  scene.fog = new THREE.Fog(0x9fc8ec, 60, 200);

  // ---------- 光照 ----------
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a6b3f, 0.9));

  // ---------- 地形 ----------
  const SIZE = 240;
  const SEG = 180;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const grass = new THREE.Color(0x5f9e4b);
  const grassDark = new THREE.Color(0x3f7a38);
  const sand = new THREE.Color(0xc9b88a);
  const rock = new THREE.Color(0x8a8578);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    // 按高度/坡度上色
    if (h < -0.4) {
      tmp.copy(sand);
    } else if (h > 2.2) {
      tmp.copy(rock);
    } else {
      tmp.copy(grass).lerp(grassDark, THREE.MathUtils.clamp((h + 0.5) / 2.5, 0, 1));
    }
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- 树 ----------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4a2f, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b32, roughness: 0.8, flatShading: true });

  function makeTree(x: number, z: number, s: number) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18*s, 0.26*s, 1.6*s, 8), trunkMat);
    trunk.position.y = 0.8*s;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((1.3 - i*0.3)*s, 1.5*s, 8), leafMat);
      cone.position.y = (1.7 + i*0.85)*s;
      cone.castShadow = true;
      g.add(cone);
    }
    scene.add(g);
    colliders.push({ x, z, r: 0.5*s });
  }

  // ---------- 石头 ----------
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9588, roughness: 1, flatShading: true });
  function makeRock(x: number, z: number, s: number) {
    const y = heightAt(x, z);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    m.position.set(x, y + s*0.4, z);
    m.rotation.set(Math.random(), Math.random(), Math.random());
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push({ x, z, r: s*0.8 });
  }

  // ---------- 简单小屋 ----------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9e4a3a, roughness: 0.8, flatShading: true });
  function makeHouse(x: number, z: number) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4), wallMat);
    body.position.y = 1.3;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.2, 4), roofMat);
    roof.position.y = 3.7;
    roof.rotation.y = Math.PI/4;
    roof.castShadow = true;
    g.add(roof);
    scene.add(g);
    colliders.push({ x, z, r: 2.8 });
  }

  // 确定性摆放（固定种子）
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  let trees = 0;
  while (trees < 90) {
    const x = (rand() - 0.5) * 220;
    const z = (rand() - 0.5) * 220;
    if (Math.hypot(x, z - 4) < 12) continue;
    makeTree(x, z, 0.8 + rand()*0.7);
    trees++;
  }
  for (let i = 0; i < 35; i++) {
    const x = (rand() - 0.5) * 220;
    const z = (rand() - 0.5) * 220;
    if (Math.hypot(x, z - 4) < 10) continue;
    makeRock(x, z, 0.5 + rand()*1.1);
  }
  makeHouse(10, -6);
  makeHouse(-14, -14);

  // ---------- 远景云朵 ----------
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const cx = (rand() - 0.5) * 230;
    const cz = (rand() - 0.5) * 230;
    g.position.set(cx, 28 + rand()*10, cz);
    for (let j = 0; j < 3; j++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(2 + rand()*2, 8, 8), cloudMat);
      c.position.set(j*3 - 3, rand(), 0);
      g.add(c);
    }
    scene.add(g);
  }

  return { groundHeight: heightAt, colliders };
}
