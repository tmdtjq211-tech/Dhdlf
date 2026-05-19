// js/game.js
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { WEAPONS, SECONDARY_WEAPON, mazeMap } from './data.js';

let isMobile = window.innerWidth <= 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isMobile) document.body.classList.add('is-mobile');

window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && isMobile) {
        isMobile = false;
        document.body.classList.remove('is-mobile'); 
        document.getElementById('mobile-controls').style.display = 'none'; 
        
        const lockScreen = document.getElementById('lock-screen');
        lockScreen.style.display = 'flex';
        lockScreen.classList.remove('hidden');
        
        UI.log("🖱️ 블루투스 마우스 연결됨: PC 조작 모드 활성화");
    }
});

const CHARACTERS = {
    Ares: {
        name: "아레스", signatureWeapon: 'shotgun', hp:150, speed:45, color:"#ff4444", atk:120, def:120, skillMax: 5, ultMax: 25,
        desc: "전장의 최전선에서 적을 휩쓰는 돌격형 영웅.",
        passiveDesc: "[패시브] 킬 달성 시 3초간 이동속도 크게 증가",
        skillDesc: "[스킬] 조준한 적에게 투창을 던져 3초간 기절",
        ultDesc: "[궁극기] 10초간 광폭화 (공격력 2배, 피해감소 50%, 이속증가)",
        passive: (p) => { p.timers.speedBuff = 3.0; UI.log("패시브 발동: 킬 달성 쾌속!"); },
        skill: (p) => {
            if(p.timers.skill > 0) return UI.log("스킬 쿨타임 중입니다.");
            const hit = getAimTarget();
            if(hit) { hit.userData.stun = 3.0; UI.log("⚡ 아레스 투창 적중! 적 기절 (3초)"); playSound('powerup'); }
            else { UI.log("투창 빗나감!"); }
            p.timers.skill = p.info.skillMax;
        },
        ult: (p) => {
            if(p.timers.ult > 0) return UI.log("궁극기 쿨타임 중입니다.");
            p.atkMult=2.0; p.dmgReduction=0.5; p.timers.speedBuff=10.0; p.timers.ultBuffer=10.0;
            UI.log("🔥 [궁극기] 전쟁의 광폭화 발동!");
            document.getElementById('blood-overlay').className = 'ult-active'; playSound('powerup');
            p.timers.ult = p.info.ultMax;
        }
    },
    Artemis: {
        name: "아르테미스", signatureWeapon: 'sniper', hp:100, speed:48, color:"#66bb6a", atk:150, def:80, skillMax: 6, ultMax: 15,
        desc: "원거리에서 적의 숨통을 끊는 저격 특화 영웅.",
        passiveDesc: "[패시브] 적 처치 시 체력 20 즉시 회복",
        skillDesc: "[스킬] 조준한 적의 발을 묶어 4초간 이동 불가",
        ultDesc: "[궁극기] 시야 내의 모든 적에게 확정 관통 데미지",
        passive: (p) => { p.hp = Math.min(p.maxHp, p.hp+20); UI.updateHP(); UI.log("패시브 발동: 체력 회복!"); },
        skill: (p) => {
            if(p.timers.skill > 0) return;
            const hit = getAimTarget();
            if(hit) { hit.userData.root = 4.0; UI.log("🕸️ 아르테미스 올가미! 적 속박 (4초)"); playSound('powerup'); }
            p.timers.skill = p.info.skillMax;
        },
        ult: (p) => {
            if(p.timers.ult > 0) return;
            let hits = 0;
            enemies.forEach(e => { if(checkLOS(camera.position, e.mesh.position)) { takeDamage(e, 50); hits++; } });
            if(boss && checkLOS(camera.position, boss.mesh.position)) { takeDamage(boss, 50); hits++; }
            UI.log(`🏹 [궁극기] 화살 비! 적 ${hits}명 타격`); UI.flash('heal-flash'); playSound('powerup');
            p.timers.ult = p.info.ultMax;
        }
    },
    Hermes: {
        name: "헤르메스", signatureWeapon: 'smg', hp:100, speed:60, color:"#ffd700", atk:100, def:90, skillMax: 3, ultMax: 20,
        desc: "전장을 빠르게 누비며 깃발을 탈취하는 기동형 영웅.",
        passiveDesc: "[패시브] 기본 이동속도가 매우 빠름",
        skillDesc: "[스킬] 바라보는 방향으로 순식간에 쾌속 대시",
        ultDesc: "[궁극기] 5초간 모든 피해 면역(무적) 및 초고속 이동",
        passive: (p) => {},
        skill: (p) => {
            if(p.timers.skill > 0) return;
            let dashDir = new THREE.Vector3();
            if(isMobile) { dashDir.set(joyX, 0, -joyY); } 
            else { dashDir.set(Number(moveRight)-Number(moveLeft), 0, Number(moveBackward)-Number(moveForward)); }
            if(dashDir.lengthSq() === 0) dashDir.z = -1; 
            dashDir.normalize();
            
            velocity.x += dashDir.x * 1500; velocity.z += dashDir.z * 1500;
            UI.log("💨 헤르메스 쾌속 대시!"); playSound('powerup');
            p.timers.skill = p.info.skillMax;
        },
        ult: (p) => {
            if(p.timers.ult > 0) return;
            p.timers.speedBuff=5.0; p.dmgReduction=0; p.timers.ultBuffer=5.0;
            UI.log("✨ [궁극기] 5초간 무적 상태 돌입!"); playSound('powerup');
            p.timers.ult = p.info.ultMax;
        }
    },
    Poseidon: {
        name: "포세이돈", signatureWeapon: 'launcher', hp:140, speed:42, color:"#42a5f5", atk:110, def:110, skillMax: 6, ultMax: 20,
        desc: "다수의 적을 제어하고 진형을 붕괴시키는 영웅.",
        passiveDesc: "[패시브] 적 처치 시 체력 15 회복",
        skillDesc: "[스킬] 전방의 근접한 적들을 뒤로 강하게 밀쳐냄",
        ultDesc: "[궁극기] 지정 위치에 지속 데미지를 주는 거대 소용돌이 소환",
        passive: (p) => { p.hp = Math.min(p.maxHp, p.hp+15); UI.updateHP(); },
        skill: (p) => {
            if(p.timers.skill > 0) return;
            let count = 0;
            enemies.forEach(e => {
                if(e.mesh.position.distanceTo(camera.position) < 40 && checkLOS(camera.position, e.mesh.position)) {
                    const pushDir = e.mesh.position.clone().sub(camera.position);
                    pushDir.y = 0; pushDir.normalize();
                    e.mesh.position.add(pushDir.multiplyScalar(20));
                    e.mesh.userData.stun = 2.0; takeDamage(e, 30); count++;
                }
            });
            UI.log(`🌊 파도 밀치기! 적 ${count}명 넉백`); playSound('powerup');
            p.timers.skill = p.info.skillMax;
        },
        ult: (p) => {
            if(p.timers.ult > 0) return;
            raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
            const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
            const target = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, target);
            if(target) {
                const geo = new THREE.CylinderGeometry(25,25,0.5,32);
                const mat = new THREE.MeshBasicMaterial({color:0x00bcd4, transparent:true, opacity:0.5});
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(target.x, 0.25, target.z);
                scene.add(mesh);
                aoeEffects.push({mesh, geo, mat, pos:target.clone(), life:6.0, radius:25, dmg:20});
                UI.log("🌀 [궁극기] 거대 소용돌이 소환!"); playSound('powerup');
                p.timers.ult = p.info.ultMax;
            }
        }
    }
};

window.showHowToPlay = () => document.getElementById('how-to-play').classList.remove('hidden');
window.hideHowToPlay = () => document.getElementById('how-to-play').classList.add('hidden');

let currentMode = 'ctf';
let selectedCharKey = null;

window.showMapSelect = () => {
    initAudio();
    ['main-menu', 'char-select', 'weapon-select'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('map-select').classList.remove('hidden');
};

window.selectMap = (mode) => {
    currentMode = mode;
    document.getElementById('map-select').classList.add('hidden');
    document.getElementById('char-select').classList.remove('hidden');
    const grid = document.getElementById('char-grid');
    grid.innerHTML = '';
    const charIcons = { Ares: '⚔️', Artemis: '🏹', Hermes: '⚡', Poseidon: '🌊' };
    for(let key in CHARACTERS) {
        const c = CHARACTERS[key];
        const synWeapon = WEAPONS[c.signatureWeapon].name;
        const hpPct = Math.round(c.hp / 1.5);
        const atkPct = Math.round(c.atk / 1.5);
        const defPct = Math.round(c.def / 1.5);
        const icon = charIcons[key] || '👤';
        grid.innerHTML += `<div class="card" onclick="window.selectChar('${key}')">
            <div style="font-size:36px; margin-bottom:8px; filter: drop-shadow(0 0 8px ${c.color});">${icon}</div>
            <div class="card-title" style="color:${c.color}; text-shadow: 0 0 12px ${c.color}80;">${c.name}</div>
            <div class="card-desc" style="color:var(--gold); margin-bottom:10px; font-size:11px; letter-spacing:1px;">▶ ${synWeapon}</div>
            <div style="text-align:left; margin-bottom:10px; font-size:10px; color:rgba(180,210,255,0.7);">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="width:24px; color:var(--red);">HP</span>
                    <div style="flex:1; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
                        <div style="width:${hpPct}%; height:100%; background:var(--red);"></div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="width:24px; color:var(--gold);">ATK</span>
                    <div style="flex:1; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
                        <div style="width:${atkPct}%; height:100%; background:var(--gold);"></div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="width:24px; color:var(--cyan);">DEF</span>
                    <div style="flex:1; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
                        <div style="width:${defPct}%; height:100%; background:var(--cyan);"></div>
                    </div>
                </div>
            </div>
            <div class="skill-desc">
                <b style="color:#aaa;">◆ 패시브:</b> ${c.passiveDesc.replace('[패시브] ','')}<br>
                <b style="color:#2196f3;">◆ 스킬:</b> ${c.skillDesc.replace('[스킬] ','')}<br>
                <b style="color:var(--gold);">◆ 궁극:</b> ${c.ultDesc.replace('[궁극기] ','')}
            </div>
        </div>`;
    }
};

window.selectChar = (key) => {
    selectedCharKey = key;
    const c = CHARACTERS[key];
    document.getElementById('char-select').classList.add('hidden');
    document.getElementById('weapon-select').classList.remove('hidden');
    
    document.getElementById('synergy-info').innerText = `[${c.name}] 선택됨. [${WEAPONS[c.signatureWeapon].name}] 장착 시 공격력 20% 증가!`;

    const grid = document.getElementById('weapon-grid');
    grid.innerHTML = '';
    for(let wKey in WEAPONS) {
        const w = WEAPONS[wKey];
        const isSynergy = (wKey === c.signatureWeapon);
        const borderStyle = isSynergy ? `border: 2px solid var(--gold); box-shadow: 0 0 15px rgba(255,215,0,0.4);` : '';
        grid.innerHTML += `<div class="card" style="${borderStyle}" onclick="window.startGame('${wKey}')">
            <div class="card-title" style="color:${isSynergy ? 'var(--gold)' : '#fff'}">${w.name}</div>
            <div class="card-desc">${w.desc}</div>
            ${isSynergy ? `<div class="synergy-text">✨ ${c.name} 전용 시너지 발동!</div>` : ''}
        </div>`;
    }
};

const UI = {
    _logT: null, _killT: null,
    log(msg) {
        let el = document.getElementById('skill-log');
        if(isMobile) {
            const temp = document.createElement('div');
            temp.innerText = msg;
            temp.style.cssText = `position:absolute; top:80px; left:50%; transform:translateX(-50%); color:var(--cyan); font-family:'Orbitron', monospace; font-size:16px; text-shadow:0 0 10px rgba(0,229,255,0.8), 0 0 5px #000; z-index:200; pointer-events:none; font-weight:700; letter-spacing:1px; white-space:nowrap;`;
            document.getElementById('game-wrapper').appendChild(temp);
            setTimeout(()=>temp.remove(), 2500);
        } else {
            el.innerText = msg;
            clearTimeout(UI._logT);
            UI._logT = setTimeout(()=>el.innerText='', 3500);
        }
    },
    showKillLog() {
        const el = document.getElementById('kill-msg');
        el.style.opacity = 1; el.style.transform = "translate(-50%, -50%) scale(1.2)";
        setTimeout(()=>el.style.transform = "translate(-50%, -50%) scale(1)", 50);
        clearTimeout(UI._killT);
        UI._killT = setTimeout(()=>el.style.opacity=0, 900);
        playSound('kill');
    },
    updateHP() {
        const pct = Math.max(0, player.hp/player.maxHp*100);
        document.getElementById('hp-bar').style.width = pct+'%';
        document.getElementById('hp-text').innerText = Math.max(0,Math.floor(player.hp));
    },
    updateBossHP() {
        if(boss && boss.hp>0) {
            document.getElementById('boss-hp-container').style.display='block';
            document.getElementById('boss-name-disp').innerText = `COMMANDER — ${Math.floor(boss.hp)} / ${boss.maxHp}`;
            document.getElementById('boss-hp-bar').style.width = Math.max(0,boss.hp/boss.maxHp*100)+'%';
        } else {
            document.getElementById('boss-hp-container').style.display='none';
            document.getElementById('boss-name-disp').innerText='';
        }
    },
    updateStats() {
        if(!isMobile) {
            document.getElementById('stat-atk').innerText = Math.floor(player.info.atk * player.atkMult * player.synergyBonus);
            document.getElementById('stat-def').innerText = player.info.def;
        }
    },
    updateKillCount() {
        document.getElementById('kill-count').innerText = `${killCount} / ${totalEnemies}`;
    },
    flash(cls='hit-flash', dur=200) {
        const el = document.getElementById('blood-overlay');
        el.className = cls;
        setTimeout(()=>{ if(el.className===cls) el.className = player.timers.ultBuffer>0?'ult-active':''; }, dur);
    },
    showDmgNum(worldPos, amountStr, color='#ff4444', isPerfect=false) {
        const el = document.createElement('div');
        el.className = isPerfect ? 'dmg-num dmg-perfect' : 'dmg-num';
        el.innerText = amountStr;
        if(!isPerfect) el.style.cssText = `color:${color};font-size:24px;`;
        
        const v = worldPos.clone().project(camera);
        const wrapper = document.getElementById('game-wrapper');
        const w = wrapper.clientWidth, h = wrapper.clientHeight;
        const x = (v.x*0.5+0.5)*w, y = (-v.y*0.5+0.5)*h;
        
        el.style.left = (x+(Math.random()-0.5)*40)+'px';
        el.style.top = (y-30)+'px';
        document.getElementById('game-wrapper').appendChild(el);
        setTimeout(()=>el.remove(), isPerfect ? 1000 : 800);
    }
};

let audioCtx;
function initAudio() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
}
function playSound(type) {
    if(!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    if(type === 'shoot') {
        o.type = 'square'; o.frequency.setValueAtTime(320,t); o.frequency.exponentialRampToValueAtTime(80,t+0.08);
        g.gain.setValueAtTime(0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.08);
        o.start(t); o.stop(t+0.08);
    } else if(type === 'hit') {
        o.type = 'sawtooth'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(40,t+0.2);
        g.gain.setValueAtTime(0.12,t); g.gain.linearRampToValueAtTime(0.001,t+0.2);
        o.start(t); o.stop(t+0.2);
    } else if(type === 'powerup') {
        o.type = 'sine'; o.frequency.setValueAtTime(500,t); o.frequency.linearRampToValueAtTime(1400,t+0.3);
        g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.3);
        o.start(t); o.stop(t+0.3);
    } else if(type === 'kill') {
        [600,900].forEach((f,i) => {
            const oo = audioCtx.createOscillator(), gg = audioCtx.createGain();
            oo.connect(gg); gg.connect(audioCtx.destination);
            oo.type = 'square'; oo.frequency.setValueAtTime(f, t+i*0.1);
            gg.gain.setValueAtTime(0.08, t+i*0.1); gg.gain.linearRampToValueAtTime(0, t+i*0.1+0.15);
            oo.start(t+i*0.1); oo.stop(t+i*0.1+0.15);
        });
    } else if(type === 'perfect') {
        [800,1200,1600].forEach((f,i) => {
            const oo = audioCtx.createOscillator(), gg = audioCtx.createGain();
            oo.connect(gg); gg.connect(audioCtx.destination);
            oo.type = 'sine'; oo.frequency.setValueAtTime(f, t+i*0.05);
            gg.gain.setValueAtTime(0.1, t+i*0.05); gg.gain.linearRampToValueAtTime(0, t+i*0.05+0.2);
            oo.start(t+i*0.05); oo.stop(t+i*0.05+0.2);
        });
    } else if(type === 'flag') {
        o.type = 'triangle'; o.frequency.setValueAtTime(400,t); o.frequency.linearRampToValueAtTime(800,t+0.4);
        g.gain.setValueAtTime(0.15,t); g.gain.linearRampToValueAtTime(0,t+0.4);
        o.start(t); o.stop(t+0.4);
    }
}

let scene, camera, renderer, controls;
let player = {
    hp:100, maxHp:100, speedMult:1.0, dmgReduction:1.0, atkMult:1.0, synergyBonus:1.0,
    info:null, weapon:null, weaponIdx:0, timers:{ ult:0, skill:0, shield:0, ultBuffer:0, speedBuff:0, rapidBuff:0 },
    lastShot:0, isDead:false, respawnTimer:0, isGameEnded: false
};
let gameTime = 180.0;
let allies=[], enemies=[], boss=null, flags=[], items=[], aoeEffects=[], hails=[], bullets=[], shields=[];
let hailTimer=0, capturedFlags=0, killCount=0, totalEnemies=0;
let collidableObjects=[], weaponMesh;
let moveForward=false, moveBackward=false, moveLeft=false, moveRight=false, isShootingAction=false;
let canJump=false, isCrouching=false;
let prevTime = performance.now();
const velocity = new THREE.Vector3(), direction = new THREE.Vector3(), raycaster = new THREE.Raycaster();
let minimapCtx, joyX = 0, joyY = 0;

function endGame(title, desc, color='var(--gold)') {
    if(player.isGameEnded) return;
    player.isGameEnded = true; player.isDead = true; 
    if(!isMobile) controls.unlock();
    
    document.getElementById('game-ui').classList.add('hidden');
    if(isMobile) document.getElementById('mobile-controls').style.display='none';
    document.getElementById('lock-screen').classList.add('hidden');

    const goScreen = document.getElementById('game-over-screen');
    goScreen.classList.remove('hidden');
    const titleEl = document.getElementById('go-title');
    titleEl.innerText = title; titleEl.style.color = color;
    document.getElementById('go-desc').innerText = desc;
}

function createSDMesh(colorHex, isAlly=false, scale=1.0) {
    const group = new THREE.Group();
    
    // === 머리 ===
    const headGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    const headMat = new THREE.MeshLambertMaterial({color: colorHex});
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 3.8; group.add(head);
    
    // 헬멧 (머리 위 플레이트)
    const helmetGeo = new THREE.BoxGeometry(2.0, 0.4, 2.0);
    const helmetMat = new THREE.MeshLambertMaterial({color: 0x222233});
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 4.75; group.add(helmet);
    
    // 바이저 (눈)
    const visorGeo = new THREE.BoxGeometry(1.5, 0.35, 0.2);
    const visorMat = new THREE.MeshBasicMaterial({color: 0x00e5ff});
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 3.85, 0.92); group.add(visor);
    // 바이저 발광 포인트라이트
    const visorLight = new THREE.PointLight(0x00e5ff, 0.8, 6);
    visorLight.position.set(0, 3.85, 1.0); group.add(visorLight);
    
    // === 몸통 ===
    const bodyGeo = new THREE.BoxGeometry(2.2, 2.2, 1.4);
    const bodyMat = new THREE.MeshLambertMaterial({color: 0x1a2232});
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.8; group.add(body);
    
    // 가슴 갑옷 플레이트
    const chestGeo = new THREE.BoxGeometry(2.0, 1.6, 0.4);
    const chestMat = new THREE.MeshLambertMaterial({color: colorHex});
    const chest = new THREE.Mesh(chestGeo, chestMat);
    chest.position.set(0, 2.0, 0.78); group.add(chest);
    
    // 복부 발광 선
    const beltGeo = new THREE.BoxGeometry(2.3, 0.25, 1.5);
    const beltMat = new THREE.MeshBasicMaterial({color: 0x00e5ff});
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.95; group.add(belt);
    
    // === 어깨 갑옷 ===
    const shoulderGeo = new THREE.BoxGeometry(0.8, 0.7, 1.0);
    const shoulderMat = new THREE.MeshLambertMaterial({color: colorHex});
    [-1.55, 1.55].forEach(sx => {
        const sh = new THREE.Mesh(shoulderGeo, shoulderMat);
        sh.position.set(sx, 2.7, 0); group.add(sh);
    });
    
    // === 팔 ===
    const armGeo = new THREE.BoxGeometry(0.55, 1.6, 0.55);
    const armMat = new THREE.MeshLambertMaterial({color: 0x263040});
    [-1.4, 1.4].forEach(ax => {
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(ax, 1.6, 0); group.add(arm);
        // 팔목 갑옷
        const wristGeo = new THREE.BoxGeometry(0.65, 0.35, 0.65);
        const wristMat = new THREE.MeshLambertMaterial({color: 0x334455});
        const wrist = new THREE.Mesh(wristGeo, wristMat);
        wrist.position.set(ax, 0.85, 0); group.add(wrist);
    });
    
    // === 다리 ===
    const legGeo = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const legMat = new THREE.MeshLambertMaterial({color: 0x1a2232});
    const kneeGeo = new THREE.BoxGeometry(0.9, 0.5, 0.9);
    const kneeMat = new THREE.MeshLambertMaterial({color: colorHex});
    [-0.55, 0.55].forEach(lx => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, -0.7, 0); group.add(leg);
        // 무릎 갑옷
        const knee = new THREE.Mesh(kneeGeo, kneeMat);
        knee.position.set(lx, -0.3, 0.1); group.add(knee);
        // 부츠
        const bootGeo = new THREE.BoxGeometry(0.9, 0.5, 1.1);
        const bootMat = new THREE.MeshLambertMaterial({color: 0x111111});
        const boot = new THREE.Mesh(bootGeo, bootMat);
        boot.position.set(lx, -1.6, 0.1); group.add(boot);
    });
    
    group.scale.set(scale, scale, scale);
    return group;
}

function createWeapon(colorString) {
    if (weaponMesh) {
        camera.remove(weaponMesh);
        weaponMesh.traverse(c => {
            if(c.geometry) c.geometry.dispose();
            if(c.material) c.material.dispose();
        });
    }
    
    let colorHex = colorString;
    if (typeof colorString === 'string' && colorString.startsWith('#')) {
        colorHex = parseInt(colorString.replace('#', '0x'), 16);
    }

    const group = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.5), new THREE.MeshLambertMaterial({color: 0x222222}));
    barrel.position.set(0, 0, -0.5); group.add(barrel);
    
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 1.0), new THREE.MeshLambertMaterial({color: colorHex}));
    group.add(body);

    weaponMesh = group;
    weaponMesh.position.set(0.6, -0.6, -1.2); 
    camera.add(weaponMesh);
}

window.startGame = async (weaponKey) => {
    minimapCtx = document.getElementById('minimap').getContext('2d');
    document.getElementById('weapon-select').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');

    if (isMobile) {
        document.getElementById('mobile-controls').style.display = 'block';
        try {
            if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.warn(err));
            }
        } catch(e) { console.warn("Fullscreen denied", e); }
    } else {
        document.getElementById('lock-screen').classList.remove('hidden');
    }

    if (scene) {
        scene.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }

    items=[]; aoeEffects=[]; enemies=[]; allies=[]; flags=[]; hails=[]; bullets=[]; shields=[];
    capturedFlags=0; killCount=0; totalEnemies=0; gameTime=180.0;
    UI.updateKillCount();
    collidableObjects=[];

    player.info = CHARACTERS[selectedCharKey];
    player.weapon = WEAPONS[weaponKey];
    player.synergyBonus = (weaponKey === player.info.signatureWeapon) ? 1.2 : 1.0;
    if(player.synergyBonus > 1.0) UI.log("✨ 시너지 발동: 전용 무기 장착 (공격력 +20%)");

    player.hp = player.info.hp; player.maxHp = player.info.hp;
    player.timers = {ult:0, skill:0, shield:0, ultBuffer:0, speedBuff:0, rapidBuff:0};
    player.atkMult=1.0; player.dmgReduction=1.0; player.isDead=false; player.isGameEnded=false; player.weaponIdx=0;
    isShootingAction=false; moveForward=false; moveBackward=false; moveLeft=false; moveRight=false;

    document.getElementById('player-name-disp').innerText = player.info.name.toUpperCase();
    document.getElementById('player-name-disp').style.color = player.info.color;
    document.getElementById('weapon-name').innerText = `🔫 ${player.weapon.name}`;
    document.getElementById('weapon-name').style.color = player.info.color;
    document.getElementById('flag-counter-ui').style.display = currentMode==='2v2'?'none':'block';

    UI.updateHP(); UI.updateStats();

    const skyColor = currentMode==='hail'? 0x1a2030 : 0x0a0e18; 
    scene = new THREE.Scene();
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.FogExp2(skyColor, 0.004); 

    const ambLight = new THREE.AmbientLight(0x203050, 0.8); scene.add(ambLight);
    const hemi = new THREE.HemisphereLight(0x1040aa, 0x000510, 0.6); scene.add(hemi);
    const dirLight = new THREE.DirectionalLight(0x80c0ff, 0.8); dirLight.position.set(40, 80, 40); scene.add(dirLight);
    // 포인트 라이트들로 분위기 연출
    const accentLight1 = new THREE.PointLight(0x00e5ff, 1.5, 120); accentLight1.position.set(0, 25, 0); scene.add(accentLight1);
    const accentLight2 = new THREE.PointLight(0xff2244, 0.8, 100); accentLight2.position.set(-100, 20, -100); scene.add(accentLight2);

    if (!camera) camera = new THREE.PerspectiveCamera(isMobile?65:75, 1, 0.1, 1000);
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({antialias:true});
        renderer.shadowMap.enabled = true;
        document.getElementById('canvas-container').appendChild(renderer.domElement);
    }

    resizeRenderer(); 

    controls = new PointerLockControls(camera, document.getElementById('game-wrapper'));
    scene.add(controls.getObject());

    if (!isMobile) {
        document.getElementById('lock-screen').addEventListener('click', ()=>controls.lock());
        controls.addEventListener('lock', ()=>{ document.getElementById('lock-screen').classList.add('hidden'); prevTime=performance.now(); });
        controls.addEventListener('unlock', ()=>{ if(!player.isDead && !player.isGameEnded) document.getElementById('lock-screen').classList.remove('hidden'); });
    } else {
        prevTime = performance.now(); setupMobileControls();
    }

    createMapAndEntities(); 
    createWeapon(player.info.color); 
    spawnItems();

    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown); document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', e=>e.preventDefault());
    window.addEventListener('resize', resizeRenderer);
    
    requestAnimationFrame(animate);
};

function resizeRenderer() {
    const container = document.getElementById('canvas-container');
    const w = container.clientWidth, h = container.clientHeight;
    if(w === 0 || h === 0) return;
    if(camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if(renderer) { renderer.setSize(w, h); }
}

function performSwap() {
    if(player.isDead || (!isMobile && !controls.isLocked)) return;
    player.weaponIdx = player.weaponIdx === 0 ? 1 : 0;
    const w = player.weaponIdx === 0 ? player.weapon : SECONDARY_WEAPON;
    document.getElementById('weapon-name').innerText = `🔫 ${w.name}`;
    document.getElementById('weapon-name').style.color = player.weaponIdx === 0 ? player.info.color : '#cccccc';
    UI.log(`[ ${w.name} ] 장착!`); playSound('powerup');
}

function performShoot() {
    if(player.isDead || (!isMobile && !controls.isLocked)) return;
    const now = performance.now();
    const w = player.weaponIdx === 0 ? player.weapon : SECONDARY_WEAPON;
    const cooldown = player.timers.rapidBuff>0 ? w.fireRate*0.5 : w.fireRate;
    
    if(now-player.lastShot < cooldown) return;
    player.lastShot=now;
    
    playSound('shoot');
    weaponMesh.rotation.x=-0.25; setTimeout(()=>weaponMesh.rotation.x=0, 90);
    
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const shootDir = raycaster.ray.direction.clone().normalize();
    const spawnPos = raycaster.ray.origin.clone().add(shootDir.clone().multiplyScalar(2));
    const baseDmg = 25 * (player.info.atk/100) * player.atkMult * player.synergyBonus * w.dmgMulti;
    
    if (w.type === 'shotgun') {
        for(let i=0; i<w.count; i++) {
            const spreadDir = shootDir.clone();
            spreadDir.x += (Math.random()-0.5)*0.15; spreadDir.y += (Math.random()-0.5)*0.15; spreadDir.z += (Math.random()-0.5)*0.15;
            fireBullet(spawnPos, spreadDir.normalize(), 'player', w.color, baseDmg, w.speed, w.type);
        }
    } else { fireBullet(spawnPos, shootDir, 'player', w.color, baseDmg, w.speed, w.type); }
    spawnMuzzleFlash(spawnPos);
}
function performSkill() { if(!player.isDead && (isMobile || controls.isLocked)) player.info.skill(player); }
function performUlt() { if(!player.isDead && (isMobile || controls.isLocked)) player.info.ult(player); }
function performJump() { if(canJump && !isCrouching && !player.isDead && (isMobile || controls.isLocked)) { velocity.y += 80; canJump = false; } }
function performCrouch() { if(!player.isDead && (isMobile || controls.isLocked)) isCrouching = !isCrouching; }
function deployShield() {
    if (player.timers.shield > 0 || player.isDead || (!isMobile && !controls.isLocked)) return;
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const spawnPos = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(6)); spawnPos.y = 3;
    const geo = new THREE.BoxGeometry(10, 6, 1);
    const mat = new THREE.MeshLambertMaterial({color:0x00e5ff, transparent:true, opacity:0.4, emissive:0x0088aa});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(spawnPos); mesh.lookAt(camera.position.x, 3, camera.position.z);
    scene.add(mesh); mesh.updateMatrixWorld();
    mesh.userData = { isShield: true, life: 10.0, box3: new THREE.Box3().setFromObject(mesh), geo, mat };
    collidableObjects.push(mesh); shields.push(mesh);
    UI.log("전술 방벽 전개!"); playSound('powerup'); player.timers.shield = 15.0; 
}

function onKeyDown(e) {
    if(isMobile) return;
    if(e.code==='KeyW'||e.code==='ArrowUp') moveForward=true;
    if(e.code==='KeyA'||e.code==='ArrowLeft') moveLeft=true;
    if(e.code==='KeyS'||e.code==='ArrowDown') moveBackward=true;
    if(e.code==='KeyD'||e.code==='ArrowRight') moveRight=true;
    if(e.code==='Space') performJump(); if(e.code==='KeyC') performCrouch();
    if(e.code==='KeyQ') performUlt(); if(e.code==='KeyE') deployShield();
    if(e.code==='KeyF'||e.code==='Tab') { e.preventDefault(); performSwap(); }
}
function onKeyUp(e) {
    if(isMobile) return;
    if(e.code==='KeyW'||e.code==='ArrowUp') moveForward=false;
    if(e.code==='KeyA'||e.code==='ArrowLeft') moveLeft=false;
    if(e.code==='KeyS'||e.code==='ArrowDown') moveBackward=false;
    if(e.code==='KeyD'||e.code==='ArrowRight') moveRight=false;
}
function onMouseDown(e) { if(isMobile) return; if(e.button===0) isShootingAction=true; else if(e.button===2) performSkill(); }
function onMouseUp(e) { if(isMobile) return; if(e.button===0) isShootingAction=false; }

function getTouchXY(touch) {
    const isPortrait = window.innerHeight > window.innerWidth;
    if (isPortrait) return { x: touch.clientY, y: window.innerWidth - touch.clientX };
    return { x: touch.clientX, y: touch.clientY };
}

let mobileSetupDone = false;
function setupMobileControls() {
    if (mobileSetupDone) return;
    mobileSetupDone = true;
    const bindBtnTouch = (id, onStart, onEnd) => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('touchstart', (e)=>{ e.preventDefault(); e.stopPropagation(); onStart(); }, {passive: false});
            if(onEnd) {
                el.addEventListener('touchend', (e)=>{ onEnd(); }, {passive: false});
                el.addEventListener('touchcancel', (e)=>{ onEnd(); }, {passive: false});
            }
        }
    };
    bindBtnTouch('m-shoot', () => isShootingAction=true, () => isShootingAction=false);
    bindBtnTouch('m-swap', performSwap); bindBtnTouch('m-skill', performSkill); bindBtnTouch('m-ult', performUlt);

    const joyZone = document.getElementById('joystick-zone'), joyKnob = document.getElementById('joystick-knob');
    let joyTouchId = null, joyStart = {x:0, y:0};
    joyZone.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if(joyTouchId !== null) return;
        const touch = e.changedTouches[0]; joyTouchId = touch.identifier;
        const pos = getTouchXY(touch); joyStart = { x: pos.x, y: pos.y };
    }, {passive: false});
    
    joyZone.addEventListener('touchmove', (e) => {
        e.preventDefault(); e.stopPropagation();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === joyTouchId);
        if(touch) {
            const pos = getTouchXY(touch); 
            let dx = pos.x - joyStart.x, dy = pos.y - joyStart.y;
            const maxR = 45; 
            const dist = Math.hypot(dx, dy);
            
            if(dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
            
            if (dist < maxR * 0.15) { joyX = 0; joyY = 0; } 
            else { joyX = dx / maxR; joyY = dy / maxR; }
            joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }
    }, {passive: false});
    
    const endJoy = (e) => {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === joyTouchId);
        if(!touch) return;
        joyTouchId = null; joyX = 0; joyY = 0; joyKnob.style.transform = `translate(-50%, -50%)`;
    };
    joyZone.addEventListener('touchend', endJoy, {passive: false}); joyZone.addEventListener('touchcancel', endJoy, {passive: false});

    const touchZone = document.getElementById('touch-look-zone');
    let lookTouchId = null, lastLook = {x:0, y:0};
    touchZone.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        if(lookTouchId !== null) return;
        const touch = e.changedTouches[0]; lookTouchId = touch.identifier;
        const pos = getTouchXY(touch); lastLook.x = pos.x; lastLook.y = pos.y;
    }, {passive: false});
    
    touchZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === lookTouchId);
        if(!touch) return;
        const pos = getTouchXY(touch);
        const dx = pos.x - lastLook.x, dy = pos.y - lastLook.y;
        lastLook.x = pos.x; lastLook.y = pos.y;
        
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= dx * 0.006;
        euler.x -= dy * 0.006;
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
        camera.quaternion.setFromEuler(euler);
    }, {passive: false});
    
    const endLook = (e) => {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === lookTouchId);
        if(touch) lookTouchId = null;
    };
    touchZone.addEventListener('touchend', endLook, {passive: false}); touchZone.addEventListener('touchcancel', endLook, {passive: false});
}

function createMapAndEntities() {
    const tileSize = 20, offset = -140; 
    // 바닥: 어두운 타일 + 발광 그리드
    const floorGeo = new THREE.PlaneGeometry(300,300, 30,30);
    const floorMat = new THREE.MeshLambertMaterial({color:0x111418}); 
    const floor = new THREE.Mesh(floorGeo, floorMat); floor.rotation.x=-Math.PI/2; scene.add(floor);
    
    // 타일 라인 (청록색 SF 그리드)
    const gridHelper = new THREE.GridHelper(300, 30, 0x003344, 0x001122); 
    gridHelper.position.y=0.05; gridHelper.material.opacity = 0.7; gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // 바닥 발광선 (대형 그리드)
    const glowGridHelper = new THREE.GridHelper(300, 6, 0x00e5ff, 0x00e5ff);
    glowGridHelper.position.y = 0.08; glowGridHelper.material.opacity = 0.12; glowGridHelper.material.transparent = true;
    scene.add(glowGridHelper);

    // 벽 재질: SF 군사 기지 콘크리트/금속
    const wallMat = new THREE.MeshLambertMaterial({color:0x1a2332}); // 어두운 네이비 블루 콘크리트
    const edgeMat = new THREE.MeshBasicMaterial({color:0x00e5ff});   // 청록 발광 엣지   

    let validEmptySpots = []; 

    for(let r=0; r<15; r++) {
        for(let c=0; c<15; c++) {
            const px = c * tileSize + offset, pz = r * tileSize + offset, val = mazeMap[r][c];
            if(val === 1) {
                // 메인 벽 (어두운 콘크리트)
                const w = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 20), wallMat);
                w.position.set(px, 15, pz); scene.add(w); w.updateMatrixWorld(); 
                w.userData.isStatic = true; collidableObjects.push(w);
                // 상단 발광 엣지
                const edge = new THREE.Mesh(new THREE.BoxGeometry(20.1, 0.6, 20.1), edgeMat);
                edge.position.set(px, 30.3, pz); scene.add(edge);
                // 중간 금속 띠
                const midBand = new THREE.Mesh(new THREE.BoxGeometry(20.2, 1.0, 20.2), new THREE.MeshBasicMaterial({color: 0x223344}));
                midBand.position.set(px, 15, pz); scene.add(midBand);
                // 하단 발광 띠
                const bottomGlow = new THREE.Mesh(new THREE.BoxGeometry(20.2, 0.4, 20.2), new THREE.MeshBasicMaterial({color: 0x004455}));
                bottomGlow.position.set(px, 0.5, pz); scene.add(bottomGlow);
            } else { validEmptySpots.push({x: px, z: pz}); }

            if (currentMode==='ctf'||currentMode==='hail') {
                if (val === 3) {
                    const group = new THREE.Group();
                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,10), new THREE.MeshLambertMaterial({color:0x888888})); pole.position.y=5;
                    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(4,3), new THREE.MeshLambertMaterial({color:0xffd700,side:THREE.DoubleSide,emissive:0x886600,emissiveIntensity:0.3})); cloth.position.set(2,8,0);
                    const flagLight = new THREE.PointLight(0xffaa00,2,20); flagLight.position.set(2,8,0);
                    group.add(pole,cloth,flagLight); group.position.set(px,0,pz); scene.add(group); flags.push(group);
                    
                    for(let i=0; i<4; i++) {
                        const angle = (i * Math.PI) / 2;
                        const mesh = createSDMesh(0x7b1fa2, false, isMobile?1.2:1); 
                        mesh.position.set(px + Math.cos(angle)*6, 0, pz + Math.sin(angle)*6); scene.add(mesh);
                        mesh.userData={team:'enemy',stun:0,root:0, originPos: new THREE.Vector3(px,0,pz), wanderDir: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize()}; 
                        enemies.push({type:'defend',mesh,hp:80,maxHp:80,state:'defend',team:'enemy',speed:10,attackT:0,strafeDir:1,strafeTimer:0,revealedTimer:0});
                        totalEnemies++;
                    }
                } else if(val === 2) {
                    const mesh = createSDMesh(0xc62828, false, isMobile?1.2:1); 
                    mesh.position.set(px,0,pz); scene.add(mesh); 
                    mesh.userData={team:'enemy',stun:0,root:0, originPos: new THREE.Vector3(px,0,pz), wanderDir: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize()};
                    enemies.push({type:'normal',mesh,hp:60,maxHp:60,state:'patrol',team:'enemy',speed:14,attackT:0,strafeDir:1,strafeTimer:0,revealedTimer:0, skillTimer: 5 + Math.random()*5, isShielded: false, shieldDuration: 0});
                    totalEnemies++;
                } else if(val === 4) {
                    const mesh = createSDMesh(0x6a1b9a,false,2.0); mesh.position.set(px,0,pz); scene.add(mesh); 
                    mesh.userData={team:'enemy',stun:0,root:0, originPos: new THREE.Vector3(px,0,pz), wanderDir: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize()};
                    boss={mesh,hp:800,maxHp:800,state:'command',team:'enemy',speed:12,attackT:0,summonT:5,isActive:false,strafeDir:1,strafeTimer:0,revealedTimer:0};
                    totalEnemies++; UI.updateBossHP();
                } else if(val === 5) {
                    camera.position.set(px, 5, pz); 
                }
            }
        }
    }
    collidableObjects.forEach(obj=>{ if(obj.userData.isStatic) obj.userData.box3 = new THREE.Box3().setFromObject(obj); });
    UI.updateKillCount();

    if (currentMode==='2v2') {
        validEmptySpots.sort(() => Math.random() - 0.5);
        camera.position.set(validEmptySpots[0].x, 5, validEmptySpots[0].z); 
        const avail = Object.keys(CHARACTERS).filter(k=>k!==selectedCharKey); avail.sort(()=>Math.random()-0.5); const [allyKey,e1Key,e2Key] = avail;
        
        const allyMesh = createSDMesh(parseInt(CHARACTERS[allyKey].color.replace('#',''),16), false, isMobile?1.2:1); 
        allyMesh.position.set(validEmptySpots[1].x, 0, validEmptySpots[1].z); scene.add(allyMesh);
        allies.push({type:'hero',mesh:allyMesh,hp:CHARACTERS[allyKey].hp*2,maxHp:CHARACTERS[allyKey].hp*2,team:'ally',speed:CHARACTERS[allyKey].speed*0.8,attackT:0,strafeDir:1,strafeTimer:0});
        
        [e1Key,e2Key].forEach((ek,idx)=>{
            const eMesh = createSDMesh(parseInt(CHARACTERS[ek].color.replace('#',''),16), false, isMobile?1.2:1); 
            eMesh.position.set(validEmptySpots[idx+2].x, 0, validEmptySpots[idx+2].z); scene.add(eMesh); 
            eMesh.userData={team:'enemy',stun:0,root:0, wanderDir: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize()};
            enemies.push({type:'hero',mesh:eMesh,hp:CHARACTERS[ek].hp*2,maxHp:CHARACTERS[ek].hp*2,state:'patrol',team:'enemy',speed:CHARACTERS[ek].speed*0.8,attackT:0,strafeDir:1,strafeTimer:0,revealedTimer:0});
            totalEnemies++;
        });
        UI.updateKillCount(); UI.log("2 vs 2 미로 대전 시작!");
    }
}

function spawnMuzzleFlash(pos) {
    const geo = new THREE.SphereGeometry(0.1, 6, 6), mat = new THREE.MeshBasicMaterial({color:0xffee00, transparent:true, opacity:0.8});
    const flash = new THREE.Mesh(geo, mat); flash.position.copy(pos); scene.add(flash); flash.add(new THREE.PointLight(0xffaa00, 1.5, 4));
    setTimeout(()=>{ scene.remove(flash); geo.dispose(); mat.dispose(); }, 50); 
}

function spawnBulletTrail(pos, color=0xffee00) {
    const geo = new THREE.SphereGeometry(0.12,4,4), mat = new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.7});
    const trail = new THREE.Mesh(geo,mat); trail.position.copy(pos); scene.add(trail);
    setTimeout(()=>{ trail.material.opacity=0.3; setTimeout(()=>{ scene.remove(trail); geo.dispose(); mat.dispose(); },80); },40);
}

function spawnHitExplosion(pos, color=0xff4400, scale=1.0) {
    const mat = new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9});
    for(let i=0;i<8;i++) {
        const geo = new THREE.SphereGeometry((0.15+Math.random()*0.2)*scale,4,4), p = new THREE.Mesh(geo,mat); p.position.copy(pos);
        const dir = new THREE.Vector3((Math.random()-0.5)*2,(Math.random()-0.5)*2+0.5,(Math.random()-0.5)*2).normalize(); scene.add(p);
        const speed = (0.3+Math.random()*0.5)*scale; let life=0;
        const tick = setInterval(()=>{ life+=0.05; p.position.add(dir.clone().multiplyScalar(speed)); p.material.opacity = Math.max(0,0.9-life*2);
            if(life>0.5){ clearInterval(tick); scene.remove(p); geo.dispose(); } },16);
    }
    setTimeout(() => mat.dispose(), 600);
}

function spawnItems() {
    const types = ['heal','speed','rapid'], cfgs = {heal:{c:0x00e676},speed:{c:0x2979ff},rapid:{c:0xff9100}};
    for(let i=0;i<10;i++) {
        const type = types[i%3];
        const geo = new THREE.OctahedronGeometry(1.2), mat = new THREE.MeshLambertMaterial({color:cfgs[type].c, emissive:cfgs[type].c, emissiveIntensity:0.5});
        const mesh = new THREE.Mesh(geo, mat); 
        mesh.position.set((Math.random()-0.5)*260, 1.5, (Math.random()-0.5)*260); 
        mesh.add(new THREE.PointLight(cfgs[type].c, 2, 15)); mesh.userData={type}; scene.add(mesh); items.push(mesh);
    }
}

function spawnHail() {
    const geo = new THREE.DodecahedronGeometry(1.5+Math.random()*0.5), mat = new THREE.MeshLambertMaterial({color:0xaaddff,emissive:0x003366,emissiveIntensity:0.3});
    const h = new THREE.Mesh(geo,mat); h.position.set(camera.position.x+(Math.random()-0.5)*180, 130, camera.position.z+(Math.random()-0.5)*180);
    h.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI); h.userData = {geo, mat}; scene.add(h); hails.push(h);
}

function fireBullet(startPos, dir, ownerTeam, color, damage, speed=160, type='rifle') {
    const isSniper = type === 'sniper';
    const geo = new THREE.BoxGeometry(isSniper?0.15:0.25, isSniper?0.15:0.25, isSniper?3:1.8), mat = new THREE.MeshBasicMaterial({color});
    const b = new THREE.Mesh(geo,mat); b.position.copy(startPos); b.lookAt(startPos.clone().add(dir)); b.userData = { type, originalColor: color, geo, mat }; 
    b.add(new THREE.PointLight(color,1.5,8)); scene.add(b);
    bullets.push({mesh:b, dir:dir.clone(), team:ownerTeam, life: type==='launcher'?1.5:2.0, dmg:damage, speed:speed});
}

function checkLOS(pos1, pos2) {
    const d = pos2.clone().sub(pos1), dist = d.length();
    if(dist > 150) return false; 
    raycaster.set(pos1, d.normalize());
    const walls = collidableObjects.filter(obj => obj.userData.isStatic);
    const intersects = raycaster.intersectObjects(walls, false);
    if(intersects.length > 0 && intersects[0].distance < dist) return false;
    return true;
}

function getAimTarget() {
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    let targets = enemies.map(e=>e.mesh); if(boss) targets.push(boss.mesh);
    const intersects = raycaster.intersectObjects(targets, true);
    if(intersects.length>0) {
        let obj = intersects[0].object; while(obj.parent&&obj.parent.type==="Group") obj=obj.parent; return obj;
    }
    return null;
}

function takeDamage(entityObj, amt, isPerfect=false, attackerTeam=null) {
    if(entityObj.hp<=0) return;
    if(entityObj.isShielded) {
        amt = amt * 0.3; 
        if(attackerTeam === 'player' || attackerTeam === 'ally') {
            player.hp -= 5 * player.dmgReduction; 
            UI.flash('hit-flash'); UI.updateHP(); 
            if(Math.random() < 0.3) UI.log("⚠️ 쫄병의 데미지 반사 방패!");
        }
    }
    entityObj.hp-=amt;
    if(entityObj.mesh) {
        entityObj.mesh.traverse(c=>{
            if(c.material&&c.material.color) {
                const orig=c.material.color.getHex(); c.material.color.setHex(0xffffff); setTimeout(()=>c.material.color.setHex(orig),80);
            }
        });
        const pos = entityObj.mesh.position.clone().add(new THREE.Vector3(0,6,0));
        if(isPerfect) UI.showDmgNum(pos, "PERFECT!", "#ffff00", true);
        else UI.showDmgNum(pos, Math.floor(amt), amt>30?'#ff9100':'#ff4444');
        spawnHitExplosion(entityObj.mesh.position.clone().add(new THREE.Vector3(0,3,0)));
    }
    
    if(entityObj.hp<=0) {
        if(entityObj.mesh) {
            scene.remove(entityObj.mesh);
            entityObj.mesh.traverse(c => {
                if(c.geometry) c.geometry.dispose();
                if(c.material) c.material.dispose();
            });
        }
        if(entityObj.team==='enemy'&&entityObj!==boss) {
            enemies.splice(enemies.indexOf(entityObj),1); killCount++; 
            UI.updateKillCount();
            UI.showKillLog(); if(player.info.passive) player.info.passive(player);
            if(currentMode==='2v2'&&enemies.length===0) setTimeout(()=>{ endGame("VICTORY", "모든 적 영웅을 처치했습니다!", "var(--cyan)"); }, 500);
        } else if(entityObj===boss) {
            boss=null; killCount++; 
            UI.updateKillCount();
            UI.showKillLog(); UI.updateBossHP(); UI.log("적장 처치! 깃발 탈취가 수월해집니다!");
        } else if(entityObj.team==='ally') {
            allies.splice(allies.indexOf(entityObj),1);
            if(currentMode==='2v2'&&allies.length===0&&enemies.length>0) UI.log("⚠️ 아군 전사! 단독 전투 돌입!");
        }
    }
    if(boss && entityObj.team === 'enemy') UI.updateBossHP();
}

function killPlayer() {
    if(player.isDead) return;
    player.isDead=true; player.respawnTimer=3.0;
    if(!isMobile) controls.unlock();
    document.getElementById('respawn-screen').classList.remove('hidden'); document.getElementById('game-ui').classList.add('hidden');
    if(isMobile) document.getElementById('mobile-controls').style.display='none';
    playSound('hit');
}

function aiMove(entity, targetPos, delta, arriveRange, fleeRange, strafeMulti=0.8, isPatrol=false) {
    const dist = entity.mesh.position.distanceTo(targetPos);
    const dir = isPatrol ? entity.mesh.userData.wanderDir : targetPos.clone().sub(entity.mesh.position).normalize();
    let mv = new THREE.Vector3();
    
    if(isPatrol) { mv.add(dir); } 
    else {
        if(dist>arriveRange) mv.add(dir); else if(dist<fleeRange) mv.add(dir.clone().negate());
        if(dist<100) mv.add(new THREE.Vector3(-dir.z,0,dir.x).multiplyScalar(entity.strafeDir*strafeMulti));
    }

    if(mv.lengthSq()>0) {
        mv.normalize().multiplyScalar(entity.speed * delta * (isPatrol ? 0.6 : 1.0));
        const oldPos = entity.mesh.position.clone(); 
        entity.mesh.position.add(mv); entity.mesh.position.y=0;
        
        const aiBox = new THREE.Box3().setFromCenterAndSize(entity.mesh.position.clone().add(new THREE.Vector3(0,3,0)), new THREE.Vector3(4,6,4));
        let wallHit=false;
        for(let obj of collidableObjects) { if(obj.userData.isStatic && obj.userData.box3 && aiBox.intersectsBox(obj.userData.box3)){wallHit=true;break;} }
        
        if(wallHit){
            entity.mesh.position.copy(oldPos);
            let slideMvX = mv.clone(); slideMvX.z = 0;
            entity.mesh.position.add(slideMvX);
            aiBox.setFromCenterAndSize(entity.mesh.position.clone().add(new THREE.Vector3(0,3,0)), new THREE.Vector3(4,6,4));
            let hitX = collidableObjects.some(obj => obj.userData.isStatic && obj.userData.box3 && aiBox.intersectsBox(obj.userData.box3));
            
            if(hitX) {
                entity.mesh.position.copy(oldPos);
                let slideMvZ = mv.clone(); slideMvZ.x = 0;
                entity.mesh.position.add(slideMvZ);
                aiBox.setFromCenterAndSize(entity.mesh.position.clone().add(new THREE.Vector3(0,3,0)), new THREE.Vector3(4,6,4));
                let hitZ = collidableObjects.some(obj => obj.userData.isStatic && obj.userData.box3 && aiBox.intersectsBox(obj.userData.box3));
                
                if(hitZ) {
                    entity.mesh.position.copy(oldPos);
                    entity.strafeDir*=-1; entity.strafeTimer=1.0;
                    if(isPatrol) entity.mesh.userData.wanderDir = new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize();
                }
            }
        } else { if(entity.mesh.children[0]) entity.mesh.children[0].rotation.z=Math.sin(performance.now()*0.01)*0.08; }
    }
    return dist;
}

function aiShoot(entity, targetPos, ownerTeam, color, dmg, cooldown, delta, isSniper=false, targetVelocity=null) {
    entity.attackT-=delta;
    if(entity.attackT<=0) {
        const spawnPos=entity.mesh.position.clone().add(new THREE.Vector3(0,3,0));
        let shootTarget = targetPos.clone();
        if (targetVelocity && (targetVelocity.x !== 0 || targetVelocity.z !== 0)) {
            const dist = spawnPos.distanceTo(targetPos);
            const bulletSpeed = isSniper ? 240 : 120;
            const travelTime = dist / bulletSpeed; 
            shootTarget.x += (targetVelocity.x * travelTime * 0.8);
            shootTarget.z += (targetVelocity.z * travelTime * 0.8);
        }
        const shootDir=shootTarget.sub(spawnPos).normalize();
        if(!isSniper) { shootDir.x+=(Math.random()-0.5)*0.025; shootDir.z+=(Math.random()-0.5)*0.025; }
        fireBullet(spawnPos,shootDir,ownerTeam,color,dmg, isSniper?240:120, isSniper?'sniper':'rifle');
        entity.attackT=cooldown+Math.random()*0.4; 
        entity.revealedTimer = 3.0; 
    }
}

function animate() {
    if (player.isGameEnded) return;

    const now = performance.now();
    const delta = Math.min((now-prevTime)/1000, 0.05);
    prevTime=now;

    if(player.isDead) {
        player.respawnTimer-=delta;
        document.getElementById('respawn-time').innerText=Math.max(1,Math.ceil(player.respawnTimer));
        if(player.respawnTimer<=0) {
            player.isDead=false; player.hp=player.maxHp; player.timers.speedBuff=0; player.timers.rapidBuff=0; player.atkMult=1.0; player.dmgReduction=1.0;
            UI.updateHP(); velocity.set(0,0,0);
            document.getElementById('respawn-screen').classList.add('hidden'); document.getElementById('game-ui').classList.remove('hidden');
            if(!isMobile) document.getElementById('lock-screen').classList.remove('hidden'); else document.getElementById('mobile-controls').style.display='block';
            document.getElementById('blood-overlay').className='';
        }
        renderer.render(scene,camera); 
        requestAnimationFrame(animate); return;
    }

    if(!isMobile && !controls.isLocked) { renderer.render(scene,camera); requestAnimationFrame(animate); return; }

    gameTime-=delta;
    const m=Math.floor(Math.max(0, gameTime)/60), s=Math.floor(Math.max(0, gameTime)%60);
    const timerEl=document.getElementById('game-timer');
    timerEl.innerText=`${m<10?'0'+m:m}:${s<10?'0'+s:s}`; timerEl.className=gameTime<30?'danger':'';
    if(gameTime<=0) { endGame("TIME OVER", "작전 제한 시간이 초과되었습니다.", "var(--red)"); return; }

    if (isShootingAction) performShoot();

    for(let k in player.timers) if(player.timers[k]>0) player.timers[k]-=delta;
    if(player.timers.ultBuffer<=0&&player.timers.ultBuffer>-999) {
        player.atkMult=1.0; player.dmgReduction=1.0;
        if(document.getElementById('blood-overlay').className==='ult-active') document.getElementById('blood-overlay').className='';
        player.timers.ultBuffer=-9999;
    }

    if(!isMobile) {
        const updateRing = (id, timer, max) => {
            const o = document.getElementById('cd-'+id+'-overlay');
            if(timer>0 && max>0) { o.classList.remove('hidden'); o.innerText = Math.ceil(timer); }
            else o.classList.add('hidden'); 
        };
        if(player.info) { updateRing('skill', player.timers.skill, player.info.skillMax); updateRing('ult', player.timers.ult, player.info.ultMax); }
        updateRing('shield', player.timers.shield, 15.0);
    }

    for(let i=shields.length-1; i>=0; i--) {
        let sh = shields[i]; sh.userData.life -= delta;
        if(sh.userData.life <= 0) {
            scene.remove(sh); sh.userData.geo.dispose(); sh.userData.mat.dispose();
            collidableObjects = collidableObjects.filter(obj => obj !== sh); shields.splice(i, 1);
        }
    }

    if(currentMode==='hail') {
        hailTimer-=delta; if(hailTimer<=0) { spawnHail(); hailTimer=0.35; }
        for(let i=hails.length-1;i>=0;i--) {
            const h=hails[i]; h.position.y-=65*delta; h.rotation.x+=delta*2; h.rotation.z+=delta*1.5;
            const d2=Math.hypot(camera.position.x-h.position.x, camera.position.z-h.position.z);
            if(d2<3.5&&h.position.y<camera.position.y+2&&h.position.y>0) {
                player.hp-=30*player.dmgReduction; UI.flash('hit-flash'); UI.updateHP(); playSound('hit');
                if(player.hp<=0) killPlayer(); spawnHitExplosion(h.position.clone(), 0x88ccff);
                scene.remove(h); h.userData.geo.dispose(); h.userData.mat.dispose(); hails.splice(i,1);
            } else if(h.position.y<-2) { scene.remove(h); h.userData.geo.dispose(); h.userData.mat.dispose(); hails.splice(i,1); }
        }
    }

    for(let i=items.length-1;i>=0;i--) {
        const it=items[i]; it.rotation.y+=delta*2; it.rotation.x+=delta; it.position.y=1.5+Math.sin(now*0.002+i)*0.4;
        if(camera.position.distanceTo(it.position)<4) {
            playSound('powerup');
            if(it.userData.type==='heal') { player.hp=Math.min(player.maxHp,player.hp+50); UI.flash('heal-flash'); UI.log("💚 체력 +50 회복!"); }
            else if(it.userData.type==='speed') { player.timers.speedBuff=10.0; UI.flash('speed-flash'); UI.log("⚡ 10초간 신속!"); }
            else if(it.userData.type==='rapid') { player.timers.rapidBuff=10.0; UI.flash('rapid-flash'); UI.log("🔥 10초간 광폭화!"); }
            UI.updateHP(); scene.remove(it); it.geometry.dispose(); it.material.dispose(); items.splice(i,1);
        }
    }

    for(let i=aoeEffects.length-1;i>=0;i--) {
        const aoe=aoeEffects[i]; aoe.life-=delta; aoe.mesh.rotation.y+=delta*3;
        const hitList=[...enemies]; if(boss) hitList.push(boss);
        hitList.forEach(e=>{
            if(e.hp>0&&e.mesh.position.distanceTo(aoe.pos)<aoe.radius && checkLOS(aoe.pos, e.mesh.position)) {
                e.mesh.userData.root=0.5; takeDamage(e,aoe.dmg*delta, false, 'player');
                const away=e.mesh.position.clone().sub(aoe.pos); away.y=0;
                if(away.length()>0) away.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),delta*2);
                e.mesh.position.copy(aoe.pos.clone().add(away.multiplyScalar(aoe.radius*0.95)));
            }
        });
        if(aoe.life<=0){scene.remove(aoe.mesh); aoe.geo.dispose(); aoe.mat.dispose(); aoeEffects.splice(i,1);}
    }

    if(currentMode==='ctf'||currentMode==='hail') {
        for(let i=flags.length-1;i>=0;i--) {
            const f=flags[i];
            if(camera.position.distanceTo(f.position)<9) {
                scene.remove(f); flags.splice(i,1); capturedFlags++; document.getElementById('flag-count').innerText=capturedFlags;
                playSound('flag'); UI.flash('heal-flash'); UI.log(`🚩 깃발 탈취! (${capturedFlags}/3)`);
                if(capturedFlags>=3) setTimeout(()=>{ endGame("MISSION ACCOMPLISHED", "모든 깃발을 확보했습니다!", "var(--gold)"); },500);
            } else { f.children[1].rotation.y=Math.sin(now*0.002+i)*0.3; }
        }
    }

    for(let i=bullets.length-1;i>=0;i--) {
        const b=bullets[i];
        b.mesh.position.add(b.dir.clone().multiplyScalar(b.speed*delta)); b.life-=delta;
        if(Math.floor(now*0.05)%2===0) spawnBulletTrail(b.mesh.position.clone(), b.mesh.userData.originalColor);

        let hit=false;
        const pBox = new THREE.Box3().setFromCenterAndSize(b.mesh.position, new THREE.Vector3(1,1,1));
        for(let obj of collidableObjects) if(obj.userData.box3&&obj.userData.box3.intersectsBox(pBox)){hit=true;break;}

        if(!hit) {
            const isPlayerBullet = b.team==='player'||b.team==='ally';
            const hitCheck = (list) => {
                for(let t of list) {
                    if(t.hp<=0) continue;
                    for(let step=0; step<=1; step+=0.5) {
                        const bx = b.mesh.position.x - b.dir.x * (b.speed * delta * step), by = b.mesh.position.y - b.dir.y * (b.speed * delta * step), bz = b.mesh.position.z - b.dir.z * (b.speed * delta * step);
                        const dx = t.mesh.position.x - bx, dz = t.mesh.position.z - bz;
                        const relY = by - t.mesh.position.y;
                        if(Math.hypot(dx,dz)<3.5 && relY>=-1 && relY<=7) { 
                            let isPerfect = false;
                            if(relY >= 3.8 && relY <= 5.7) isPerfect = true;
                            else if(relY >= 1.5 && relY <= 3.5) isPerfect = true; 
                            if(isPlayerBullet && isPerfect) {
                                playSound('perfect');
                                if (t === boss) takeDamage(t, b.dmg * 3, true, b.team);
                                else takeDamage(t, t.hp, true, b.team); 
                            } else { takeDamage(t, b.dmg, false, b.team); playSound('hit'); }
                            hit=true; return true; 
                        }
                    }
                }
                return false;
            };
            if(isPlayerBullet) { if(!hitCheck(enemies)&&boss) hitCheck([boss]); } 
            else {
                const px=camera.position.x, py=camera.position.y, pz=camera.position.z; let playerHit = false;
                for(let step=0; step<=1; step+=0.5) {
                    const bx = b.mesh.position.x - b.dir.x * (b.speed * delta * step), by = b.mesh.position.y - b.dir.y * (b.speed * delta * step), bz = b.mesh.position.z - b.dir.z * (b.speed * delta * step);
                    if(Math.hypot(px-bx, pz-bz)<3.0 && by>py-5 && by<py+2) { playerHit = true; break; }
                }
                if(playerHit) {
                    player.hp -= b.dmg * (100/Math.max(1,player.info.def)) * player.dmgReduction;
                    UI.flash('hit-flash'); UI.updateHP(); hit=true;
                    if(player.hp<=0) killPlayer(); else playSound('hit');
                }
                if(!hit&&allies.length>0) hitCheck(allies);
            }
        }

        if(hit||b.life<=0) {
            if (b.mesh.userData.type === 'launcher') {
                spawnHitExplosion(b.mesh.position.clone(), b.mesh.userData.originalColor, 2.5);
                const aoeGeo = new THREE.SphereGeometry(12, 8, 8), aoeMat = new THREE.MeshBasicMaterial({color:b.mesh.userData.originalColor, transparent:true, opacity:0.4});
                const aoeMesh = new THREE.Mesh(aoeGeo, aoeMat); aoeMesh.position.copy(b.mesh.position); scene.add(aoeMesh);
                setTimeout(()=>{ scene.remove(aoeMesh); aoeGeo.dispose(); aoeMat.dispose(); }, 150);
                if (b.team === 'player' || b.team === 'ally') {
                    let targets = [...enemies]; if(boss) targets.push(boss);
                    targets.forEach(t => { if (t.hp>0 && t.mesh.position.distanceTo(b.mesh.position)<12 && checkLOS(b.mesh.position, t.mesh.position)) takeDamage(t, b.dmg*0.7, false, b.team); });
                }
            }
            scene.remove(b.mesh); b.mesh.userData.geo.dispose(); b.mesh.userData.mat.dispose(); bullets.splice(i,1);
        }
    }

    allies.forEach((a)=>{
        if(a.hp<=0) return;
        a.strafeTimer-=delta; if(a.strafeTimer<=0){a.strafeDir*=-1;a.strafeTimer=1.5+Math.random()*2;}
        let target=null,minD=Infinity; enemies.forEach(e=>{ const d=a.mesh.position.distanceTo(e.mesh.position); if(d<minD && checkLOS(a.mesh.position, e.mesh.position)){minD=d;target=e;} });
        if(target) { a.mesh.lookAt(target.mesh.position.x,0,target.mesh.position.z); aiMove(a,target.mesh.position,delta,40,15,0.7);
            if(minD<80) aiShoot(a,target.mesh.position.clone().add(new THREE.Vector3(0,3,0)),'ally',0x00ffff,20,1.2,delta, false, null); }
    });

    if(boss&&boss.hp>0) {
        if (boss.revealedTimer > 0) boss.revealedTimer -= delta;
        boss.strafeTimer-=delta; if(boss.strafeTimer<=0){boss.strafeDir*=-1;boss.strafeTimer=2+Math.random()*2;}
        
        const eyePos = boss.mesh.position.clone(); eyePos.y += 6;
        const canSee = checkLOS(eyePos, camera.position);

        if(!boss.isActive&&(enemies.length<=5||flags.length<=1|| (canSee && boss.mesh.position.distanceTo(camera.position)<80))) { 
            boss.isActive=true; UI.log("⚠️ 위기! 적장이 플레이어를 발견했습니다!"); 
        }

        if(boss.isActive) {
            if(canSee) {
                boss.mesh.lookAt(camera.position.x,0,camera.position.z);
                const dist=aiMove(boss,camera.position,delta,50,25,0.5);
                if(dist<90) aiShoot(boss, camera.position, 'enemy', 0xff00ff, 22, 1.1, delta, false, velocity);
                boss.summonT-=delta;
                if(boss.summonT<=0&&enemies.length<14) {
                    const mesh=createSDMesh(0xc62828, false, isMobile?1.2:1); mesh.position.set(boss.mesh.position.x+(Math.random()-0.5)*20,0,boss.mesh.position.z+10);
                    scene.add(mesh); mesh.userData={team:'enemy',stun:0,root:0, wanderDir: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize()};
                    enemies.push({type:'normal',mesh,hp:50,maxHp:50,state:'attack',team:'enemy',speed:28,attackT:0,strafeDir:1,strafeTimer:0,revealedTimer:0, skillTimer: 3, isShielded: false, shieldDuration: 0}); boss.summonT=8;
                    totalEnemies++; UI.updateKillCount();
                }
            } else {
                const pTarget = boss.mesh.position.clone().add(boss.mesh.userData.wanderDir.clone().multiplyScalar(10));
                boss.mesh.lookAt(pTarget.x, 0, pTarget.z); aiMove(boss, pTarget, delta, 0, 0, 0, true);
            }
        }
    }

    enemies.forEach((e)=>{
        if(e.hp<=0) return;

        if (e.type === 'normal') {
            e.skillTimer -= delta;
            if (e.skillTimer <= 0 && !e.isShielded) {
                e.isShielded = true; e.shieldDuration = 3.0; e.skillTimer = 10 + Math.random() * 5; 
                if (!e.shieldMesh) {
                    const sGeo = new THREE.SphereGeometry(2.5, 8, 8);
                    const sMat = new THREE.MeshBasicMaterial({color: 0xff00ff, transparent: true, opacity: 0.3, wireframe: true});
                    e.shieldMesh = new THREE.Mesh(sGeo, sMat); e.shieldMesh.position.y = 2.5; e.mesh.add(e.shieldMesh);
                }
                e.shieldMesh.visible = true;
            }
            if (e.isShielded) {
                e.shieldDuration -= delta; if(e.shieldMesh) e.shieldMesh.rotation.y += delta * 3;
                if (e.shieldDuration <= 0) { e.isShielded = false; e.shieldMesh.visible = false; }
            }
        }

        if (e.revealedTimer > 0) e.revealedTimer -= delta;
        if(e.mesh.userData.stun>0){e.mesh.userData.stun-=delta;return;}
        if(e.mesh.userData.root>0) e.mesh.userData.root-=delta;

        e.strafeTimer-=delta; if(e.strafeTimer<=0){e.strafeDir*=-1;e.strafeTimer=1+Math.random()*2;}
        
        let targetPos=camera.position.clone(), targetIsPlayer=true;
        if(currentMode==='2v2'&&allies.length>0) allies.forEach(a=>{ if(a.mesh.position.distanceTo(e.mesh.position)<camera.position.distanceTo(e.mesh.position)) { targetPos=a.mesh.position.clone(); targetIsPlayer=false; } });
        
        const shootTarget = targetPos.clone(); if(!targetIsPlayer) shootTarget.y += 3;
        const dist = e.mesh.position.distanceTo(targetPos);
        const eyePos = e.mesh.position.clone(); eyePos.y += 4;
        const targetEye = shootTarget.clone(); targetEye.y += (targetIsPlayer ? 1 : 0);
        
        const canSee = checkLOS(eyePos, targetEye);

        if(canSee) {
            if (e.hp / e.maxHp < 0.3 && e.type !== 'defend') e.state = 'retreat'; else e.state = 'attack';
        } else {
            if (e.type !== 'defend') e.state = 'patrol';
        }

        if (e.state === 'patrol') {
            if (e.type === 'defend') {
                const distToOrigin = e.mesh.position.distanceTo(e.mesh.userData.originPos);
                if(distToOrigin > 10) { e.mesh.lookAt(e.mesh.userData.originPos.x, 0, e.mesh.userData.originPos.z); aiMove(e, e.mesh.userData.originPos, delta, 0, 0, 0, false); }
                else { e.mesh.rotation.y += delta; }
            } else {
                const pTarget = e.mesh.position.clone().add(e.mesh.userData.wanderDir.clone().multiplyScalar(10));
                e.mesh.lookAt(pTarget.x, 0, pTarget.z); aiMove(e, pTarget, delta, 0, 0, 0, true);
            }
        } else if (e.state === 'retreat') {
            const retreatPos = e.mesh.position.clone().add(e.mesh.position.clone().sub(targetPos).normalize().multiplyScalar(40));
            e.mesh.lookAt(retreatPos.x, 0, retreatPos.z); aiMove(e, retreatPos, delta, 10, 0, 0); 
            if (Math.random() < 0.01) aiShoot(e, shootTarget, 'enemy', 0xffaa00, 5, 2.0, delta, false, targetIsPlayer ? velocity : null);
        } else {
            e.mesh.lookAt(targetPos.x,0,targetPos.z);
            if(e.type==='defend') { if(canSee && dist<110) aiShoot(e,shootTarget,'enemy',0xff0000,15,1.5,delta, false, targetIsPlayer ? velocity : null); } 
            else if(e.type==='sniper') { aiMove(e,targetPos,delta,120,60,0.4); if(canSee && dist<150) aiShoot(e,shootTarget,'enemy',0xffffff,28,3.2,delta,true, targetIsPlayer ? velocity : null); } 
            else { aiMove(e,targetPos,delta,32,14,0.8); if(canSee && dist<85) aiShoot(e,shootTarget,'enemy',0xff2222,12,2.0,delta, false, targetIsPlayer ? velocity : null); }
        }
    });

    velocity.x -= velocity.x * Math.min(15 * delta, 1); 
    velocity.z -= velocity.z * Math.min(15 * delta, 1);
    velocity.y -= 9.8 * 20 * delta;

    const speedMult = (isCrouching?0.4:1.0)*(player.timers.speedBuff>0?1.5:1.0);
    const finalSpeed = player.info.speed * speedMult;
    let moveVx = 0, moveVz = 0;

    if (isMobile) {
        moveVx = joyX * finalSpeed; moveVz = -joyY * finalSpeed; 
    } else {
        let dz = Number(moveForward) - Number(moveBackward); let dx = Number(moveRight) - Number(moveLeft);
        let d = new THREE.Vector2(dx, dz); if (d.lengthSq() > 0) d.normalize();
        moveVx = d.x * finalSpeed; moveVz = d.y * finalSpeed;
    }

    const targetCamY = isCrouching?2.5:5.0; camera.position.y+=(targetCamY-camera.position.y)*10*delta;
    const totalDx = (velocity.x + moveVx) * delta, totalDz = (velocity.z + moveVz) * delta;

    controls.moveRight(totalDx); 
    let pBox = new THREE.Box3().setFromCenterAndSize(controls.getObject().position, new THREE.Vector3(2.5, targetCamY*2, 2.5));
    let hitX = collidableObjects.some(obj => obj.userData.isStatic && obj.userData.box3 && pBox.intersectsBox(obj.userData.box3));
    if(hitX) { controls.moveRight(-totalDx); velocity.x = 0; }

    controls.moveForward(totalDz); 
    pBox.setFromCenterAndSize(controls.getObject().position, new THREE.Vector3(2.5, targetCamY*2, 2.5));
    let hitZ = collidableObjects.some(obj => obj.userData.isStatic && obj.userData.box3 && pBox.intersectsBox(obj.userData.box3));
    if(hitZ) { controls.moveForward(-totalDz); velocity.z = 0; }

    controls.getObject().position.y += velocity.y * delta;
    if(controls.getObject().position.y < targetCamY) { velocity.y = 0; controls.getObject().position.y = targetCamY; canJump = true; }
    
    const pos=controls.getObject().position; pos.x=Math.max(-140,Math.min(140,pos.x)); pos.z=Math.max(-140,Math.min(140,pos.z));

    if(minimapCtx) {
        minimapCtx.clearRect(0,0,130,130); const cx=65,cy=65,scale=0.45;
        minimapCtx.strokeStyle='rgba(0,229,255,0.05)'; minimapCtx.lineWidth=0.5;
        for(let g=-3;g<=3;g++) { minimapCtx.beginPath(); minimapCtx.moveTo(cx+g*20,0); minimapCtx.lineTo(cx+g*20,130); minimapCtx.stroke(); minimapCtx.beginPath(); minimapCtx.moveTo(0,cy+g*20); minimapCtx.lineTo(130,cy+g*20); minimapCtx.stroke(); }
        const toMap = p=>({x:cx+p.x*scale, y:cy+p.z*scale});
        
        minimapCtx.fillStyle = 'rgba(26, 35, 50, 0.9)'; 
        collidableObjects.forEach(obj => {
            if(obj.userData.isStatic) {
                const mp = toMap(obj.position), w = 20 * scale; minimapCtx.fillRect(mp.x - w/2, mp.y - w/2, w, w);
            }
        });

        items.forEach(it=>{ const mp=toMap(it.position); minimapCtx.fillStyle=it.userData.type==='heal'?'#00e676':it.userData.type==='speed'?'#2979ff':'#ff9100'; minimapCtx.beginPath(); minimapCtx.arc(mp.x,mp.y,2.5,0,Math.PI*2); minimapCtx.fill(); });
        minimapCtx.fillStyle='#ffd700'; flags.forEach(f=>{ const mp=toMap(f.position); minimapCtx.beginPath(); minimapCtx.arc(mp.x,mp.y,4,0,Math.PI*2); minimapCtx.fill(); });
        enemies.forEach(e=>{ if(e.hp>0) { const d = e.mesh.position.distanceTo(camera.position); if (d < 70 || e.revealedTimer > 0) { minimapCtx.fillStyle=e.type==='sniper'?'#333':e.type==='defend'?'#9c27b0':'#f44336'; const mp=toMap(e.mesh.position); minimapCtx.beginPath(); minimapCtx.arc(mp.x,mp.y,3,0,Math.PI*2); minimapCtx.fill(); } } });
        if(boss&&boss.hp>0) { const d = boss.mesh.position.distanceTo(camera.position); if (d < 80 || boss.revealedTimer > 0 || boss.isActive) { const mp=toMap(boss.mesh.position); minimapCtx.fillStyle='#e91e63'; minimapCtx.beginPath(); minimapCtx.arc(mp.x,mp.y,6,0,Math.PI*2); minimapCtx.fill(); } }
        minimapCtx.fillStyle='#00e5ff'; allies.forEach(a=>{ if(a.hp>0) { const mp=toMap(a.mesh.position); minimapCtx.beginPath(); minimapCtx.arc(mp.x,mp.y,3,0,Math.PI*2); minimapCtx.fill(); } });
        
        const pp=toMap(camera.position); minimapCtx.fillStyle='#00ff88'; minimapCtx.beginPath(); minimapCtx.arc(pp.x,pp.y,4,0,Math.PI*2); minimapCtx.fill();
        const cd=new THREE.Vector3(); camera.getWorldDirection(cd); minimapCtx.strokeStyle='rgba(0,255,136,0.8)'; minimapCtx.lineWidth=1.5; minimapCtx.beginPath(); minimapCtx.moveTo(pp.x,pp.y); minimapCtx.lineTo(pp.x+cd.x*14,pp.y+cd.z*14); minimapCtx.stroke();
    }

    renderer.render(scene,camera);
    requestAnimationFrame(animate);
}
