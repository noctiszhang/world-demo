import * as THREE from 'three';

export interface EnemyConfig {
  x: number;
  z: number;
  heightAt: (x: number, z: number) => number;
}

// 简单低模怪物（哥布林/史莱姆风）：带血条
export class Enemy {
  group: THREE.Group;
  health = 100;
  maxHealth = 100;
  alive = true;
  private bar: THREE.Sprite;
  private barMat: THREE.SpriteMaterial;
  private bob = Math.random() * Math.PI * 2;
  hitFlash = 0;

  constructor(cfg: EnemyConfig) {
    const y = cfg.heightAt(cfg.x, cfg.z);
    this.group = new THREE.Group();
    this.group.position.set(cfg.x, y, cfg.z);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x6b3fa0, roughness: 0.5, flatShading: true, emissive: 0x000000
    });
    // 身体（压扁球体）
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), bodyMat);
    body.scale.set(1, 0.85, 1);
    body.position.y = 0.55;
    body.castShadow = true;
    body.name = 'enemyBody';
    this.group.add(body);
    // 角
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, flatShading: true });
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 8), hornMat);
      horn.position.set(sx * 0.22, 1.05, 0);
      horn.rotation.z = sx * 0.3;
      this.group.add(horn);
    }
    // 眼睛（发光）
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3333 });
    eyeMat.emissive.setHex(0xff2222);
    eyeMat.emissiveIntensity = 4;
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
      e.position.set(sx * 0.2, 0.65, -0.5);
      this.group.add(e);
    }

    // 血条（Sprite + 动态缩放）
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 16;
    const tex = new THREE.CanvasTexture(canvas);
    this.barMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    this.bar = new THREE.Sprite(this.barMat);
    this.bar.scale.set(1.3, 0.18, 1);
    this.bar.position.y = 1.6;
    this.group.add(this.bar);
    this.drawBar();
  }

  private drawBar() {
    const canvas = this.barMat.map!.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 3, canvas.width, 10);
    const ratio = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = ratio > 0.4 ? '#4be06b' : '#e04b4b';
    ctx.fillRect(2, 5, (canvas.width - 4) * ratio, 6);
    this.barMat.map!.needsUpdate = true;
  }

  takeHit(damage: number) {
    if (!this.alive) return;
    this.health -= damage;
    this.hitFlash = 1;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
    this.drawBar();
  }

  private die() {
    this.alive = false;
    this.bar.visible = false;
    // 倒地：旋转 + 下沉，简单处理
    this.group.rotation.z = Math.PI / 2;
  }

  update(dt: number, time: number) {
    if (!this.alive) {
      // 缓慢下沉
      this.group.position.y = Math.max(-0.9, this.group.position.y - dt * 0.6);
      return;
    }
    this.bob += dt * 3;
    const body = this.group.getObjectByName('enemyBody') as THREE.Mesh;
    if (body) {
      body.position.y = 0.55 + Math.sin(this.bob) * 0.06;
      // 受击闪红
      if (this.hitFlash > 0) {
        this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
        const mat = body.material as THREE.MeshStandardMaterial
        mat.emissive.setRGB(this.hitFlash * 0.8, 0, 0);
      }
    }
  }
}
