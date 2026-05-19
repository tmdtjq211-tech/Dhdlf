// js/data.js
export const WEAPONS = {
    shotgun: { id: 'shotgun', name: '헬파이어 샷건', type: 'shotgun', fireRate: 700, dmgMulti: 0.4, speed: 180, count: 6, color: 0xff3300, desc: "좁은 골목길 단기 결전에 유리. 아레스와 찰떡궁합." },
    sniper: { id: 'sniper', name: '레일건 스나이퍼', type: 'sniper', fireRate: 1400, dmgMulti: 2.5, speed: 450, count: 1, color: 0x00ff88, desc: "긴 복도에서 헤드샷 킬에 특화. 아르테미스 전용." },
    smg: { id: 'smg', name: '바이퍼 SMG', type: 'smg', fireRate: 110, dmgMulti: 0.22, speed: 250, count: 1, color: 0xffdd00, desc: "이동 사격과 초고속 연사. 헤르메스 추천." },
    launcher: { id: 'launcher', name: '플라즈마 런처', type: 'launcher', fireRate: 900, dmgMulti: 1.0, speed: 100, count: 1, color: 0x00aaff, aoe: 18, desc: "착탄 시 폭발. 벽 뒤에 숨은 적도 제압. 포세이돈 특화." }
};

export const SECONDARY_WEAPON = { name:'전술 권총', type:'pistol', fireRate: 400, dmgMulti: 0.6, speed: 200, count: 1, color: 0xcccccc };

export const mazeMap = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,3,0,0,0,1,0,2,0,1,0,0,0,3,1],
    [1,1,1,1,0,1,0,1,0,1,0,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,1,1,1,1,0,1,1,1,0,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,1,0,0,1,0,1],
    [1,0,1,0,1,1,1,1,0,1,1,0,1,0,1],
    [1,2,0,0,1,4,0,1,0,0,0,0,0,2,1], 
    [1,0,1,0,1,1,1,1,0,1,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,1,0,0,1,0,1],
    [1,0,1,1,1,1,0,1,1,1,0,1,1,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,1,1,1,0,1,0,1,0,1,0,1,1,1,1],
    [1,3,0,0,0,1,0,5,0,1,0,0,0,0,1], 
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];