// ─── Constants ───────────────────────────────────────────────────────────────
const FIELD_W = 30, FIELD_D = 60;
const PLAYER_SPEED = 12, DEF_SPEED_BASE = 5;
const TACKLE_DIST = 1.4;
const MAX_LIVES = 3;

// ─── Scene Setup ─────────────────────────────────────────────────────────────
const mount = document.getElementById('mount');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1020);
scene.fog = new THREE.Fog(0x0d1020, 60, 120);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(mount.clientWidth, mount.clientHeight);
renderer.shadowMap.enabled = true;
mount.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 200);
camera.position.set(0, 6, 8);

// ─── Lights ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// ─── Field ───────────────────────────────────────────────────────────────────
const field = new THREE.Mesh(
  new THREE.PlaneGeometry(FIELD_W, FIELD_D),
  new THREE.MeshLambertMaterial({ color: 0x2d8a2d })
);
field.rotation.x = -Math.PI / 2;
field.receiveShadow = true;
scene.add(field);

// Field markings
function addLine(w, d, x, z, color) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.01, z);
  scene.add(m);
}
addLine(FIELD_W, 0.3, 0, -FIELD_D / 2 + 2, 0xffffff);   // try line
addLine(FIELD_W, 0.3, 0,  FIELD_D / 2 - 2, 0xffff00);   // start line
addLine(0.3, FIELD_D, -FIELD_W / 2, 0, 0xffffff);         // left sideline
addLine(0.3, FIELD_D,  FIELD_W / 2, 0, 0xffffff);         // right sideline

// Goalposts
const postMat = new THREE.MeshLambertMaterial({ color: 0xffff00 });
[[-2.7, -FIELD_D / 2 + 2], [2.7, -FIELD_D / 2 + 2]].forEach(([x, z]) => {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6), postMat);
  post.position.set(x, 3, z);
  scene.add(post);
});
const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4), postMat);
crossbar.rotation.z = Math.PI / 2;
crossbar.position.set(0, 6, -FIELD_D / 2 + 2);
scene.add(crossbar);

// ─── MCG Stadium ─────────────────────────────────────────────────────────────
const concreteMat = new THREE.MeshLambertMaterial({ color: 0xc8c8c0 });
const structureMat = new THREE.MeshLambertMaterial({ color: 0xa0a098 });
const roofMatStand = new THREE.MeshLambertMaterial({ color: 0xd0d0c8, transparent: true, opacity: 0.9 });
const seatRed = new THREE.MeshLambertMaterial({ color: 0xcc1a1a });
const seatDark = new THREE.MeshLambertMaterial({ color: 0x8b1111 });

function buildStand(width, x, z, ry) {
  const tiers = 5;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (let t = 0; t < tiers; t++) {
    const h = 3 + t * 0.5;
    const depth = 3.5;
    const risePerTier = 4.5;
    const stepBack = 3;
    const localZ = -(depth / 2 + stepBack * t);
    const localY = risePerTier * t + h / 2;

    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(width, h, depth),
      t % 2 === 0 ? concreteMat : structureMat
    );
    riser.position.set(x + sin * localZ, localY, z + cos * localZ);
    riser.rotation.y = ry;
    riser.castShadow = true;
    scene.add(riser);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.5, 0.35, depth - 0.3),
      t % 2 === 0 ? seatRed : seatDark
    );
    seat.position.set(x + sin * localZ, risePerTier * t + h + 0.18, z + cos * localZ);
    seat.rotation.y = ry;
    scene.add(seat);
  }

  const roofW = width + 4;
  const roofDepth = tiers * 3.5 + 4;
  const roofLocalZ = -(roofDepth / 2 - 2);
  const roofY = tiers * 4.5 + 5;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.7, roofDepth), roofMatStand);
  roof.position.set(x + sin * roofLocalZ, roofY, z + cos * roofLocalZ);
  roof.rotation.y = ry;
  scene.add(roof);

  const colMat = new THREE.MeshLambertMaterial({ color: 0x888880 });
  for (let c = -1; c <= 1; c++) {
    const colLocalZ = -(roofDepth - 2);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, roofY), colMat);
    col.position.set(
      x + sin * colLocalZ + cos * (c * width * 0.35),
      roofY / 2,
      z + cos * colLocalZ + sin * (c * width * 0.35)
    );
    scene.add(col);
  }
}

buildStand(FIELD_W + 14, 0, -FIELD_D / 2 - 2, 0);
buildStand(FIELD_W + 14, 0,  FIELD_D / 2 + 2, Math.PI);
buildStand(FIELD_D + 14, -FIELD_W / 2 - 2, 0, Math.PI / 2);
buildStand(FIELD_D + 14,  FIELD_W / 2 + 2, 0, -Math.PI / 2);

// Floodlight towers
const poleMat = new THREE.MeshLambertMaterial({ color: 0xd0d0c0 });
const clusterMat = new THREE.MeshLambertMaterial({ color: 0xeeeecc, emissive: 0xffffaa, emissiveIntensity: 0.4 });
[
  [-FIELD_W / 2 - 10,  FIELD_D / 2 + 10],
  [ FIELD_W / 2 + 10,  FIELD_D / 2 + 10],
  [-FIELD_W / 2 - 10, -FIELD_D / 2 - 10],
  [ FIELD_W / 2 + 10, -FIELD_D / 2 - 10],
].forEach(([tx, tz]) => {
  const poleH = 45;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, poleH), poleMat);
  pole.position.set(tx, poleH / 2, tz);
  scene.add(pole);

  for (let lx = -2; lx <= 2; lx++) {
    for (let lz = -1; lz <= 1; lz++) {
      const fix = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.8), clusterMat);
      fix.position.set(tx + lx * 1.4, poleH + 0.2, tz + lz * 1.0);
      scene.add(fix);
    }
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 0.4), poleMat);
  arm.position.set(tx, poleH, tz);
  scene.add(arm);

  const ptLight = new THREE.PointLight(0xfff8ee, 1.0, 100);
  ptLight.position.set(tx, poleH, tz);
  scene.add(ptLight);
});

// ─── Player ──────────────────────────────────────────────────────────────────
const playerGroup = new THREE.Group();
const bodyMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.4, 1.2),
  new THREE.MeshLambertMaterial({ color: 0x002b5c })
);
bodyMesh.position.y = 0.6;
bodyMesh.castShadow = true;
playerGroup.add(bodyMesh);

const headMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.35),
  new THREE.MeshLambertMaterial({ color: 0xffcc99 })
);
headMesh.position.y = 1.55;
headMesh.castShadow = true;
playerGroup.add(headMesh);

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 8, 6),
  new THREE.MeshLambertMaterial({ color: 0x8B4513 })
);
ballMesh.position.set(0.5, 0.8, 0);
playerGroup.add(ballMesh);
scene.add(playerGroup);

// ─── Input ───────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

const mouse = { yaw: 0, pitch: 0.4, down: false, lastX: 0, lastY: 0 };
window.addEventListener('mousemove', e => {
  if (!mouse.down) return;
  mouse.yaw  -= (e.clientX - mouse.lastX) * 0.005;
  mouse.pitch = Math.max(0.1, Math.min(1.2, mouse.pitch + (e.clientY - mouse.lastY) * 0.005));
  mouse.lastX = e.clientX; mouse.lastY = e.clientY;
});
window.addEventListener('mousedown', e => { mouse.down = true; mouse.lastX = e.clientX; mouse.lastY = e.clientY; });
window.addEventListener('mouseup',   () => { mouse.down = false; });

mount.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  mouse.lastX = e.touches[0].clientX; mouse.lastY = e.touches[0].clientY;
});
mount.addEventListener('touchmove', e => {
  if (e.touches.length !== 1) return;
  mouse.yaw  -= (e.touches[0].clientX - mouse.lastX) * 0.005;
  mouse.pitch = Math.max(0.1, Math.min(1.2, mouse.pitch + (e.touches[0].clientY - mouse.lastY) * 0.005));
  mouse.lastX = e.touches[0].clientX; mouse.lastY = e.touches[0].clientY;
});

// ─── UI helpers ──────────────────────────────────────────────────────────────
const hud        = document.getElementById('hud');
const hudLeft    = document.getElementById('hud-left');
const hudRight   = document.getElementById('hud-right');
const hint       = document.getElementById('controls-hint');
const flash      = document.getElementById('flash');
const overlay    = document.getElementById('overlay');
const gameoverEl = document.getElementById('gameover');
const finalScore = document.getElementById('final-score');
const finalRound = document.getElementById('final-round');

function showHUD(lives, score, round) {
  hud.style.display = 'flex';
  hint.style.display = 'block';
  hudLeft.textContent = '❤️ ' + '●'.repeat(lives) + '○'.repeat(MAX_LIVES - lives) + '  Round ' + round;
  hudRight.textContent = '🏆 ' + score;
}

function showFlash(msg, color) {
  flash.textContent = msg;
  flash.style.color = color;
  flash.style.display = 'block';
  setTimeout(() => { flash.style.display = 'none'; }, 1500);
}

// ─── Game State ──────────────────────────────────────────────────────────────
const gs = {
  active: false, tackled: false, scored: false,
  lives: MAX_LIVES, score: 0, round: 1,
  playerPos: new THREE.Vector3(0, 0, FIELD_D / 2 - 3),
  playerVel: new THREE.Vector3(),
  defenders: [], defData: [],
};

function createDefender(x, z) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
  b.position.y = 0.6; b.castShadow = true; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.35), new THREE.MeshLambertMaterial({ color: 0xffcc99 }));
  h.position.y = 1.55; h.castShadow = true; g.add(h);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

function clearDefenders() {
  gs.defenders.forEach(d => scene.remove(d));
  gs.defenders.length = 0;
  gs.defData.length = 0;
}

function spawnRound(round) {
  clearDefenders();
  const count = 2 + round;
  const spacing = FIELD_D / (count + 1);
  for (let i = 0; i < count; i++) {
    const z = FIELD_D / 2 - spacing * (i + 1);
    const x = (Math.random() - 0.5) * (FIELD_W - 4);
    gs.defenders.push(createDefender(x, z));
    gs.defData.push({ vel: new THREE.Vector3(), wanderAngle: Math.random() * Math.PI * 2 });
  }
  gs.playerPos.set(0, 0, FIELD_D / 2 - 3);
  gs.playerVel.set(0, 0, 0);
  gs.tackled = false;
  gs.scored = false;
  gs.active = true;
}

function resetGame() {
  gs.lives = MAX_LIVES; gs.score = 0; gs.round = 1;
  overlay.classList.add('hidden');
  gameoverEl.style.display = 'none';
  showHUD(gs.lives, gs.score, gs.round);
  spawnRound(1);
}

function resetPlayer() {
  gs.playerPos.set(0, 0, FIELD_D / 2 - 3);
  gs.playerVel.set(0, 0, 0);
  gs.tackled = false;
  gs.scored = false;
  gs.active = true;
}

document.getElementById('start-btn').addEventListener('click', resetGame);
document.getElementById('replay-btn').addEventListener('click', resetGame);

// ─── Game Loop ───────────────────────────────────────────────────────────────
let prevTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;

  if (gs.active && !gs.tackled && !gs.scored) {
    // Player movement
    const move = new THREE.Vector3();
    if (keys['ArrowUp']    || keys['KeyW']) move.z -= 1;
    if (keys['ArrowDown']  || keys['KeyS']) move.z += 1;
    if (keys['ArrowLeft']  || keys['KeyA']) move.x -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) move.x += 1;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(PLAYER_SPEED);
    gs.playerVel.lerp(move, 0.2);
    gs.playerPos.addScaledVector(gs.playerVel, dt);

    // Clamp to field
    gs.playerPos.x = Math.max(-FIELD_W / 2 + 0.5, Math.min(FIELD_W / 2 - 0.5, gs.playerPos.x));
    gs.playerPos.z = Math.max(-FIELD_D / 2 + 0.5, Math.min(FIELD_D / 2 - 0.5, gs.playerPos.z));

    // Try scored
    if (gs.playerPos.z <= -FIELD_D / 2 + 2.5) {
      gs.scored = true;
      gs.active = false;
      gs.score += 50 + gs.round * 20;
      gs.round++;
      showHUD(gs.lives, gs.score, gs.round);
      showFlash('TRY! 🏉', '#00ff88');
      setTimeout(() => { spawnRound(gs.round); }, 1800);
    }

    // Defenders AI
    const defSpeed = DEF_SPEED_BASE + gs.round * 0.5;
    gs.defenders.forEach((def, i) => {
      const dd = gs.defData[i];
      const toPlayer = new THREE.Vector3().subVectors(gs.playerPos, def.position);
      const dist = toPlayer.length();
      let steering = new THREE.Vector3();

      if (dist < 12) {
        steering.copy(toPlayer).normalize().multiplyScalar(defSpeed);
      } else {
        dd.wanderAngle += (Math.random() - 0.5) * 0.5;
        steering.set(Math.sin(dd.wanderAngle), 0, Math.cos(dd.wanderAngle)).multiplyScalar(defSpeed * 0.4);
      }
      dd.vel.lerp(steering, 0.08);
      def.position.addScaledVector(dd.vel, dt);
      def.position.x = Math.max(-FIELD_W / 2 + 0.5, Math.min(FIELD_W / 2 - 0.5, def.position.x));
      def.position.z = Math.max(-FIELD_D / 2 + 0.5, Math.min(FIELD_D / 2 - 0.5, def.position.z));
      if (toPlayer.lengthSq() > 0.01) def.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

      // Tackle
      if (dist < TACKLE_DIST && !gs.tackled) {
        gs.tackled = true;
        gs.active = false;
        gs.lives--;
        showHUD(gs.lives, gs.score, gs.round);
        if (gs.lives <= 0) {
          showFlash('TACKLED! 💥', '#ff4444');
          setTimeout(() => {
            gameoverEl.style.display = 'flex';
            hud.style.display = 'none';
            hint.style.display = 'none';
            finalScore.textContent = gs.score;
            finalRound.textContent = 'Round ' + (gs.round - 1) + ' reached';
          }, 1000);
        } else {
          showFlash('TACKLED! 💥', '#ff4444');
          setTimeout(resetPlayer, 1200);
        }
      }
    });

    // Rotate player toward movement
    if (gs.playerVel.lengthSq() > 0.5) {
      playerGroup.rotation.y = Math.atan2(gs.playerVel.x, gs.playerVel.z);
    }
  }

  playerGroup.position.copy(gs.playerPos);

  // Camera follow with mouse look
  const camDist = 10;
  camera.position.set(
    gs.playerPos.x + camDist * Math.sin(mouse.yaw) * Math.cos(mouse.pitch),
    gs.playerPos.y + camDist * Math.sin(mouse.pitch),
    gs.playerPos.z + camDist * Math.cos(mouse.yaw) * Math.cos(mouse.pitch)
  );
  camera.lookAt(gs.playerPos.x, gs.playerPos.y + 1, gs.playerPos.z);

  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = mount.clientWidth / mount.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(mount.clientWidth, mount.clientHeight);
});
