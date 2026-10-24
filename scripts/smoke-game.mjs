#!/usr/bin/env node
/**
 * 基础回归：用 Playwright 开预览页，喂假输入，断言移动方向 / 攻击朝向 / 翻滚不入地。
 * 用法：先起 `npm run preview:public`，再 `node scripts/smoke-game.mjs`
 * 或：`npm run test:smoke`（会自己起 preview）
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4173/';
const FAIL = [];

function assert(cond, msg) {
  if (!cond) FAIL.push(msg);
  else console.log('  ok:', msg);
}

async function waitGame(page) {
  await page.waitForFunction(() => window.__GAME__?.ready && window.__GAME__?.player, null, {
    timeout: 60000,
  });
}

async function main() {
  console.log('smoke →', BASE);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => FAIL.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitGame(page);
  // 点画布拿焦点
  await page.locator('canvas').click({ position: { x: 640, y: 360 } });
  await page.waitForTimeout(200);

  // --- 1) 仅 W：应沿相机前方有明显位移 ---
  await page.locator('canvas').click({ position: { x: 640, y: 360 } });
  const before = await page.evaluate(() => ({ ...window.__GAME__.player, yaw: window.__GAME__.camera.yaw }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(50);
  const afterW = await page.evaluate(() => ({ ...window.__GAME__.player, yaw: window.__GAME__.camera.yaw }));
  {
    const dx = afterW.x - before.x;
    const dz = afterW.z - before.z;
    const moved = Math.hypot(dx, dz);
    const basis = await page.evaluate(() => window.__GAME__.camera);
    const forwardAmt = dx * basis.forward.x + dz * basis.forward.z;
    assert(moved > 0.3, `W 应产生位移 (got ${moved.toFixed(3)})`);
    assert(forwardAmt > 0.25, `W 应主要向前 (fwd=${forwardAmt.toFixed(3)}, moved=${moved.toFixed(3)})`);
  }

  // 屏幕轴不读游戏的 right（那套曾经写反还自测通过）。
  // 视线 = 玩家脚下 - 相机；屏幕右 = 视线在俯视下顺时针 90°。
  async function screenAxes() {
    return page.evaluate(() => {
      const p = window.__GAME__.player;
      const c = window.__GAME__.camera;
      let lx = p.x - c.px;
      let lz = p.z - c.pz;
      const len = Math.hypot(lx, lz) || 1;
      lx /= len;
      lz /= len;
      return { fX: lx, fZ: lz, rX: lz, rZ: -lx };
    });
  }

  await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);

  const a0 = await page.evaluate(() => ({ x: window.__GAME__.player.x, z: window.__GAME__.player.z }));
  const ax = await screenAxes();
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyA');
  const a1 = await page.evaluate(() => ({ x: window.__GAME__.player.x, z: window.__GAME__.player.z }));
  {
    const dx = a1.x - a0.x;
    const dz = a1.z - a0.z;
    const rightAmt = dx * ax.rX + dz * ax.rZ;
    assert(Math.hypot(dx, dz) > 0.25, `A 应有位移 (got ${Math.hypot(dx, dz).toFixed(3)})`);
    assert(rightAmt < -0.2, `A 必须往屏幕左 (right=${rightAmt.toFixed(3)})`);
  }

  const d0 = await page.evaluate(() => ({ x: window.__GAME__.player.x, z: window.__GAME__.player.z }));
  const dxs = await screenAxes();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  const d1 = await page.evaluate(() => ({ x: window.__GAME__.player.x, z: window.__GAME__.player.z }));
  {
    const dx = d1.x - d0.x;
    const dz = d1.z - d0.z;
    const rightAmt = dx * dxs.rX + dz * dxs.rZ;
    assert(Math.hypot(dx, dz) > 0.25, `D 应有位移 (got ${Math.hypot(dx, dz).toFixed(3)})`);
    assert(rightAmt > 0.2, `D 必须往屏幕右 (right=${rightAmt.toFixed(3)})`);
  }

  // --- 3) 攻击朝向 = 面朝（允许极小数值误差）---
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(50);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => !window.__GAME__.player.isAttacking && !window.__GAME__.player.isRolling, null, { timeout: 3000 }).catch(() => {});
  const preAtk = await page.evaluate(() => ({ ...window.__GAME__.player }));
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(60);
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(80);
  const midAtk = await page.evaluate(() => ({ ...window.__GAME__.player }));
  assert(midAtk.isAttacking === true, 'J 应进入攻击');
  let dFacing = Math.atan2(Math.sin(midAtk.facing - preAtk.facing), Math.cos(midAtk.facing - preAtk.facing));
  assert(Math.abs(dFacing) < 0.2, `攻击不应扭向侧面 (Δfacing=${dFacing.toFixed(3)})`);

  // 等攻击结束再测翻滚（攻击中禁止滚）
  for (let i = 0; i < 40; i++) {
    const atk = await page.evaluate(() => window.__GAME__.player.isAttacking);
    if (!atk) break;
    await page.waitForTimeout(100);
  }
  assert(!(await page.evaluate(() => window.__GAME__.player.isAttacking)), '攻击应在 ~1s 内结束');
  await page.waitForTimeout(150);

  // --- 4) 翻滚：必须进入 isRolling，且 y 不低于翻滚前过多 ---
  const y0 = await page.evaluate(() => window.__GAME__.player.y);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(120);
  await page.keyboard.down('KeyK');
  await page.waitForTimeout(80);
  await page.keyboard.up('KeyK');
  let sawRoll = false;
  let minY = y0;
  let maxY = y0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(40);
    const st = await page.evaluate(() => ({ ...window.__GAME__.player }));
    if (st.isRolling) sawRoll = true;
    if (st.y < minY) minY = st.y;
    if (st.y > maxY) maxY = st.y;
  }
  await page.keyboard.up('KeyW');
  assert(sawRoll, '按下 K 后应进入翻滚状态');
  assert(minY > y0 - 0.25, `翻滚不应明显入地 (y0=${y0.toFixed(2)} minY=${minY.toFixed(2)})`);
  assert(maxY >= y0 + 0.2, `翻滚应 hop 离地 (maxY=${maxY.toFixed(2)})`);
  await page.waitForFunction(() => !window.__GAME__.player.isRolling, null, { timeout: 2000 });
  assert(true, '翻滚应在结束后退出');

  await browser.close();

  if (FAIL.length) {
    console.error('\nFAILED:');
    for (const f of FAIL) console.error(' -', f);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
