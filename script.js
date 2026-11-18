import * as THREE from "three";

const $ = (id) => document.getElementById(id);
const screens = ["home-screen", "map-screen", "how-screen", "game-screen"];
function showScreen(id) {
  screens.forEach(name => $(name).classList.toggle("active", name === id));
}

const worldData = {
  jungle: {
    title: "غابات الأمازون", sky: 0x91b9a1, ground: 0x345b3b, wall: 0x25432d,
    accent: 0x8cae54, fog: 0x91b9a1, weather: "ضباب استوائي",
    obstacle: 0x315a38
  },
  tomb: {
    title: "المقابر الفرعونية", sky: 0xc6a77b, ground: 0x9a784b, wall: 0x705331,
    accent: 0xd5b36c, fog: 0xc6a77b, weather: "غبار المقابر",
    obstacle: 0x80613d
  },
  atlantis: {
    title: "أطلنطس الغارقة", sky: 0x164d70, ground: 0x17617a, wall: 0x17445d,
    accent: 0x53d6d2, fog: 0x164d70, weather: "ضوء الأعماق",
    obstacle: 0x247d8c
  }
};

let renderer, scene, camera, clock, player, treasure, worldGroup;
let currentWorld = "jungle";
let animationId = 0;
let timerId = 0;
let remaining = 180;
let round = 1;
let role = "explorer";
let trapsLeft = 5;
let explorerScore = 0;
let saboteurScore = 0;
let gameActive = false;
let obstacles = [];
let trapMeshes = [];
const keys = {};
const moveVector = new THREE.Vector3();
let yaw = 0;
let cameraPitch = 0.23;
let pointerDown = false;
let lastPointerX = 0;
let lastPointerY = 0;
let playerY = 0;
let jumpVelocity = 0;

function makeMaterial(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function addBox(parent, x, y, z, sx, sy, sz, material, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function initRenderer() {
  const host = $("game-viewport");
  if (renderer) {
    renderer.setSize(host.clientWidth, host.clientHeight);
    return;
  }
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  host.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  clock = new THREE.Clock();
  camera = new THREE.PerspectiveCamera(62, host.clientWidth / host.clientHeight, 0.1, 160);
  window.addEventListener("resize", resizeRenderer);
}

function resizeRenderer() {
  if (!renderer || !$("game-viewport")) return;
  const host = $("game-viewport");
  if (!host.clientWidth || !host.clientHeight) return;
  renderer.setSize(host.clientWidth, host.clientHeight);
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
}

function clearWorld() {
  if (!worldGroup) return;
  scene.remove(worldGroup);
  worldGroup.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
  obstacles = [];
  trapMeshes = [];
}

function createTree(parent, x, z, scale = 1, world) {
  const trunkMat = makeMaterial(world === "jungle" ? 0x493724 : 0x66533a);
  const leafMat = makeMaterial(world === "jungle" ? 0x285b38 : 0x377e85);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 2.8 * scale, 7), trunkMat);
  trunk.position.set(x, 1.4 * scale, z);
  trunk.castShadow = true; parent.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 * scale, 1), leafMat);
  crown.position.set(x, 3.05 * scale, z);
  crown.scale.set(1.15, 1.25, 1.1);
  crown.castShadow = true; parent.add(crown);
}

function createPillar(parent, x, z, material) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.35, 8), material);
  base.position.set(x, 0.18, z); base.castShadow = true; parent.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 3.2, 8), material);
  shaft.position.set(x, 1.9, z); shaft.castShadow = true; shaft.receiveShadow = true; parent.add(shaft);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.35, 1.45), material);
  cap.position.set(x, 3.65, z); cap.castShadow = true; parent.add(cap);
}

function buildWorld(key) {
  initRenderer();
  clearWorld();
  currentWorld = key;
  const data = worldData[key];
  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  scene.background = new THREE.Color(data.sky);
  scene.fog = new THREE.Fog(data.fog, 20, key === "atlantis" ? 47 : 58);

  const hemi = new THREE.HemisphereLight(0xdceeff, data.ground, key === "atlantis" ? 1.25 : 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe1b0, key === "atlantis" ? 1.3 : 2.2);
  sun.position.set(-12, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
  scene.add(sun);

  const groundMat = makeMaterial(data.ground);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  // منطقة لعب مفتوحة مع أعمدة/أشجار وعوائق توحي ببيئة العالم.
  const wallMat = makeMaterial(data.wall);
  const accentMat = makeMaterial(data.accent);
  const obstacleMat = makeMaterial(data.obstacle);
  const boundary = 19;
  for (let i = -boundary; i <= boundary; i += 4) {
    addBox(worldGroup, i, 1.1, -boundary, 3.8, 2.2, 1.2, wallMat);
    addBox(worldGroup, i, 1.1, boundary, 3.8, 2.2, 1.2, wallMat);
    addBox(worldGroup, -boundary, 1.1, i, 1.2, 2.2, 3.8, wallMat);
    addBox(worldGroup, boundary, 1.1, i, 1.2, 2.2, 3.8, wallMat);
  }

  const placements = [
    [-9,-8],[-4,-9],[3,-8],[9,-7],[-11,-1],[-5,-2],[5,-2],[11,1],
    [-9,7],[-3,8],[4,7],[9,9],[0,2]
  ];
  placements.forEach(([x,z], i) => {
    if (key === "jungle") {
      createTree(worldGroup, x, z, i % 3 === 0 ? 1.25 : 0.9, key);
      if (i % 3 !== 1) obstacles.push({x,z,r:1.0});
    } else if (key === "tomb") {
      createPillar(worldGroup, x, z, i % 2 ? wallMat : accentMat);
      obstacles.push({x,z,r:0.9});
    } else {
      const column = addBox(worldGroup, x, 1.6, z, 1.25, 3.2, 1.25, obstacleMat);
      column.rotation.y = i * 0.2;
      obstacles.push({x,z,r:0.95});
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshStandardMaterial({color:0x72f1e8,emissive:0x1a9ca8,emissiveIntensity:1.1}));
      orb.position.set(x, 3.7, z); worldGroup.add(orb);
    }
  });

  // زخارف صغيرة تمنح العالم هوية بصرية.
  for (let i = 0; i < 30; i++) {
    const x = THREE.MathUtils.randFloatSpread(32);
    const z = THREE.MathUtils.randFloatSpread(32);
    if (Math.hypot(x,z) < 4) continue;
    if (key === "jungle") {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(THREE.MathUtils.randFloat(0.18,0.5),0), makeMaterial(0x53604a));
      rock.position.set(x,0.25,z); rock.castShadow=true; worldGroup.add(rock);
    } else if (key === "tomb") {
      const stone = addBox(worldGroup,x,0.12,z,0.55,0.24,0.55,accentMat,false);
      stone.rotation.y = Math.random();
    } else {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.08,8,8), new THREE.MeshBasicMaterial({color:0x9dfcff,transparent:true,opacity:0.6}));
      bubble.position.set(x,THREE.MathUtils.randFloat(0.5,5),z); worldGroup.add(bubble);
    }
  }

  createPlayer();
  createTreasure();
  updateCamera(0);
  $("world-name").textContent = data.title;
  $("world-weather").textContent = data.weather;
  $("world-label")?.textContent;
  resizeRenderer();
}

function createPlayer() {
  if (player) scene.remove(player);
  player = new THREE.Group();
  const bodyMat = makeMaterial(0x334f60);
  const skinMat = makeMaterial(0xc58b63);
  const packMat = makeMaterial(0x75512e);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.43,0.75,5,9), bodyMat);
  torso.position.y = 1.15; torso.castShadow = true; player.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.31,16,12), skinMat);
  head.position.y = 1.95; head.castShadow = true; player.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.12,16), makeMaterial(0x9a6a35));
  hat.position.y = 2.2; player.add(hat);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.65,0.28), packMat);
  pack.position.set(0,1.25,0.48); pack.castShadow=true; player.add(pack);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.58,0.65,0.38), makeMaterial(0x29323b));
  legs.position.y = 0.42; legs.castShadow=true; player.add(legs);
  player.position.set(0,0,13);
  scene.add(player);
}

function createTreasure() {
  if (treasure) scene.remove(treasure);
  treasure = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({color:0xf4bd45,metalness:0.72,roughness:0.22,emissive:0x69430a,emissiveIntensity:0.35});
  const chestMat = makeMaterial(0x59351d);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.9,1), chestMat);
  box.position.y=0.55; box.castShadow=true; treasure.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.55,0.28,1.05), gold);
  lid.position.y=1.12; lid.castShadow=true; treasure.add(lid);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.18,1.05,1.08),gold);
  band.position.y=0.68; treasure.add(band);
  const glow = new THREE.PointLight(0xffc64d,2.2,8); glow.position.y=1.6; treasure.add(glow);
  treasure.position.set(13,0,-13);
  scene.add(treasure);
}

function updateCamera(delta) {
  if (!player || !camera) return;
  const distance = 7.2;
  const target = new THREE.Vector3(player.position.x, player.position.y+1.45, player.position.z);
  const offset = new THREE.Vector3(
    Math.sin(yaw)*distance,
    3.1 + cameraPitch*3,
    Math.cos(yaw)*distance
  );
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
}

function isBlocked(x,z) {
  if (Math.abs(x)>17.2 || Math.abs(z)>17.2) return true;
  return obstacles.some(o => Math.hypot(x-o.x,z-o.z) < o.r+0.55);
}

function movePlayer(delta) {
  if (!gameActive || role !== "explorer" || !player) return;
  let forward = 0, side = 0;
  if (keys.KeyW || keys.ArrowUp || touchMove.forward) forward += 1;
  if (keys.KeyS || keys.ArrowDown || touchMove.back) forward -= 1;
  if (keys.KeyA || keys.ArrowLeft || touchMove.left) side -= 1;
  if (keys.KeyD || keys.ArrowRight || touchMove.right) side += 1;
  if (!forward && !side) return;
  const direction = new THREE.Vector3(side,0,-forward).normalize();
  direction.applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
  const speed = 5.1 * delta;
  const nx = player.position.x + direction.x*speed;
  const nz = player.position.z + direction.z*speed;
  if (!isBlocked(nx, player.position.z)) player.position.x=nx;
  if (!isBlocked(player.position.x, nz)) player.position.z=nz;
  player.rotation.y = Math.atan2(direction.x,direction.z);
  if (jumpVelocity !== 0 || playerY > 0) {
    jumpVelocity -= 13*delta;
    playerY = Math.max(0,playerY+jumpVelocity*delta);
    if (playerY===0) jumpVelocity=0;
    player.position.y=playerY;
  }
  checkTreasure();
  checkTraps();
}

function checkTreasure() {
  if (player.position.distanceTo(treasure.position) < 2.0) finishRound("explorer","عثر المستكشف على الكنز!");
}
function checkTraps() {
  for (const trap of trapMeshes) {
    if (!trap.userData.used && player.position.distanceTo(trap.position)<1.15) {
      trap.userData.used=true;
      finishRound("saboteur","وقع المستكشف في فخ المعرقل!");
      break;
    }
  }
}

function plantTrap() {
  if (!gameActive || role !== "saboteur" || trapsLeft<=0) return;
  const trap = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65,0.75,0.16,16),makeMaterial(0x392e28));
  base.position.y=0.08; trap.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42,0.09,8,18),new THREE.MeshStandardMaterial({color:0xe05e3c,emissive:0x8b2010,emissiveIntensity:0.7}));
  ring.rotation.x=Math.PI/2; ring.position.y=0.2; trap.add(ring);
  trap.position.copy(player.position);
  trap.position.x += Math.sin(yaw)*2.3;
  trap.position.z += Math.cos(yaw)*2.3;
  if (isBlocked(trap.position.x,trap.position.z)) {
    $("game-message").textContent="لا يمكن وضع فخ في هذا المكان.";
    return;
  }
  trap.userData.used=false;
  scene.add(trap); trapMeshes.push(trap); trapsLeft--;
  $("trap-count").textContent=`${trapsLeft} فخاخ متبقية`;
}

const touchMove = {forward:false,back:false,left:false,right:false};
function bindControls() {
  window.addEventListener("keydown",e=>{keys[e.code]=true;});
  window.addEventListener("keyup",e=>{keys[e.code]=false;});
  document.querySelectorAll("[data-move]").forEach(btn=>{
    const name=btn.dataset.move;
    const start=e=>{e.preventDefault();touchMove[name]=true;};
    const stop=e=>{e.preventDefault();touchMove[name]=false;};
    btn.addEventListener("pointerdown",start);
    btn.addEventListener("pointerup",stop);
    btn.addEventListener("pointerleave",stop);
    btn.addEventListener("pointercancel",stop);
  });
  $("mobile-jump").addEventListener("click",()=>{if(gameActive && playerY===0){jumpVelocity=6.5;}});
  const host=$("game-viewport");
  host.addEventListener("pointerdown",e=>{pointerDown=true;lastPointerX=e.clientX;lastPointerY=e.clientY;});
  window.addEventListener("pointerup",()=>pointerDown=false);
  window.addEventListener("pointermove",e=>{
    if(!pointerDown || !gameActive) return;
    const dx=e.clientX-lastPointerX, dy=e.clientY-lastPointerY;
    lastPointerX=e.clientX;lastPointerY=e.clientY;
    yaw-=dx*0.006;
    cameraPitch=THREE.MathUtils.clamp(cameraPitch+dy*0.002,-0.15,0.8);
  });
  $("trap-button").addEventListener("click",plantTrap);
}

function startTimer() {
  clearInterval(timerId);
  remaining=180;
  updateTimerDisplay();
  timerId=setInterval(()=>{
    if(!gameActive)return;
    remaining--;
    updateTimerDisplay();
    if(remaining<=0) finishRound("saboteur","انتهى الوقت قبل العثور على الكنز.");
  },1000);
}
function updateTimerDisplay() {
  const mm=String(Math.floor(remaining/60)).padStart(2,"0");
  const ss=String(remaining%60).padStart(2,"0");
  $("timer").textContent=`${mm}:${ss}`;
  $("time-progress").style.width=`${(remaining/180)*100}%`;
  $("timer").style.color=remaining<=30?"#e87559":"#ffdc91";
}

function finishRound(winner,message) {
  if(!gameActive)return;
  gameActive=false;
  clearInterval(timerId);
  if(winner==="explorer") explorerScore++; else saboteurScore++;
  $("explorer-score").textContent=explorerScore;
  $("saboteur-score").textContent=saboteurScore;
  $("game-message").textContent=message;
  $("modal-title").textContent=winner==="explorer"?"نجح المستكشف!":"فاز المعرقل!";
  $("modal-text").textContent=message;
  $("modal").classList.remove("hidden");
}

function startRound() {
  role=round%2===1?"explorer":"saboteur";
  trapsLeft=5;
  $("role-name").textContent=role==="explorer"?"المستكشف":"المعرقل";
  $("objective").textContent=role==="explorer"?"اعثر على الكنز الذهبي":"راقب المسار وجهّز الفخاخ";
  $("trap-count").textContent=`${trapsLeft} فخاخ`;
  $("trap-button").disabled=role!=="saboteur";
  $("trap-button").style.opacity=role==="saboteur"?"1":".45";
  $("round-number").textContent=round;
  $("mission-status").textContent=role==="explorer"?"ابحث عن الكنز":"جهّز الفخاخ";
  $("game-message").textContent=role==="explorer"?"تحرك نحو الصندوق الذهبي.":"دور المعرقل: ضع الفخاخ في المسار المتوقع.";
  if(player) player.position.set(0,0,13);
  trapMeshes.forEach(t=>scene.remove(t));trapMeshes=[];
  gameActive=true;
  startTimer();
}

function animate() {
  animationId=requestAnimationFrame(animate);
  const delta=Math.min(clock.getDelta(),0.04);
  if(gameActive) movePlayer(delta);
  if(treasure) treasure.rotation.y += delta*0.45;
  if(treasure) treasure.position.y=0.08+Math.sin(performance.now()*0.002)*0.08;
  if(player) updateCamera(delta);
  if(renderer && scene && camera) renderer.render(scene,camera);
}

function beginWorld(key) {
  currentWorld=key;
  buildWorld(key);
  $("world-name").textContent=worldData[key].title;
  $("round-number").textContent=round;
  showScreen("game-screen");
  // انتظر ظهور مساحة العرض قبل ضبط أبعاد WebGL.
  requestAnimationFrame(()=>{resizeRenderer();startRound();});
}

$("start-button").addEventListener("click",()=>showScreen("map-screen"));
$("how-button").addEventListener("click",()=>showScreen("how-screen"));
document.querySelectorAll(".back-home").forEach(b=>b.addEventListener("click",()=>showScreen("home-screen")));
document.querySelectorAll("[data-world]").forEach(card=>card.addEventListener("click",()=>{round=1;explorerScore=0;saboteurScore=0;$("explorer-score").textContent="0";$("saboteur-score").textContent="0";beginWorld(card.dataset.world);}));
$("leave-button").addEventListener("click",()=>{gameActive=false;clearInterval(timerId);showScreen("home-screen");});
$("close-modal").addEventListener("click",()=>{$("modal").classList.add("hidden");});
$("modal-next").addEventListener("click",()=>{
  $("modal").classList.add("hidden");
  if(round>=6){
    $("modal-title").textContent="انتهت المباراة";
    $("modal-text").textContent=`النتيجة النهائية: المستكشف ${explorerScore} — المعرقل ${saboteurScore}`;
    $("modal").classList.remove("hidden");
    $("modal-next").textContent="العودة للرئيسية";
    $("modal-next").onclick=()=>{ $("modal").classList.add("hidden");showScreen("home-screen");$("modal-next").textContent="متابعة";$("modal-next").onclick=null; };
    return;
  }
  round++;
  startRound();
});
bindControls();
animate();
