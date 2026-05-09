// main.js
// ゲームのメインロジック、描画、通信、UI制御

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const aspect = window.innerHeight / window.innerWidth;
    const dpr = window.devicePixelRatio || 1;
    
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    
    window.TILE_SIZE = canvas.width / window.VIEW_COLS;
    window.VIEW_W = window.VIEW_COLS + 2;
    window.VIEW_H = Math.ceil(canvas.height / window.TILE_SIZE) + 2;
    
    const sh = window.innerHeight;
    const th = sh >= 812 ? 98 : 74;
    document.getElementById('top-ui').style.top = (th + 10) + 'px';
    document.getElementById('boss-hp-container').style.top = (th + 10) + 'px';
}
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); if(window.gameState === 'playing') render(); });

// --- 画像の読み込み処理 ---
const imgPlayer = new Image(); imgPlayer.crossOrigin = "Anonymous"; imgPlayer.src = window.GameData.images.player;
imgPlayer.onload = () => { document.getElementById('ui-icon').style.backgroundImage = `url(${imgPlayer.src})`; };

const imgEnemy = new Image(); imgEnemy.crossOrigin = "Anonymous"; imgEnemy.src = window.GameData.images.enemy;
const imgReaper = new Image(); imgReaper.crossOrigin = "Anonymous"; imgReaper.src = window.GameData.images.reaper;
const imgJumboGrime = new Image(); imgJumboGrime.crossOrigin = "Anonymous"; imgJumboGrime.src = window.GameData.images.jumboGrime;
const imgGrabot = new Image(); imgGrabot.crossOrigin = "Anonymous"; imgGrabot.src = window.GameData.images.grabot;
const imgGraspider = new Image(); imgGraspider.crossOrigin = "Anonymous"; imgGraspider.src = window.GameData.images.graspider;

let imgStairs = new Image(); let imgHpPotion = new Image(); let imgSpPotion = new Image(); let imgStar = new Image();
imgStairs.crossOrigin = "Anonymous"; imgStairs.src = window.GameData.images.stairs;
imgHpPotion.crossOrigin = "Anonymous"; imgHpPotion.src = window.GameData.images.hpPotion;
imgSpPotion.crossOrigin = "Anonymous"; imgSpPotion.src = window.GameData.images.spPotion;
imgStar.crossOrigin = "Anonymous"; imgStar.src = window.GameData.images.coin;

imgStar.onload = () => {
    const uiIcon = document.getElementById('ui-star-icon');
    if(uiIcon) {
        uiIcon.src = imgStar.src;
        uiIcon.style.display = 'inline-block';
        const uiText = document.getElementById('ui-star-icon-text');
        if(uiText) uiText.style.display = 'none';
    }
};

function getPreloadedImage(key) {
    if (key === 'hpPotion') return imgHpPotion;
    if (key === 'spPotion') return imgSpPotion;
    if (key === 'coin') return imgStar;
    return null;
}

function processTransparentImage(src, targetImg) {
    let img = new Image(); img.crossOrigin = "Anonymous";
    img.onload = () => {
        try {
            let cvs = document.createElement('canvas'); cvs.width = img.width; cvs.height = img.height; 
            let cCtx = cvs.getContext('2d'); cCtx.drawImage(img, 0, 0);
            let imgData = cCtx.getImageData(0, 0, cvs.width, cvs.height); let data = imgData.data; let stack = [];
            for(let x=0; x<cvs.width; x++) { stack.push(x, 0); stack.push(x, cvs.height-1); }
            for(let y=0; y<cvs.height; y++) { stack.push(0, y); stack.push(cvs.width-1, y); }
            let visited = new Uint8Array(cvs.width * cvs.height);
            while(stack.length > 0) {
                let y = stack.pop(), x = stack.pop(); let idx = y * cvs.width + x; if(visited[idx]) continue; visited[idx] = 1; let pIdx = idx * 4;
                if(data[pIdx] > 200 && data[pIdx+1] > 200 && data[pIdx+2] > 200) { data[pIdx+3] = 0; if(x>0) stack.push(x-1, y); if(x<cvs.width-1) stack.push(x+1, y); if(y>0) stack.push(x, y-1); if(y<cvs.height-1) stack.push(x, y+1); }
            }
            cCtx.putImageData(imgData, 0, 0); targetImg.src = cvs.toDataURL(); 
            if (window.gameState === 'playing' && document.getElementById('tab-item').style.display === 'grid') window.renderInventory();
        } catch(e) {
            console.warn("画像透過処理でエラー(CORS等の影響):", e);
        }
    }; img.src = src;
}
processTransparentImage(imgStairs.src, imgStairs); 
processTransparentImage(imgHpPotion.src, imgHpPotion); 
processTransparentImage(imgSpPotion.src, imgSpPotion);

// --- UI・ボタン関連 ---
document.getElementById('btn-sound').onclick = (e) => {
    e.stopPropagation(); 
    let enabled = window.AudioEngine ? window.AudioEngine.toggleSound() : false;
    document.getElementById('btn-sound').innerText = enabled ? '🔊 ON' : '🔇 OFF';
    if(enabled) { 
        if (window.AudioEngine.audioCtx.state === 'suspended') window.AudioEngine.audioCtx.resume(); 
        if (window.gameState === 'title' || window.gameState === 'lobby') window.AudioEngine.startTitleBGM(); 
        else if (window.game.isBossFloor) window.AudioEngine.startBossBGM(); 
        else if (!window.game.bossSpawned) window.AudioEngine.startDungeonBGM(); 
    } else {
        if(window.AudioEngine) window.AudioEngine.stopBGM();
    }
};

function sendChat() {
    const input = document.getElementById('chat-input'); const msg = input.value.trim();
    if(msg) {
        if (window.game.debugMode && window.selectedDebugStat && /^\d+$/.test(msg)) {
            let val = Number(msg); 
            broadcast({ type: 'DEBUG_EDIT_STAT', stat: window.selectedDebugStat, val: val, targetEnemyId: window.currentDebugEnemy ? window.currentDebugEnemy.id : null, targetPlayerId: window.Network.myId });
            window.selectedDebugStat = null; 
            if(typeof window.setSelectedStatElement === 'function') window.setSelectedStatElement(null); 
            updateUI();
        } else { 
            broadcast({ type: 'CHAT', text: msg, name: window.Network.myName }); 
        }
        input.value = '';
    }
}
window.sendChat = sendChat;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).style.display = (tabId === 'item') ? 'grid' : 'flex';
    document.querySelector(`.tab-btn[onclick="if(window.switchTab) window.switchTab('${tabId}')"]`).classList.add('active');
    if (tabId === 'item' && typeof window.renderInventory === 'function') window.renderInventory();
}
window.switchTab = switchTab;

function showStatusWindow(targetId) {
    const p = window.game.players[targetId]; if(!p) return;
    const w = document.getElementById('status-window'); w.style.display = 'block';
    document.getElementById('st-username').innerText = p.name;
    document.getElementById('st-lvl').innerText = p.level;
    document.getElementById('st-exp').innerText = p.exp;
    document.getElementById('st-nextexp').innerText = Math.pow(p.level, 3) + 1;
    
    document.getElementById('st-hp').innerText = Math.floor(p.hp); document.getElementById('st-maxhp').innerText = p.maxHp;
    document.getElementById('st-sp').innerText = Math.floor(p.sp); document.getElementById('st-maxsp').innerText = p.maxSp;
    
    let atkStr = p.baseAtk; if (p.atkBonus > 0) atkStr += ` (+${p.atkBonus})`; else if (p.atkBonus < 0) atkStr += ` (${p.atkBonus})`;
    let defStr = p.baseDef; if (p.defBonus > 0) defStr += ` (+${p.defBonus})`; else if (p.defBonus < 0) defStr += ` (${p.defBonus})`;
    document.getElementById('st-atk').innerText = atkStr; document.getElementById('st-def').innerText = defStr;
    
    if(targetId === window.Network.myId) {
        document.getElementById('st-equip-section').style.display = 'block';
        document.getElementById('st-weap').innerText = window.game.equipment.weapon ? window.game.equipment.weapon.name : 'なし';
        document.getElementById('st-arm').innerText = window.game.equipment.armor ? window.game.equipment.armor.name : 'なし';
        document.getElementById('st-acc').innerText = window.game.equipment.accessory ? window.game.equipment.accessory.name : 'なし';
    } else { document.getElementById('st-equip-section').style.display = 'none'; }
}
window.showStatusWindow = showStatusWindow;

function selectTargetIcon(id) {
    if (window.game.skillMode) {
        let target = window.game.players[id];
        if (target) {
            if(window.game.skillMode === 'heal' && target.hp <= 0) { if(typeof window.logMsg==='function') window.logMsg("倒れている味方に近づくか、ポーションを投げてください！"); cancelActionMode(); return; }
            let dist = window.getDistance(window.game.player.x, window.game.player.y, target.x, target.y);
            if (dist <= window.VIEW_W/2 + 1) { useSkill(window.game.skillMode, target); cancelActionMode(); } 
            else { window.game.player.autoTarget = target; window.game.player.queuedSkill = window.game.skillMode; cancelActionMode(); if(typeof window.logMsg==='function') window.logMsg("対象に近づきます..."); }
        }
    } else { showStatusWindow(id); switchTab('log'); }
}
window.selectTargetIcon = selectTargetIcon;

// --- Network ---
const Network = {
    isMock: true, isHost: true, myId: 'local_' + Math.floor(Math.random()*1000), myName: 'プレイヤー', myPortrait: imgPlayer.src,
    roomId: null, players: {}, 

    async safeCall(promiseFunc, timeoutMs = 800) {
        if (!window.AgentSDK) return null;
        return Promise.race([
            promiseFunc(),
            new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))
        ]).catch(e => {
            console.warn("SDK API Error:", e);
            return null;
        });
    },

    async init(forceMock = false) {
        try {
            if (window.AgentSDK && window.AgentSDK.user && typeof window.AgentSDK.user.getMyUserInfo === 'function') {
                const res = await this.safeCall(() => window.AgentSDK.user.getMyUserInfo());
                if (res && res.errno === 0 && res.data) {
                    if (!forceMock) {
                        this.isMock = false; 
                    }
                    this.myId = String(res.data.user_id || this.myId);
                    this.myName = res.data.name || this.myName; 
                    this.myPortrait = res.data.portrait || this.myPortrait;
                    document.getElementById('ui-username').innerText = `${this.myName} (Lv.1)`; 
                    document.getElementById('ui-icon').style.backgroundImage = `url(${this.myPortrait})`;
                } else {
                    if (!forceMock) this.isMock = true;
                }
            } else {
                if (!forceMock) this.isMock = true;
            }
        } catch(e) {
            if (!forceMock) this.isMock = true;
        }
        this.players[this.myId] = { id: this.myId, name: this.myName, portrait: this.myPortrait, isHost: true };
    },

    async createRoom(isPrivate = false) {
        if(this.isMock || !window.AgentSDK || !window.AgentSDK.room) {
            this.roomId = 'mock_room_' + Math.floor(Math.random()*1000);
            this.isHost = true;
            return true;
        }
        const res = await this.safeCall(() => window.AgentSDK.room.create({ max_players: 4, room_permission: isPrivate ? 1 : 0 }));
        if (res && res.errno === 0) { 
            this.roomId = res.data.room_id; this.isHost = true; this.players[this.myId].isHost = true; this.setupListener(); return true; 
        }
        return false;
    },

    async joinRoom(roomId) {
        if(this.isMock || !window.AgentSDK || !window.AgentSDK.room) {
            this.roomId = roomId; this.isHost = false; return true;
        }
        const res = await this.safeCall(() => window.AgentSDK.room.join({ room_id: roomId }));
        if (res && res.errno === 0) {
            this.roomId = roomId; this.isHost = false; this.players[this.myId].isHost = false;
            res.data.user_list.forEach(u => { this.players[String(u.user_id)] = { id: String(u.user_id), name: u.name, portrait: u.portrait, isHost: false }; });
            this.setupListener(); broadcast({ type: 'REQ_HOST' }); return true;
        }
        return false;
    },

    async getPublicRooms() {
        if (this.isMock || !window.AgentSDK || !window.AgentSDK.room) return [];
        const res = await this.safeCall(() => window.AgentSDK.room.getPublicRoomList());
        if (res && res.errno === 0) return res.data.list || []; 
        return [];
    },

    setupListener() {
        if (!window.AgentSDK || !window.AgentSDK.room || this.isMock) return;
        window.AgentSDK.room.receiveMessage((payload) => {
            if (payload.type === 'aitools_game_joinroom') {
                let u = payload.data; this.players[String(u.user_id)] = { id: String(u.user_id), name: u.user_name, portrait: u.portait, isHost: false };
                if(this.isHost) broadcast({ type: 'HOST_DECLARE', hostId: this.myId }); updateLobbyUI();
            } else if (payload.type === 'aitools_game_exitroom') {
                delete this.players[String(payload.data.user_id)]; if(window.gameState === 'lobby') updateLobbyUI(); else updateUI();
            } else if (payload.type === 'aitools_game_sendmsg') {
                try { let msg = JSON.parse(payload.data.msg_data); msg.senderId = String(payload.data.user_id); handleNetworkMessage(msg); } catch(e) {}
            }
        });
    }
};
window.Network = Network;

function broadcast(msg) {
    msg.senderId = window.Network.myId; 
    
    if (window.Network.isMock || !window.AgentSDK || !window.AgentSDK.room) { 
        handleNetworkMessage(msg); 
    } else { 
        try {
            window.AgentSDK.room.sendMessage({ message: JSON.stringify(msg) }); 
        } catch(e) {
            console.error("SDKルーム通信エラー:", e);
        }
        handleNetworkMessage(msg); 
    }
}
window.broadcast = broadcast;

// === ボタンイベント ===
document.getElementById('btn-start').onclick = () => { 
    try {
        // 先に画面を確実に切り替える
        document.getElementById('title-screen').style.display = 'none'; 
        document.getElementById('mode-screen').style.display = 'flex'; 
        
        // 音楽エンジンがブロックされていてもフリーズしないように安全に処理
        if (window.AudioEngine) {
            // audioCtx が存在するか、関数が存在するかを厳密にチェック
            if (window.AudioEngine.audioCtx && typeof window.AudioEngine.audioCtx.resume === 'function') {
                if (window.AudioEngine.audioCtx.state === 'suspended') {
                    window.AudioEngine.audioCtx.resume().catch(e => console.warn("Audio resume error:", e));
                }
            }
            if (typeof window.AudioEngine.startTitleBGM === 'function') {
                window.AudioEngine.startTitleBGM(); 
            }
        }
    } catch(e) {
        console.error("STARTボタン処理エラー:", e);
        // 万が一エラーが起きても強制的に次へ進める
        document.getElementById('title-screen').style.display = 'none'; 
        document.getElementById('mode-screen').style.display = 'flex'; 
    }
};

document.getElementById('btn-solo').onclick = async () => { 
    document.getElementById('mode-screen').style.display = 'none'; 
    window.Network.isMock = true; 
    await window.Network.init(true); 
    startGameSession(); 
};

document.getElementById('btn-multi').onclick = async () => { 
    document.getElementById('mode-screen').style.display = 'none'; 
    window.Network.isMock = false; 
    await window.Network.init(false); 
    document.getElementById('room-list-screen').style.display = 'flex'; 
    refreshRoomList(); 
};

document.getElementById('btn-refresh').onclick = refreshRoomList;
document.getElementById('btn-create-pub').onclick = async () => { if(await window.Network.createRoom(false)) enterLobby(); };
document.getElementById('btn-create-priv').onclick = async () => { if(await window.Network.createRoom(true)) enterLobby(); };
document.getElementById('btn-back-mode').onclick = () => { document.getElementById('room-list-screen').style.display = 'none'; document.getElementById('mode-screen').style.display = 'flex'; };
document.getElementById('btn-start-game').onclick = () => { broadcast({ type: 'START_GAME' }); };
document.getElementById('btn-return-title').onclick = () => { location.reload(); };

async function refreshRoomList() {
    const rc = document.getElementById('room-list-container'); rc.innerHTML = '<p>読込中...</p>';
    const list = await window.Network.getPublicRooms(); rc.innerHTML = '';
    if(list.length === 0) { rc.innerHTML = '<p>公開ルームはありません。</p>'; return; }
    list.forEach(r => {
        const div = document.createElement('div'); div.style.padding = '10px'; div.style.borderBottom = '1px solid #555'; div.style.display = 'flex'; div.style.justifyContent = 'space-between';
        div.innerHTML = `<span>Room ${r.room_id} (${r.gamer_num}/${r.max_players})</span> <button class="small-btn" onclick="joinRoom('${r.room_id}')">参加</button>`; rc.appendChild(div);
    });
}
window.joinRoom = async (id) => { if(await window.Network.joinRoom(id)) enterLobby(); };

function enterLobby() { document.getElementById('room-list-screen').style.display = 'none'; document.getElementById('lobby-screen').style.display = 'flex'; updateLobbyUI(); }

function updateLobbyUI() {
    const lc = document.getElementById('lobby-players-container'); lc.innerHTML = '';
    for(let id in window.Network.players) {
        let p = window.Network.players[id]; lc.innerHTML += `<div style="text-align:center; background:#333; padding:10px; border-radius:8px; border:2px solid #555;"><img src="${p.portrait}" style="width:50px; height:50px; border-radius:50%; background:#fff; object-fit:cover; margin-bottom:5px;"><div style="font-size:12px;">${p.name}</div></div>`;
    }
    if(window.Network.isHost) { document.getElementById('lobby-status-text').innerText = 'メンバーが揃ったら開始してください。'; document.getElementById('btn-start-game').style.display = 'block'; } 
    else { document.getElementById('lobby-status-text').innerText = 'ホストの開始を待っています...'; document.getElementById('btn-start-game').style.display = 'none'; }
}

function startGameSession() {
    window.gameState = 'playing'; document.getElementById('lobby-screen').style.display = 'none'; 
    if(window.AudioEngine) window.AudioEngine.stopBGM();
    document.getElementById('top-ui').style.display = 'flex'; document.getElementById('left-bottom-ui').style.display = 'flex'; document.getElementById('minimap-container').style.display = 'block';
    if (window.game.floor === 0) window.game.floor = 1; startFloorTransitionHost();
}

function startFloorTransitionHost() {
    if (!window.Network.isHost) return;
    window.game.timeLeft = 100; window.game.bossSpawned = false; window.game.bossEnt = null; window.game.hasKey = false;
    document.getElementById('ui-timer-text').style.color = 'white'; document.getElementById('ui-timer').style.display = 'flex';
    document.getElementById('red-flash').style.display = 'none'; document.getElementById('ui-key-status').innerText = "未取得"; document.getElementById('ui-key-status').style.color = "gray";
    
    if(typeof window.generateMapHost === 'function') window.generateMapHost();
    
    let playerPosList = {}; let offsets = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]]; let idx = 0; 
    let startX = 0, startY = 0;
    if(window.game.rooms && window.game.rooms.length > 0) {
        startX = window.game.rooms[0].x + Math.floor(window.game.rooms[0].w/2); startY = window.game.rooms[0].y + Math.floor(window.game.rooms[0].h/2);
    }
    for(let id in window.Network.players) { if(id === window.Network.myId) playerPosList[id] = { x: startX, y: startY }; else { let off = offsets[idx++]; playerPosList[id] = { x: startX+off[0], y: startY+off[1] }; } }
    
    let pStats = {};
    for(let id in window.game.players) { let p = window.game.players[id]; pStats[id] = { level: p.level, exp: p.exp, hp: p.hp, sp: p.sp }; }

    let entData = window.game.entities.filter(e => e.type !== 'player').map(e => ({ id: e.id, x: e.x, y: e.y, type: e.type, maxHp: e.maxHp, hp: e.hp, atk: e.baseAtk, def: e.baseDef, baseHpVal: e.baseHpVal, baseAtkVal: e.baseAtkVal, baseDefVal: e.baseDefVal, isKeyMonster: e.isKeyMonster }));
    
    broadcast({
        type: 'MAP_INIT', map: window.game.map, rooms: window.game.rooms, roomMap: window.game.roomMap, items: window.game.items, enemies: entData,
        playerPosList: playerPosList, playerStats: pStats, floor: window.game.floor, stairsPos: window.game.stairsPos, isBossFloor: window.game.isBossFloor, floorType: window.game.floorType
    });
}

function triggerVisualTransition(floorNum) {
    window.game.floor = floorNum; window.game.isTransitioning = true; 
    if(window.AudioEngine) window.AudioEngine.stopBGM();
    document.getElementById('ui-timer-text').style.color = 'white'; document.getElementById('ui-timer').style.display = 'flex';
    document.getElementById('red-flash').style.display = 'none'; document.getElementById('ui-key-status').innerText = window.game.hasKey ? "取得済" : "未取得"; document.getElementById('ui-key-status').style.color = window.game.hasKey ? "yellow" : "gray";
    
    const trans = document.getElementById('floor-transition'); trans.style.display = 'flex'; trans.innerHTML = `<h1>地下${floorNum}階</h1>`;
    trans.style.transition = 'opacity 0.5s'; trans.style.opacity = 1;
    
    setTimeout(() => { trans.style.opacity = 0; setTimeout(() => { trans.style.display = 'none'; window.game.isTransitioning = false; window.game.spawnGraceTimer = 1.0; window.game.timeLeft = 100; updateUI(); }, 500); }, 1500);
    
    if(window.game.debugMode) {
        for(let y=0; y<window.game.height; y++) {
            for(let x=0; x<window.game.width; x++) {
                if(window.game.map[y] && window.game.map[y][x] !== undefined && window.game.map[y][x] !== 1) window.game.discoveredMap[y][x] = true;
            }
        }
    }
}
window.triggerVisualTransition = triggerVisualTransition;

function handleNetworkMessage(msg) {
    if (msg.type === 'REQ_HOST' && window.Network.isHost) broadcast({ type: 'HOST_DECLARE', hostId: window.Network.myId });
    if (msg.type === 'HOST_DECLARE') { if (msg.hostId !== window.Network.myId) window.Network.isHost = false; for(let id in window.Network.players) window.Network.players[id].isHost = (id === msg.hostId); updateLobbyUI(); }
    if (msg.type === 'START_GAME') startGameSession();
    if (msg.type === 'DEBUG_TIME_ZERO') { window.game.timeLeft = 0; }
    if (msg.type === 'DEBUG_EDIT_STAT') {
        let val = msg.val;
        if (msg.stat.startsWith('ENEMY_')) {
            let en = window.game.entities.find(e => e.id === msg.targetEnemyId);
            if (en) {
                if (msg.stat === 'ENEMY_HP') { en.hp = val; en.maxHp = val; }
                else if (msg.stat === 'ENEMY_MAX_HP') { en.maxHp = val; }
                else if (msg.stat === 'ENEMY_ATK') { en.baseAtk = val; en.baseAtkVal = val; }
                else if (msg.stat === 'ENEMY_DEF') { en.baseDef = val; en.baseDefVal = val; }
                if (typeof window.currentDebugEnemy !== 'undefined' && window.currentDebugEnemy && window.currentDebugEnemy.id === en.id) window.showEnemyStatusWindow(en);
            }
        } else if (msg.stat === 'FLOOR') { window.game.floor = val; if(msg.targetPlayerId === window.Network.myId && typeof window.logMsg==='function') window.logMsg(`[Debug] FLOOR を ${val} に変更しました。`); }
        else if (msg.stat === 'STARS') { window.game.stars = val; if(msg.targetPlayerId === window.Network.myId && typeof window.logMsg==='function') window.logMsg(`[Debug] STARS を ${val} に変更しました。`); }
        else {
            let p = window.game.players[msg.targetPlayerId];
            if (p) {
                if (msg.stat === 'HP') p.hp = val; 
                else if (msg.stat === 'MAX_HP') p.maxHp = val;
                else if (msg.stat === 'SP') p.sp = val; 
                else if (msg.stat === 'MAX_SP') p.maxSp = val;
                else if (msg.stat === 'ATK') { p.baseAtk = val; p.baseInitialAtk = val / (1.0 + p.level * 0.1); }
                else if (msg.stat === 'DEF') { p.baseDef = val; p.baseInitialDef = val / (1.0 + p.level * 0.1); }
                else if (msg.stat === 'LEVEL') { p.level = val; p.exp = val > 1 ? Math.pow(val - 1, 3) + 1 : 0; p.recalcLevelStats(); p.hp = p.maxHp; p.sp = p.maxSp; }
                
                if (p.id === window.Network.myId) {
                    if(['HP','MAX_HP','SP','MAX_SP','ATK','DEF','LEVEL'].includes(msg.stat)) { recalcStats(); showStatusWindow(window.Network.myId); }
                    if(typeof window.logMsg==='function') window.logMsg(`[Debug] ${msg.stat} を ${val} に変更しました。`);
                }
            }
        }
        updateUI();
    }

    if (msg.type === 'MAP_INIT') {
        window.game.map = msg.map; window.game.rooms = msg.rooms; window.game.roomMap = msg.roomMap; window.game.floor = msg.floor;
        window.game.stairsPos = msg.stairsPos; window.game.items = msg.items; window.game.isBossFloor = msg.isBossFloor; window.game.bossFloorCleared = false;
        window.game.floorType = msg.floorType || 'dungeon';
        window.game.width = msg.map[0].length; window.game.height = msg.map.length;
        window.game.discoveredMap = Array.from({length: window.game.height}, () => new Array(window.game.width).fill(false));
        window.game.entities = []; window.game.players = {}; window.game.bossEnt = null; window.game.bossSpawned = false; window.game.hasKey = false;
        
        for(let id in msg.playerPosList) {
            let pos = msg.playerPosList[id]; 
            if(typeof window.Player === 'undefined') { console.error("Player class not found!"); continue; }
            let p = new window.Player(pos.x, pos.y); p.id = id;
            p.name = window.Network.players[id] ? window.Network.players[id].name : 'Player'; p.portrait = window.Network.players[id] ? window.Network.players[id].portrait : '';
            if (msg.playerStats && msg.playerStats[id]) {
                p.level = msg.playerStats[id].level || 1; p.exp = msg.playerStats[id].exp || 0;
                p.recalcLevelStats(); p.hp = msg.playerStats[id].hp !== undefined ? msg.playerStats[id].hp : p.maxHp; p.sp = msg.playerStats[id].sp !== undefined ? msg.playerStats[id].sp : p.maxSp;
            }
            window.game.players[id] = p; window.game.entities.push(p); if(id === window.Network.myId) { window.game.player = p; window.game.player.onMoveComplete(); }
        }
        
        msg.enemies.forEach(eData => {
            let e;
            if(eData.type === 'boss') { e = new window.Boss(eData.x, eData.y, window.game.floor); window.game.bossEnt = e; window.game.bossSpawned = true; }
            else if(eData.type === 'jumbo_boss') { e = new window.JumboGrime(eData.x, eData.y, window.game.floor); }
            else if(eData.type === 'wraith') e = new window.Wraith(eData.x, eData.y, window.game.floor, 444);
            else if(eData.type === 'grabot') e = new window.Grabot(eData.x, eData.y, window.game.floor);
            else if(eData.type === 'graspider') e = new window.Graspider(eData.x, eData.y, window.game.floor);
            else e = new window.Enemy(eData.x, eData.y, eData.baseHpVal, eData.baseAtkVal, eData.baseDefVal);
            
            e.id = eData.id; e.hp = eData.hp; e.maxHp = eData.maxHp; e.isKeyMonster = eData.isKeyMonster;
            window.game.entities.push(e);
        });
        
        triggerVisualTransition(window.game.floor);
    }
    
    if (msg.type === 'PLY_UPDATE' && msg.senderId !== window.Network.myId) {
        let p = window.game.players[msg.senderId];
        if (p) {
            p.hp = msg.hp; p.massageProgress = msg.massageProgress || 0;
            if (p.targetX !== msg.targetX || p.targetY !== msg.targetY) { p.x = msg.x; p.y = msg.y; p.targetX = msg.targetX; p.targetY = msg.targetY; p.isMoving = true; p.moveTimer = 0; } 
            else if (!p.isMoving) { p.x = msg.x; p.y = msg.y; }
        }
    }
    
    if (msg.type === 'ENT_UPDATE') {
        if (window.Network.isHost) return; 
        msg.ents.forEach(eData => {
            let e = window.game.entities.find(en => en.id === eData.id);
            if (e) {
                e.hp = eData.hp; e.state = eData.state;
                if(eData.skillIdx !== undefined) e.skillIdx = eData.skillIdx;
                if(eData.skillTargets !== undefined) e.skillTargets = eData.skillTargets;
                if(eData.tackleDir !== undefined) e.tackleDir = eData.tackleDir;
                if(eData.jumpTarget !== undefined) e.jumpTarget = eData.jumpTarget;
                if(eData.stunTimer !== undefined) e.stunTimer = eData.stunTimer; 

                if (e.targetX !== eData.targetX || e.targetY !== eData.targetY) { e.x = eData.x; e.y = eData.y; e.targetX = eData.targetX; e.targetY = eData.targetY; e.isMoving = true; e.moveTimer = 0; } 
                else if (!e.isMoving) { e.x = eData.x; e.y = eData.y; }
                if(e.hp <= 0) e.die();
            }
        });
        window.game.timeLeft = msg.timeLeft;
        if(msg.bossSpawned && !window.game.bossSpawned) {
            window.game.bossSpawned = true; document.getElementById('red-flash').style.display = 'block'; document.getElementById('ui-timer').style.display = 'none'; if(typeof window.logMsg==='function') window.logMsg("死神が現れた！！！"); if(window.AudioEngine) window.AudioEngine.stopBGM();
            let bData = msg.ents.find(x => x.type === 'boss'); if(bData && !window.game.entities.find(en => en.id === bData.id)) { let b = new window.Boss(bData.x, bData.y, window.game.floor); b.id = bData.id; window.game.entities.push(b); window.game.bossEnt = b; }
        }
    }

    if (msg.type === 'PLAY_EFFECT') { 
        window.game.effects.push({ type: msg.effectType, x: msg.x, y: msg.y, dirX: msg.dirX, dirY: msg.dirY, timer: msg.timer }); 
        if(msg.shake >= 0.8) {
            if(window.AudioEngine) window.AudioEngine.playNoise(0.4, 0.6, true); 
            if(window.game.shakeTimer < msg.shake) window.game.shakeTimer = msg.shake; 
        } else if(msg.shake > 0) { 
            if(window.game.shakeTimer < msg.shake) window.game.shakeTimer = msg.shake; 
            if(window.AudioEngine) window.AudioEngine.seAttack(); 
        } 
    }
    if (msg.type === 'ENEMY_ATK_START') { if (window.Network.isHost) return; let e = window.game.entities.find(en => en.id === msg.attackerId); let target = window.game.players[msg.targetId]; if (e && target) { e.isAttacking = true; e.attackTimer = 0; e.attackTarget = target; e.nextAttackIsSkill = msg.isSkill; if(window.AudioEngine) window.AudioEngine.seAttack(); } }
    if (msg.type === 'ATK_ENEMY' && window.Network.isHost) { let e = window.game.entities.find(en => en.id === msg.targetId); if(e && e.hp > 0) { let attacker = window.game.players[msg.senderId]; if(attacker) e.takeDamage(msg.dmg, attacker); } }
    if (msg.type === 'ATK_PLAYER') { let p = window.game.players[msg.targetId]; let attacker = window.game.entities.find(en => en.id === msg.attackerId); if(p) p.takeDamage(msg.dmg, attacker); }
    if (msg.type === 'MAP_BREAK') { 
        if(window.AudioEngine) window.AudioEngine.playNoise(0.2, 0.4, true); 
        for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { let nx=msg.x+dx, ny=msg.y+dy; if(window.game.map[ny] && window.game.map[ny][nx] === 1) { window.game.map[ny][nx] = 0; window.game.discoveredMap[ny][nx] = true; } } 
    }
    if (msg.type === 'ITEM_DEL') { let idx = window.game.items.findIndex(i => i.x === msg.x && i.y === msg.y); if(idx !== -1) window.game.items.splice(idx, 1); }
    if (msg.type === 'ITEMS_SYNC') { window.game.items = msg.items; }
    if (msg.type === 'EXP_GAIN') { let p = window.game.players[msg.targetId]; if (p) p.addExp(msg.exp); }
    if (msg.type === 'KEY_OBTAINED') { window.game.hasKey = true; if(typeof window.logMsg==='function') window.logMsg(`${msg.name}が鍵を入手した！`); if(window.AudioEngine) window.AudioEngine.seKey(); document.getElementById('ui-key-status').innerText = "取得済"; document.getElementById('ui-key-status').style.color = "yellow"; let p = window.game.players[msg.senderId]; if(p) p.showKeyTimer = 2.0; }
    if (msg.type === 'BOSS_FLOOR_CLEAR') { window.game.bossFloorCleared = true; window.game.map[msg.y][msg.x] = 2; window.game.hasKey = true; if(typeof window.logMsg==='function') window.logMsg("階段が出現した…"); if(window.AudioEngine) { window.AudioEngine.seStairs(); window.AudioEngine.stopBGM(); } }
    if (msg.type === 'LOG') { if(typeof window.logMsg==='function') window.logMsg(msg.text); }
    if (msg.type === 'CHAT') {
        let text = `<span style="color:#aaffaa">[チャット]</span> ${msg.name}: ${msg.text}`; document.getElementById('chat-history').innerHTML += `<div>${text}</div>`; document.getElementById('chat-history').scrollTop = document.getElementById('chat-history').scrollHeight; if(typeof window.logMsg==='function') window.logMsg(text);
        let p = window.game.players[msg.senderId]; if(p) { p.chatText = msg.text; p.chatTimer = 5.0; }
        if(msg.senderId === window.Network.myId) { const b = document.getElementById('my-chat-bubble'); b.innerText = msg.text; b.style.display = 'block'; setTimeout(() => { b.style.display = 'none'; }, 5000); }
    }
    if (msg.type === 'REVIVE') { let p = window.game.players[msg.targetId]; if(p) { p.hp = msg.hp; p.state = 'alive'; p.massageProgress = 0; if(typeof window.logMsg==='function') window.logMsg(`${p.name}が復活した！`); if(window.AudioEngine) window.AudioEngine.seUseItem(); window.game.effects.push({type:'stars', x:p.x, y:p.y, timer:0.5}); } }
    if (msg.type === 'GAME_OVER') {
        window.game.isGameOver = true; document.getElementById('game-over').style.display = 'flex'; document.getElementById('go-floor').innerText = window.game.floor; if(window.AudioEngine) window.AudioEngine.stopBGM();
        try { window.parent.postMessage({ type: 'gameOver', score: window.game.floor }, '*'); } catch(e){}
    }
}
window.handleNetworkMessage = handleNetworkMessage;

// --- インベントリ・アイテム UI ---
function openItemStatusWindow(item) {
    const w = document.getElementById('item-status-window');
    w.style.display = 'block';
    document.getElementById('ist-name').innerText = item.name;
    
    const itemDef = window.ItemData ? window.ItemData[item.type] : null;
    let iconHtml = "";
    
    if (itemDef) {
        if (itemDef.iconType === 'image' && window.GameData) {
            iconHtml = `<img src="${window.GameData.images[itemDef.iconUrlKey]}" style="width:48px;height:48px; object-fit:contain;">`;
        } else if (itemDef.iconType === 'emoji') {
            iconHtml = itemDef.iconString;
        }
        document.getElementById('ist-effect').innerText = itemDef.effectText;
        document.getElementById('ist-flavor').innerText = itemDef.flavorText || "";
        
        const btnAct1 = document.getElementById('btn-ist-action1');
        if (itemDef.showAction1) {
            btnAct1.style.display = 'block';
            btnAct1.innerText = item.equipped ? "外す" : (itemDef.equipType ? "装備" : "使う");
        } else {
            btnAct1.style.display = 'none';
        }
    }
    document.getElementById('ist-icon-container').innerHTML = iconHtml;
}
window.openItemStatusWindow = openItemStatusWindow;

function renderInventory() {
    const panel = document.getElementById('tab-item'); panel.innerHTML = '';
    for (let i = 0; i < window.game.inventory.length; i++) {
        const item = window.game.inventory[i], slot = document.createElement('div');
        slot.style.width = '36px'; slot.style.height = '36px'; slot.style.background = '#222'; slot.style.border = '1px solid #555'; slot.style.display = 'flex'; slot.style.justifyContent = 'center'; slot.style.alignItems = 'center'; slot.style.position = 'relative'; slot.style.fontSize = '20px';
        
        if (item) {
            const itemDef = window.ItemData ? window.ItemData[item.type] : null;
            if (itemDef) {
                if (itemDef.iconType === 'image' && window.GameData) {
                    slot.innerHTML = `<img src="${window.GameData.images[itemDef.iconUrlKey]}" style="width:24px;height:24px; object-fit:contain;">`;
                } else if (itemDef.iconType === 'emoji') {
                    slot.innerHTML = itemDef.iconString;
                }
            }
            if(item.equipped) { 
                const eBadge = document.createElement('div'); eBadge.innerText = 'E'; eBadge.style.position = 'absolute'; eBadge.style.bottom = '-2px'; eBadge.style.right = '2px'; eBadge.style.color = '#ffd700'; eBadge.style.fontSize = '12px'; eBadge.style.fontWeight = 'bold'; slot.appendChild(eBadge); 
            }
            slot.onclick = (e) => {
                window.game.selectedItemIndex = i; 
                openItemStatusWindow(item);
            };
        } else if(window.game.debugMode) {
            slot.style.cursor = 'pointer';
            slot.onclick = (e) => {
                if(typeof window.showDebugItemMenu === 'function') window.showDebugItemMenu(e);
            };
        }
        panel.appendChild(slot);
    }
}
window.renderInventory = renderInventory;

document.getElementById('btn-ist-action1').onclick = () => {
    const item = window.game.inventory[window.game.selectedItemIndex];
    if (item) {
        const itemDef = window.ItemData ? window.ItemData[item.type] : null;
        let eType = itemDef ? itemDef.equipType : null;
        if (eType) {
            if (item.equipped) { 
                item.equipped = false; window.game.equipment[eType] = null; if(typeof window.logMsg==='function') window.logMsg(`${item.name}を外した。`); 
            } else { 
                if (window.game.equipment[eType]) window.game.equipment[eType].equipped = false; 
                item.equipped = true; window.game.equipment[eType] = item; if(typeof window.logMsg==='function') window.logMsg(`${item.name}を装備した！`); 
            } 
            if(window.AudioEngine) window.AudioEngine.seEquip(); recalcStats();
        } else {
            if (item.type === 'hp_potion') { window.game.player.hp = Math.min(window.game.player.maxHp, window.game.player.hp + window.game.player.maxHp * 0.5); if(typeof window.logMsg==='function') window.logMsg("HPを回復した！"); if(window.AudioEngine) window.AudioEngine.seUseItem(); window.game.inventory[window.game.selectedItemIndex] = null; } 
            else if (item.type === 'sp_potion') { window.game.player.sp = Math.min(window.game.player.maxSp, window.game.player.sp + window.game.player.maxSp * 0.5); if(typeof window.logMsg==='function') window.logMsg("SPを回復した！"); if(window.AudioEngine) window.AudioEngine.seUseItem(); window.game.inventory[window.game.selectedItemIndex] = null; }
        }
    }
    document.getElementById('item-status-window').style.display = 'none'; renderInventory(); updateUI();
};

document.getElementById('btn-ist-throw').onclick = () => {
    document.getElementById('item-status-window').style.display = 'none';
    window.game.throwMode = true; shrinkMinimap(); document.getElementById('btn-cancel-action').style.display = 'block'; document.getElementById('btn-cancel-action').innerText = '投げるのをやめる'; if(typeof window.logMsg==='function') window.logMsg("投げる方向を選んでください。");
};

document.getElementById('btn-ist-drop').onclick = () => {
    const item = window.game.inventory[window.game.selectedItemIndex];
    if (item) { 
        const itemDef = window.ItemData ? window.ItemData[item.type] : null;
        let eType = itemDef ? itemDef.equipType : null; 
        if (item.equipped && eType) { item.equipped = false; window.game.equipment[eType] = null; recalcStats(); } 
        item.x = window.game.player.x; item.y = window.game.player.y; window.game.items.push(item); window.game.inventory[window.game.selectedItemIndex] = null; if(typeof window.logMsg==='function') window.logMsg(`${item.name} を足元に置いた。`); broadcast({ type: 'ITEMS_SYNC', items: window.game.items }); 
    }
    document.getElementById('item-status-window').style.display = 'none'; renderInventory();
};

function cancelActionMode() { window.game.throwMode = false; window.game.skillMode = null; window.game.player.queuedSkill = null; document.getElementById('btn-cancel-action').style.display = 'none'; if(typeof window.logMsg==='function') window.logMsg("キャンセルした。"); }
window.cancelActionMode = cancelActionMode;
document.getElementById('btn-cancel-action').onclick = cancelActionMode;

function executeThrow(dx, dy) {
    window.game.throwMode = false; document.getElementById('btn-cancel-action').style.display = 'none'; let item = window.game.inventory[window.game.selectedItemIndex];
    if(item.equipped) { const itemDef = window.ItemData ? window.ItemData[item.type] : null; let eType = itemDef?itemDef.equipType:null; if(eType) { item.equipped = false; window.game.equipment[eType] = null; recalcStats(); } }
    window.game.inventory[window.game.selectedItemIndex] = null; renderInventory();
    let sx = window.game.player.x, sy = window.game.player.y, cx = sx, cy = sy, dist = 0, hitEnemy = null;
    while(dist < 5) { let nx = cx + dx, ny = cy + dy; if (nx<0 || nx>=window.game.width || ny<0 || ny>=window.game.height || window.game.map[ny][nx]===1) break; cx = nx; cy = ny; dist++; hitEnemy = window.game.entities.find(e => e.occupies(cx, cy) && e!==window.game.player); if(hitEnemy) break; }
    if(window.AudioEngine) window.AudioEngine.seAttack(); 
    window.game.projectiles.push(new window.Projectile(sx, sy, cx, cy, item, () => {
        if(hitEnemy) {
            if(item.type === 'hp_potion') { hitEnemy.hp = Math.min(hitEnemy.maxHp, hitEnemy.hp + hitEnemy.maxHp * 0.5); if(hitEnemy.type === 'player') broadcast({ type: 'REVIVE', targetId: hitEnemy.id, hp: hitEnemy.hp }); else if(typeof window.logMsg==='function') window.logMsg(`敵に${item.name}が当たり回復してしまった！`); } 
            else if(item.type === 'sp_potion') { if(hitEnemy.type === 'player') { hitEnemy.sp = Math.min(hitEnemy.maxSp, hitEnemy.sp + hitEnemy.maxSp * 0.5); if(typeof window.logMsg==='function') window.logMsg(`${hitEnemy.name}のSPが回復した！`); } else if(typeof window.logMsg==='function') window.logMsg(`敵に${item.name}が当たったが効果がない！`); }
            else { let dmg = Math.max(1, Math.round((window.game.player.baseAtk + window.game.player.atkBonus + (item.type==='sword'?5:2)) * (0.8+Math.random()*0.4))); if(hitEnemy.type !== 'player') broadcast({ type: 'ATK_ENEMY', targetId: hitEnemy.id, dmg: dmg }); }
        } else { item.x = cx; item.y = cy; window.game.items.push(item); if(typeof window.logMsg==='function') window.logMsg(`${item.name}が落ちた。`); broadcast({ type: 'ITEMS_SYNC', items: window.game.items }); }
    }));
}
window.executeThrow = executeThrow;

function activateSkill(skillId) {
    if(window.game.player.sp < 5) { if(typeof window.logMsg==='function') window.logMsg("SPが足りない！"); return; } if(window.minimapExpanded) shrinkMinimap();
    if(window.game.player.isAttacking || window.activeDragDir || window.game.player.path.length > 0) { window.game.player.queuedSkill = skillId; if(typeof window.logMsg==='function') window.logMsg("次の攻撃でスキル発動！"); } 
    else { window.game.skillMode = skillId; document.getElementById('btn-cancel-action').innerText = 'スキルキャンセル'; document.getElementById('btn-cancel-action').style.display = 'block'; if(typeof window.logMsg==='function') window.logMsg("対象を選んでください。"); }
}
window.activateSkill = activateSkill;

function useSkill(skillId, target) {
    let cost = 5; if(window.game.player.sp < cost) { if(typeof window.logMsg==='function') window.logMsg("SPが足りない！"); return; } window.game.player.sp -= cost;
    if(skillId === 'heal') {
        let pTarget = window.game.players[target.id];
        if(pTarget) {
            if(pTarget.hp <= 0) broadcast({ type: 'REVIVE', targetId: target.id, hp: Math.floor(pTarget.maxHp*0.5) });
            else { pTarget.hp = Math.min(pTarget.maxHp, pTarget.hp + window.game.player.maxHp * 0.5); if(typeof window.logMsg==='function') window.logMsg(`${pTarget.name}の体力を回復！`); if(window.AudioEngine) window.AudioEngine.seUseItem(); window.game.effects.push({type:'stars', x:pTarget.x, y:pTarget.y, timer:0.5}); broadcast({ type: 'PLY_UPDATE', x: pTarget.x, y: pTarget.y, hp: pTarget.hp, targetX: pTarget.targetX, targetY: pTarget.targetY, massageProgress: 0 }); }
        }
    } else if(skillId === 'strong_attack') { let dmg = window.calculateDamage(window.game.player, target, 3.0); if(window.AudioEngine) window.AudioEngine.seAttack(); window.game.shakeTimer = 0.5; if(target.type !== 'player') broadcast({ type: 'ATK_ENEMY', targetId: target.id, dmg: dmg }); }
    updateUI();
}
window.useSkill = useSkill;

function recalcStats() {
    window.game.player.atkBonus = 0; window.game.player.defBonus = 0;
    if (window.game.equipment.weapon) window.game.player.atkBonus += 5; if (window.game.equipment.armor) window.game.player.defBonus += 3; if (window.game.equipment.accessory) window.game.player.atkBonus += 2;
}
window.recalcStats = recalcStats;

function updateUI() {
    if(!window.game.player) return;
    const hpBar = document.getElementById('ui-hp-bar'); document.getElementById('ui-hp-text').innerText = `${Math.floor(window.game.player.hp)}/${window.game.player.maxHp}`;
    hpBar.style.width = `${Math.max(0, (window.game.player.hp / window.game.player.maxHp) * 100)}%`;
    document.getElementById('ui-sp-bar').style.width = `${Math.max(0, (window.game.player.sp / window.game.player.maxSp) * 100)}%`;
    document.getElementById('ui-sp-text').innerText = `${Math.floor(window.game.player.sp)}/${window.game.player.maxSp}`;
    document.getElementById('ui-floor').innerText = window.game.floor; document.getElementById('ui-stars').innerText = window.game.stars;
    document.getElementById('ui-username').innerText = `${window.game.player.name} (Lv.${window.game.player.level})`;
    
    const list = document.getElementById('party-list'); list.innerHTML = '';
    for(let id in window.game.players) {
        if(id === window.Network.myId) continue;
        let p = window.game.players[id]; let pct = Math.max(0, p.hp / p.maxHp) * 100; let isDead = p.hp <= 0;
        list.innerHTML += `
            <div style="display:flex; align-items:center; margin-bottom:5px; cursor:pointer;" onclick="selectTargetIcon('${id}')">
                <div style="position:relative;"><img src="${p.portrait}" style="width:24px; height:24px; border-radius:50%; border:1px solid #fff; object-fit:cover; ${isDead?'filter:grayscale(1)':''}">${p.chatText ? `<div class="chat-bubble">${p.chatText}</div>` : ''}</div>
                <div style="width:80px; height:8px; background:#333; border:1px solid #fff; margin-left:5px; position:relative;"><div style="width:${pct}%; height:100%; background:${isDead?'#555':'#0f0'};"></div></div>
            </div>`;
    }

    if (window.game.isBossFloor) {
        document.getElementById('ui-timer').style.display = 'none';
        let bosses = window.game.entities.filter(e => e.type === 'jumbo_boss' || e.type === 'boss'); let bc = document.getElementById('boss-hp-container');
        if(bosses.length > 0) {
            bc.style.display = 'flex'; bc.innerHTML = '';
            bosses.forEach(b => { let pct = Math.max(0, (b.hp / b.maxHp) * 100); bc.innerHTML += `<div style="display:flex; flex-direction:column; align-items:center;"><div style="color:white; font-weight:bold; text-shadow:1px 1px 2px black; font-size:14px;">${b.name}</div><div style="width:100%; height:12px; background:#333; border:2px solid white; border-radius:5px;"><div style="width:${pct}%; height:100%; background:red; transition: width 0.2s;"></div></div></div>`; });
        } else { bc.style.display = 'none'; }
    } else { document.getElementById('boss-hp-container').style.display = 'none'; }
}
window.updateUI = updateUI;

// --- ドラッグ入力処理 ---
let dragStartPos = null; let isDragging = false; let activeDragDir = null; 
canvas.addEventListener('pointerdown', (e) => { dragStartPos = { x: e.clientX, y: e.clientY }; isDragging = false; });
canvas.addEventListener('pointermove', (e) => {
    if (dragStartPos && !window.game.throwMode && !window.game.skillMode) {
        const dx = e.clientX - dragStartPos.x, dy = e.clientY - dragStartPos.y;
        if (Math.hypot(dx, dy) > 20) { 
            isDragging = true; let dirX = 0, dirY = 0; 
            if (Math.abs(dx) > Math.abs(dy)*2.5) dirX = Math.sign(dx); 
            else if (Math.abs(dy) > Math.abs(dx)*2.5) dirY = Math.sign(dy); 
            else { dirX = Math.sign(dx); dirY = Math.sign(dy); } 
            activeDragDir = { dx: dirX, dy: dirY }; 
            window.activeDragDir = activeDragDir; 
        }
    }
});
canvas.addEventListener('pointerup', (e) => {
    if (!dragStartPos || window.game.isGameOver || window.gameState !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const tapX = (e.clientX - rect.left) * scaleX;
    const tapY = (e.clientY - rect.top) * scaleY;
    
    if (window.game.throwMode) { let hitDir = null; for (let t of window.game.throwTriangles) if (Math.hypot(tapX - t.sx, tapY - t.sy) < window.TILE_SIZE/1.2) { hitDir = t; break; } if (hitDir) executeThrow(hitDir.dx, hitDir.dy); dragStartPos = null; return; }

    const pRender = window.game.player.getRenderPos();
    const camX = pRender.x - window.VIEW_COLS / 2 + 0.5;
    const camY = pRender.y - (canvas.height / window.TILE_SIZE) / 2 + 0.5;
    const mapTapX = Math.floor(tapX / window.TILE_SIZE + camX), mapTapY = Math.floor(tapY / window.TILE_SIZE + camY);

    if(window.game.skillMode) {
        let tapEnt = window.game.entities.find(en => en.occupies(mapTapX, mapTapY));
        if(window.game.skillMode === 'heal' && (!tapEnt || tapEnt.type !== 'player')) { if(typeof window.logMsg==='function') window.logMsg("自分または味方を選んでください。"); return; }
        if(window.game.skillMode === 'strong_attack' && (!tapEnt || tapEnt.type === 'player')) { if(typeof window.logMsg==='function') window.logMsg("敵を選んでください。"); return; }
        if(window.game.player.canAttack(tapEnt) || (window.game.skillMode==='heal' && tapEnt===window.game.player)) { useSkill(window.game.skillMode, tapEnt); cancelActionMode(); } 
        else {
            let targetX = tapEnt.x, targetY = tapEnt.y;
            if (tapEnt.type === 'boss' || tapEnt.type === 'jumbo_boss') { let minDist = Infinity; for (let by = targetY - 1; by <= targetY + 1; by++) for (let bx = targetX - 1; bx <= targetX + 1; bx++) { let d = Math.hypot(bx - window.game.player.x, by - window.game.player.y); if (d < minDist) { minDist = d; targetX = bx; targetY = by; } } }
            let p = window.getPath(window.game.player.x, window.game.player.y, targetX, targetY);
            if(!p || p.length===0) { if(typeof window.logMsg==='function') window.logMsg("対象に近づけません！発発動失敗。"); cancelActionMode(); } else { window.game.player.autoTarget = tapEnt; window.game.player.path = p; window.game.player.queuedSkill = window.game.skillMode; cancelActionMode(); }
        }
        dragStartPos = null; return;
    }

    if (isDragging) {
        activeDragDir = null; 
        window.activeDragDir = activeDragDir; 
    }
    else {
        let tappedEnemy = window.game.entities.find(en => (en.type === 'enemy' || en.type === 'grabot' || en.type === 'graspider' || en.type === 'boss' || en.type === 'jumbo_boss' || en.type === 'wraith') && en.occupies(mapTapX, mapTapY) && en.state !== 'JUMP');
        if (tappedEnemy) { 
            if(window.game.debugMode && typeof window.showEnemyStatusWindow === 'function') {
                window.showEnemyStatusWindow(tappedEnemy);
                window.game.player.autoTarget = null;
            } else {
                window.game.player.autoTarget = tappedEnemy; 
            }
            window.game.player.path = []; 
            window.game.player.finalDest = null; 
        } 
        else { window.game.player.autoTarget = null; window.game.player.finalDest = {x: mapTapX, y: mapTapY}; window.game.player.path = window.getPath(window.game.player.x, window.game.player.y, mapTapX, mapTapY); }
    }
    dragStartPos = null; isDragging = false;
});

window.activeDragDir = activeDragDir;

// --- ミニマップ ---
let mmDragStart = null; let mmIsDragging = false;
document.getElementById('minimapCanvas').addEventListener('pointerdown', (e) => { e.stopPropagation(); mmDragStart = {x: e.clientX, y: e.clientY}; mmIsDragging = false; });
document.getElementById('minimapCanvas').addEventListener('pointermove', (e) => { if(mmDragStart) { let dx = e.clientX - mmDragStart.x, dy = e.clientY - mmDragStart.y; if(Math.hypot(dx, dy) > 10) { mmIsDragging = true; let dirX = 0, dirY = 0; if (Math.abs(dx) > Math.abs(dy)*2.5) dirX = Math.sign(dx); else if (Math.abs(dy) > Math.abs(dx)*2.5) dirY = Math.sign(dy); else { dirX = Math.sign(dx); dirY = Math.sign(dy); } activeDragDir = { dx: dirX, dy: dirY }; window.activeDragDir = activeDragDir; } } });
document.getElementById('minimapCanvas').addEventListener('pointerup', (e) => {
    e.stopPropagation(); if(!mmDragStart || window.game.isGameOver) return;
    if(mmIsDragging) { activeDragDir = null; window.activeDragDir = activeDragDir; } 
    else if(window.minimapExpanded) {
        const rect = document.getElementById('minimapCanvas').getBoundingClientRect(), mapX = Math.floor((e.clientX - rect.left) / 6), mapY = Math.floor((e.clientY - rect.top) / 6);
        if (window.game.discoveredMap[mapY] && window.game.discoveredMap[mapY][mapX]) { 
            if(window.game.debugMode) {
                window.game.player.x = mapX; window.game.player.y = mapY; window.game.player.targetX = mapX; window.game.player.targetY = mapY;
                window.game.player.path = []; window.game.player.finalDest = null; window.game.player.autoTarget = null;
                window.game.player.onMoveComplete();
                broadcast({ type: 'PLY_UPDATE', x: window.game.player.x, y: window.game.player.y, hp: window.game.player.hp, targetX: mapX, targetY: mapY, massageProgress: 0 });
                shrinkMinimap();
            } else {
                window.game.player.finalDest = {x: mapX, y: mapY}; 
                window.game.player.path = window.getPath(window.game.player.x, window.game.player.y, mapX, mapY); 
                window.game.player.autoTarget = null; 
            }
        }
    }
    mmDragStart = null; mmIsDragging = false;
});
window.minimapExpanded = false;
function openMinimap() { window.minimapExpanded = true; let c = document.getElementById('minimap-container'); c.style.width = '300px'; c.style.height = '300px'; c.style.top = '50%'; c.style.left = '50%'; c.style.transform = 'translate(-50%, -50%)'; c.style.right = 'auto'; c.style.bottom = 'auto'; document.getElementById('btn-close-minimap').style.display = 'block'; document.getElementById('minimap-hint').style.display = 'block'; drawMinimap(); }
function shrinkMinimap() { window.minimapExpanded = false; let c = document.getElementById('minimap-container'); c.style.width = '120px'; c.style.height = '120px'; c.style.top = 'auto'; c.style.left = 'auto'; c.style.transform = 'none'; c.style.right = '10px'; c.style.bottom = '20px'; document.getElementById('btn-close-minimap').style.display = 'none'; document.getElementById('minimap-hint').style.display = 'none'; drawMinimap(); }
window.shrinkMinimap = shrinkMinimap;
document.getElementById('minimap-container').onclick = (e) => { if(mmIsDragging) return; e.stopPropagation(); if(!window.minimapExpanded) openMinimap(); };

function drawMinimap() {
    const mCtx = document.getElementById('minimapCanvas').getContext('2d'); mCtx.clearRect(0, 0, 300, 300); if(!window.game.player) return;
    let fData = window.GameData ? window.GameData.getFloorData(window.game.floor) : null;
    if(!fData) return;
    
    const scale = 6; mCtx.fillStyle = '#000080'; 
    
    for(let y=0; y<window.game.height; y++) for(let x=0; x<window.game.width; x++) if (window.game.discoveredMap[y][x]) mCtx.fillRect(x*scale, y*scale, scale, scale);
    const isVis = (x, y) => Math.abs(window.game.player.x - x) <= window.VIEW_W/2 + 1 && Math.abs(window.game.player.y - y) <= window.VIEW_H/2 + 1;
    for(let y=0; y<window.game.height; y++) for(let x=0; x<window.game.width; x++) if (window.game.map[y][x] === 2 && (window.game.discoveredMap[y][x] || isVis(x,y))) { mCtx.fillStyle = '#ffff00'; mCtx.beginPath(); mCtx.moveTo(x*scale, y*scale); mCtx.lineTo(x*scale+scale, y*scale); mCtx.lineTo(x*scale+scale/2, y*scale+scale); mCtx.fill(); }
    for (let it of window.game.items) if (window.game.discoveredMap[it.y][it.x] || isVis(it.x, it.y)) { mCtx.fillStyle = '#00ffff'; mCtx.beginPath(); mCtx.moveTo(it.x*scale+scale/2, it.y*scale); mCtx.lineTo(it.x*scale+scale, it.y*scale+scale); mCtx.lineTo(it.x*scale, it.y*scale+scale); mCtx.fill(); }
    for (let e of window.game.entities) if ((e.type === 'enemy' || e.type === 'grabot' || e.type === 'graspider' || e.type === 'boss' || e.type === 'jumbo_boss' || e.type === 'wraith') && (window.game.discoveredMap[e.y][e.x] || isVis(e.x, e.y))) { mCtx.fillStyle = '#ff0000'; mCtx.beginPath(); mCtx.arc(e.x*scale+scale/2, e.y*scale+scale/2, (e.type === 'boss' || e.type === 'jumbo_boss') ? scale*1.5 : scale/2, 0, Math.PI*2); mCtx.fill(); }
    if (Math.floor(Date.now() / 300) % 2 === 0) { mCtx.fillStyle = '#ffffff'; let px = window.game.player.x * scale + scale/2; let py = window.game.player.y * scale + scale/2; mCtx.beginPath(); mCtx.moveTo(px, py - scale); mCtx.lineTo(px + scale/2, py + scale/2); mCtx.lineTo(px - scale, py - scale/2); mCtx.lineTo(px + scale, py - scale/2); mCtx.lineTo(px - scale/2, py + scale/2); mCtx.fill(); }
}

// --- 描画処理 ---
function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!window.game.player || window.gameState !== 'playing') return;
    
    const pRender = window.game.player.getRenderPos();
    const camWidth = window.VIEW_W;
    const camHeight = window.VIEW_H;
    
    const camX = pRender.x - window.VIEW_COLS / 2 + 0.5;
    const camY = pRender.y - (canvas.height / window.TILE_SIZE) / 2 + 0.5;
    
    const startX = Math.floor(camX);
    const startY = Math.floor(camY);
    const endX = startX + camWidth;
    const endY = startY + camHeight;
    const px = window.game.player.x;
    const py = window.game.player.y;

    let fData = window.GameData ? window.GameData.getFloorData(window.game.floor) : null;
    if(!fData) return;
    let wallColor = fData.wallColor;
    let floorColor = fData.floorColor;
    let floorStroke = fData.floorStroke;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            if (x < 0 || x >= window.game.width || y < 0 || y >= window.game.height) continue;
            
            const screenX = x - camX;
            const screenY = y - camY;

            const tile = window.game.map[y][x];
            
            if (tile === 1) { 
                ctx.fillStyle = wallColor; 
                ctx.fillRect(Math.floor(screenX * window.TILE_SIZE), Math.floor(screenY * window.TILE_SIZE), window.TILE_SIZE+1, window.TILE_SIZE+1); 
            } else if (tile === 2) { 
                ctx.fillStyle = floorColor; 
                ctx.fillRect(Math.floor(screenX * window.TILE_SIZE), Math.floor(screenY * window.TILE_SIZE), window.TILE_SIZE+1, window.TILE_SIZE+1); 
                if(imgStairs.complete && imgStairs.src) { 
                    ctx.drawImage(imgStairs, Math.floor(screenX * window.TILE_SIZE), Math.floor(screenY * window.TILE_SIZE), window.TILE_SIZE, window.TILE_SIZE); 
                } else { 
                    ctx.fillStyle = '#333'; 
                    ctx.fillRect(Math.floor(screenX * window.TILE_SIZE), Math.floor(screenY * window.TILE_SIZE), window.TILE_SIZE, window.TILE_SIZE); 
                    ctx.fillStyle = '#fff'; ctx.font = '16px Arial'; 
                    ctx.fillText('階', Math.floor(screenX * window.TILE_SIZE) + 8, Math.floor(screenY * window.TILE_SIZE) + 22); 
                } 
            } else { 
                ctx.fillStyle = floorColor; 
                ctx.fillRect(Math.floor(screenX * window.TILE_SIZE), Math.floor(screenY * window.TILE_SIZE), window.TILE_SIZE+1, window.TILE_SIZE+1); 
                ctx.strokeStyle = floorStroke; 
                ctx.strokeRect(Math.floor(screenX * window.TILE_SIZE), Math.floor(screenY * window.TILE_SIZE), window.TILE_SIZE, window.TILE_SIZE); 
            }
        }
    }

    for(let ef of window.game.effects) {
        if(ef.type === 'web') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            let rx = Math.floor((ef.x - camX) * window.TILE_SIZE), ry = Math.floor((ef.y - camY) * window.TILE_SIZE); 
            ctx.font = `${window.TILE_SIZE*0.8}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🕸️', rx + window.TILE_SIZE/2, ry + window.TILE_SIZE/2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        }
    }

    ctx.font = `${window.TILE_SIZE*0.6}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let item of window.game.items) {
        if (item.x >= startX && item.x < endX && item.y >= startY && item.y < endY) {
            const sx = Math.floor((item.x - camX) * window.TILE_SIZE + window.TILE_SIZE/2);
            const sy = Math.floor((item.y - camY) * window.TILE_SIZE + window.TILE_SIZE/2);
            if (item.type === 'star') { 
                if(imgStar.complete && imgStar.src && imgStar.src.startsWith('http')) {
                    ctx.drawImage(imgStar, sx-window.TILE_SIZE*0.4, sy-window.TILE_SIZE*0.4, window.TILE_SIZE*0.8, window.TILE_SIZE*0.8);
                } else {
                    ctx.fillStyle = '#ffff55'; ctx.beginPath(); ctx.arc(sx, sy, (window.TILE_SIZE*0.25) + Math.min(window.TILE_SIZE*0.1, item.amount), 0, Math.PI*2); ctx.fill(); 
                }
            } else {
                const itemDef = window.ItemData ? window.ItemData[item.type] : null;
                if (itemDef) {
                    if (itemDef.iconType === 'image') {
                        let img = getPreloadedImage(itemDef.iconUrlKey);
                        if (img && img.complete && img.src) ctx.drawImage(img, sx-window.TILE_SIZE*0.4, sy-window.TILE_SIZE*0.4, window.TILE_SIZE*0.8, window.TILE_SIZE*0.8);
                    } else if (itemDef.iconType === 'emoji') {
                        ctx.fillText(itemDef.iconString, sx, sy);
                    }
                } else {
                    ctx.fillText('📦', sx, sy);
                }
            }
        }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    for(let e of window.game.entities) {
        if(e.state === 'PREP' || e.state === 'ATTACK') {
            if(e.type === 'boss') {
                if(e.skillIdx === 0 && e.skillTargets) {
                    let dX = e.skillTargets.dirX, dY = e.skillTargets.dirY; ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 1;
                    for(let s=1; s<=7; s++) { 
                        let bx = e.x + dX * s, by = e.y + dY * s, pX = dY, pY = dX; 
                        for(let w=-1; w<=1; w++) { 
                            let tx = bx + pX * w, ty = by + pY * w; 
                            let rx = Math.floor((tx - camX) * window.TILE_SIZE), ry = Math.floor((ty - camY) * window.TILE_SIZE); 
                            ctx.fillRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); ctx.strokeRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); 
                        } 
                    }
                } else if(e.skillIdx === 1 && e.skillTargets && e.skillTargets.circles) {
                    let targs = e.skillTargets.circles; let startIdx = e.skillTargets.aCount || 0; ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 1;
                    for(let i=startIdx; i<targs.length; i++) { 
                        let c = targs[i]; 
                        for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { 
                            let tx = c.x + dx, ty = c.y + dy; 
                            let rx = Math.floor((tx - camX) * window.TILE_SIZE), ry = Math.floor((ty - camY) * window.TILE_SIZE); 
                            ctx.fillRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); ctx.strokeRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); 
                        } 
                    }
                } else if(e.skillIdx === 2) {
                    let pos = [{dx:0,dy:-2}, {dx:0,dy:2}, {dx:-2,dy:0}, {dx:2,dy:0}]; ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 1;
                    for(let p of pos) { 
                        let tx = e.x + p.dx, ty = e.y + p.dy; 
                        let rx = Math.floor((tx - camX) * window.TILE_SIZE), ry = Math.floor((ty - camY) * window.TILE_SIZE); 
                        ctx.fillRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); ctx.strokeRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); 
                    }
                }
            } else if(e.type === 'jumbo_boss') {
                if(e.skillIdx === 0 && e.tackleDir) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 1; let dX = e.tackleDir.dx, dY = e.tackleDir.dy;
                    for(let s=1; s<=6; s++) { 
                        let bx = e.x + dX * s, by = e.y + dY * s, pX = dY, pY = dX; 
                        for(let w=-1; w<=1; w++) { 
                            let tx = bx + pX * w, ty = by + pY * w; 
                            let rx = Math.floor((tx - camX) * window.TILE_SIZE), ry = Math.floor((ty - camY) * window.TILE_SIZE); 
                            ctx.fillRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); ctx.strokeRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); 
                        } 
                    }
                } else if(e.skillIdx === 1 && e.jumpTarget) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 1;
                    for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { 
                        let tx = e.jumpTarget.x + dx, ty = e.jumpTarget.y + dy; 
                        let rx = Math.floor((tx - camX) * window.TILE_SIZE), ry = Math.floor((ty - camY) * window.TILE_SIZE); 
                        ctx.fillRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); ctx.strokeRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); 
                    }
                }
            } else if(e.type === 'graspider') {
                if (e.nextAttackIsSkill && e.attackTarget) {
                    let tx = e.attackTarget.x, ty = e.attackTarget.y;
                    let rx = Math.floor((tx - camX) * window.TILE_SIZE), ry = Math.floor((ty - camY) * window.TILE_SIZE); 
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 2;
                    ctx.fillRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); ctx.strokeRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE); 
                }
            }
        }
    }

    let renderEnts = window.game.entities.slice().sort((a,b) => a.y - b.y);

    for (let e of renderEnts) {
        const pos = e.getRenderPos();
        if (pos.x >= startX - 2 && pos.x < endX + 2 && pos.y >= startY - 2 && pos.y < endY + 2) {
            const sx = Math.floor((pos.x - camX) * window.TILE_SIZE);
            const sy = Math.floor((pos.y - camY) * window.TILE_SIZE);
            
            if (e.hitTimer > 0) if (Math.floor(Date.now() / 50) % 2 === 0) ctx.globalAlpha = 0.3;
            ctx.save(); ctx.translate(sx + window.TILE_SIZE / 2, sy + window.TILE_SIZE / 2);
            
            let rot = 0, scaleX = 1, scaleY = 1, offY = 0;
            if (e.isMoving) { 
                let md = e.moveDuration; 
                let isOnWeb = window.game.effects.find(ef => ef.type === 'web' && ef.x === e.x && ef.y === e.y);
                if(e.type === 'player' && isOnWeb) md /= 0.7;

                let prog = e.moveTimer / md; 
                offY = Math.sin(prog * Math.PI) * -(window.TILE_SIZE*0.25); 
                rot = Math.sin(prog * Math.PI * 2) * 0.15; 
            } 
            else if (e.isAttacking) { 
                let isOnWeb = window.game.effects.find(ef => ef.type === 'web' && ef.x === e.x && ef.y === e.y);
                let ad = e.attackDuration; if(e.type === 'player' && isOnWeb) ad /= 0.7;

                let prog = e.attackTimer / ad, dirX = 1; 
                if (e.attackTarget && (e.attackTarget.x - e.x) < 0) dirX = -1; 
                if (prog < 0.25) rot = -0.2 * dirX; 
                else if (prog < 0.5) { rot = 0.3 * dirX; scaleX = 1.1; scaleY = 0.9; } 
                else rot = 0.3 * dirX * (1 - (prog - 0.5) / 0.5); 
            }
            
            if (e.type === 'player' && e.hp <= 0) { ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.5; } else { ctx.rotate(rot); ctx.scale(scaleX, scaleY); }
            
            if (e.type === 'player') { 
                if (imgPlayer.complete && imgPlayer.src) ctx.drawImage(imgPlayer, -window.TILE_SIZE / 2, -window.TILE_SIZE / 2 - (window.TILE_SIZE*0.3) + offY, window.TILE_SIZE, window.TILE_SIZE + (window.TILE_SIZE*0.3)); 
                else { ctx.fillStyle = 'blue'; ctx.fillRect(-window.TILE_SIZE / 2 + 4, -window.TILE_SIZE / 2 + 4 + offY, window.TILE_SIZE - 8, window.TILE_SIZE - 8); } 
            }
            else if (e.type === 'enemy' && imgEnemy.complete && imgEnemy.src) ctx.drawImage(imgEnemy, -window.TILE_SIZE/4, -window.TILE_SIZE/2 + (window.TILE_SIZE*0.15) + offY, window.TILE_SIZE/2, window.TILE_SIZE/2 + (window.TILE_SIZE*0.15));
            else if (e.type === 'grabot') { 
                if (imgGrabot.complete && imgGrabot.src) { 
                    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, window.TILE_SIZE/2 - (window.TILE_SIZE*0.1), window.TILE_SIZE/3, window.TILE_SIZE/6, 0, 0, Math.PI*2); ctx.fill();
                    let floatY = Math.sin(Date.now()/200) * (window.TILE_SIZE*0.1); ctx.drawImage(imgGrabot, -window.TILE_SIZE/4, -window.TILE_SIZE/4 + floatY + offY, window.TILE_SIZE/2, window.TILE_SIZE/2); 
                } else { ctx.fillStyle = 'brown'; ctx.fillRect(-window.TILE_SIZE/4, -window.TILE_SIZE/4 + offY, window.TILE_SIZE/2, window.TILE_SIZE/2); } 
            }
            else if (e.type === 'graspider') {
                if (imgGraspider.complete && imgGraspider.src) ctx.drawImage(imgGraspider, -window.TILE_SIZE/4, -window.TILE_SIZE/4 + offY, window.TILE_SIZE/2, window.TILE_SIZE/2);
                else { ctx.fillStyle = '#444'; ctx.fillRect(-window.TILE_SIZE/4, -window.TILE_SIZE/4 + offY, window.TILE_SIZE/2, window.TILE_SIZE/2); }
            }
            else if (e.type === 'boss' && imgReaper.complete && imgReaper.src) ctx.drawImage(imgReaper, -window.TILE_SIZE*1.5, -window.TILE_SIZE*1.5 + offY, window.TILE_SIZE*3, window.TILE_SIZE*3);
            else if (e.type === 'wraith' && imgReaper.complete && imgReaper.src) { ctx.globalAlpha = 0.5; ctx.drawImage(imgReaper, -window.TILE_SIZE/2, -window.TILE_SIZE/2 + offY, window.TILE_SIZE, window.TILE_SIZE); ctx.globalAlpha = 1.0; }
            else if (e.type === 'jumbo_boss') {
                if(e.state === 'JUMP') { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 0, window.TILE_SIZE, window.TILE_SIZE/2, 0, 0, Math.PI*2); ctx.fill(); if(imgJumboGrime.complete && imgJumboGrime.src) ctx.drawImage(imgJumboGrime, -window.TILE_SIZE*1.5, -window.TILE_SIZE*3 - (Math.sin(e.jumpTimer*Math.PI)*window.TILE_SIZE*3), window.TILE_SIZE*3, window.TILE_SIZE*3); } 
                else { 
                    if(imgJumboGrime.complete && imgJumboGrime.src) ctx.drawImage(imgJumboGrime, -window.TILE_SIZE*1.5, -window.TILE_SIZE*1.5 + offY, window.TILE_SIZE*3, window.TILE_SIZE*3); else { ctx.fillStyle = 'purple'; ctx.fillRect(-window.TILE_SIZE*1.5, -window.TILE_SIZE*1.5, window.TILE_SIZE*3, window.TILE_SIZE*3); }
                    if(e.state === 'STUN') { 
                        let starRot = Date.now() / 200;
                        ctx.save(); ctx.translate(0, -window.TILE_SIZE*1.5);
                        for(let i=0; i<3; i++) {
                            let a = starRot + (Math.PI*2/3)*i;
                            let bsx = Math.cos(a) * window.TILE_SIZE; let bsy = Math.sin(a) * window.TILE_SIZE/2;
                            ctx.fillStyle = 'yellow'; ctx.font = `${window.TILE_SIZE*0.6}px Arial`; ctx.fillText('⭐', bsx - window.TILE_SIZE*0.3, bsy + window.TILE_SIZE*0.3);
                        }
                        ctx.restore();
                    }
                }
            }
            else { ctx.fillStyle = 'green'; ctx.fillRect(-window.TILE_SIZE / 2 + 4, -window.TILE_SIZE / 2 + 4 + offY, window.TILE_SIZE - 8, window.TILE_SIZE - 8); }
            
            ctx.restore(); ctx.globalAlpha = 1.0;
            
            if (e.type === 'player' && e.hp <= 0) { ctx.save(); ctx.translate(sx + window.TILE_SIZE / 2, sy + window.TILE_SIZE / 2); ctx.globalAlpha = 0.5; let gOff = Math.sin(Date.now()/200)* (window.TILE_SIZE*0.15) - (window.TILE_SIZE*0.45); if(imgPlayer.complete && imgPlayer.src) ctx.drawImage(imgPlayer, -window.TILE_SIZE / 2, -window.TILE_SIZE / 2 - (window.TILE_SIZE*0.3) + gOff, window.TILE_SIZE, window.TILE_SIZE + (window.TILE_SIZE*0.3)); ctx.restore(); ctx.globalAlpha = 1.0; }
            if (e.type === 'player' && e.massageProgress > 0) { ctx.fillStyle = '#ff0'; ctx.font = `${window.TILE_SIZE*0.3}px Arial`; ctx.textAlign = 'center'; ctx.fillText("心臓マッサージ中...", sx + window.TILE_SIZE/2, sy - (window.TILE_SIZE*0.9)); ctx.fillStyle = '#333'; ctx.fillRect(sx, sy - (window.TILE_SIZE*0.6), window.TILE_SIZE, 4); ctx.fillStyle = '#0f0'; ctx.fillRect(sx, sy - (window.TILE_SIZE*0.6), window.TILE_SIZE * (e.massageProgress/100), 4); ctx.textAlign = 'left'; }

            if (e.type === 'player') { ctx.fillStyle = '#fff'; ctx.font = `${Math.max(10, window.TILE_SIZE*0.25)}px Arial`; ctx.textAlign = 'center'; ctx.fillText(e.name, sx + window.TILE_SIZE/2, sy - 5); ctx.textAlign = 'left'; if (e.showKeyTimer > 0) { ctx.font = `${window.TILE_SIZE*0.5}px Arial`; ctx.fillText("🔑", sx + window.TILE_SIZE/2 - (window.TILE_SIZE*0.25), sy - (window.TILE_SIZE*0.6)); } }
            if (e.type !== 'player' && e.type !== 'wraith') { if (e.state === 'PREP') { ctx.fillStyle = 'red'; ctx.font = `${window.TILE_SIZE*0.6}px Arial`; ctx.fillText('!', sx + window.TILE_SIZE - (window.TILE_SIZE*0.3), sy - (window.TILE_SIZE*0.4)); } else if (e.state === 'CHASE') { ctx.fillStyle = 'yellow'; ctx.font = `${window.TILE_SIZE*0.6}px Arial`; ctx.fillText('?', sx + window.TILE_SIZE - (window.TILE_SIZE*0.3), sy - (window.TILE_SIZE*0.4)); } }
            if (e.hp < e.maxHp || e.type === 'player') { ctx.fillStyle = 'red'; ctx.fillRect(sx, sy - 5, window.TILE_SIZE, 4); ctx.fillStyle = 'lime'; ctx.fillRect(sx, sy - 5, window.TILE_SIZE * (e.hp / e.maxHp), 4); }
            
            for (let p of e.damagePopups) {
                let size = (window.TILE_SIZE*0.35) + (p.ratio * (window.TILE_SIZE*0.35)); if (p.ratio >= 1.0) size = window.TILE_SIZE*0.75; 
                ctx.fillStyle = 'red'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.font = `bold ${size}px 'Helvetica Neue', Arial`; ctx.textAlign = 'center';
                let yOff = (1.0 - p.timer) * window.TILE_SIZE; let textX = sx + window.TILE_SIZE / 2, textY = sy - yOff + window.TILE_SIZE / 2;
                ctx.strokeText(p.val, textX, textY); ctx.fillText(p.val, textX, textY); ctx.textAlign = 'left'; 
            }
        }
    }

    for(let p of window.game.projectiles) {
        let pPos = p.getRenderPos();
        let sx = Math.floor((pPos.x - camX) * window.TILE_SIZE + window.TILE_SIZE/2);
        let sy = Math.floor((pPos.y - camY) * window.TILE_SIZE + window.TILE_SIZE/2);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.timer * 20); ctx.font = `${window.TILE_SIZE*0.75}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const itemDef = window.ItemData ? window.ItemData[p.item.type] : null;
        if (itemDef) {
            if (itemDef.iconType === 'image') {
                let img = getPreloadedImage(itemDef.iconUrlKey);
                if (img && img.complete && img.src) ctx.drawImage(img, -window.TILE_SIZE*0.4, -window.TILE_SIZE*0.4, window.TILE_SIZE*0.8, window.TILE_SIZE*0.8);
            } else if (itemDef.iconType === 'emoji') {
                ctx.fillText(itemDef.iconString, 0, 0);
            }
        } else {
            ctx.fillText('📦', 0, 0);
        }
        ctx.restore();
    }

    for(let ef of window.game.effects) {
        if(ef.type === 'beam') {
            ctx.fillStyle = 'rgba(128, 0, 128, 0.7)'; let w = (Math.abs(ef.dirX)*7 + Math.abs(ef.dirY)*3) * window.TILE_SIZE, h = (Math.abs(ef.dirY)*7 + Math.abs(ef.dirX)*3) * window.TILE_SIZE;
            let rx = Math.floor((ef.x - camX) * window.TILE_SIZE + window.TILE_SIZE/2), ry = Math.floor((ef.y - camY) * window.TILE_SIZE + window.TILE_SIZE/2);
            if(ef.dirX === 1) { ry -= window.TILE_SIZE*1.5; rx += window.TILE_SIZE*0.5; } else if(ef.dirX === -1) { ry -= window.TILE_SIZE*1.5; rx -= w - window.TILE_SIZE*0.5; }
            else if(ef.dirY === 1) { rx -= window.TILE_SIZE*1.5; ry += window.TILE_SIZE*0.5; } else if(ef.dirY === -1) { rx -= window.TILE_SIZE*1.5; ry -= h - window.TILE_SIZE*0.5; }
            ctx.fillRect(rx, ry, w, h);
        } else if(ef.type === 'pillar') { 
            let rx = Math.floor((ef.x - camX) * window.TILE_SIZE), ry = Math.floor((ef.y - camY - 2) * window.TILE_SIZE); 
            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'; ctx.fillRect(rx, ry, window.TILE_SIZE, window.TILE_SIZE*3); 
        } else if(ef.type === 'stars') { 
            ctx.fillStyle = 'rgba(0, 255, 0, 0.8)'; 
            let rx = Math.floor((ef.x - camX) * window.TILE_SIZE + window.TILE_SIZE/2), ry = Math.floor((ef.y - camY - 1) * window.TILE_SIZE + window.TILE_SIZE/2); 
            ctx.font = `${window.TILE_SIZE*0.75}px Arial`; ctx.fillText('✨', rx-(window.TILE_SIZE*0.35), ry); 
        } else if(ef.type === 'smoke') { 
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; 
            let rx = Math.floor((ef.x - camX) * window.TILE_SIZE), ry = Math.floor((ef.y - camY) * window.TILE_SIZE); 
            ctx.beginPath(); ctx.arc(rx+window.TILE_SIZE/2, ry+window.TILE_SIZE/2, window.TILE_SIZE*Math.random(), 0, Math.PI*2); ctx.fill(); 
        }
    }

    if (window.game.throwMode || window.game.skillMode) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (window.game.throwMode) {
        window.game.throwTriangles = []; const dirs = [ {dx: 0, dy: -1}, {dx: 1, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}, {dx: 0, dy: 1}, {dx: -1, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1} ];
        const px = Math.floor((window.game.player.x - camX) * window.TILE_SIZE + window.TILE_SIZE/2), py = Math.floor((window.game.player.y - camY) * window.TILE_SIZE + window.TILE_SIZE/2);
        for(let d of dirs) { let sx = px + d.dx * window.TILE_SIZE, sy = py + d.dy * window.TILE_SIZE; window.game.throwTriangles.push({sx, sy, dx: d.dx, dy: d.dy}); ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(d.dy, d.dx)); ctx.fillStyle = 'rgba(255,255,0,0.8)'; ctx.beginPath(); ctx.moveTo(window.TILE_SIZE*0.45, 0); ctx.lineTo(-window.TILE_SIZE*0.3, window.TILE_SIZE*0.3); ctx.lineTo(-window.TILE_SIZE*0.3, -window.TILE_SIZE*0.3); ctx.fill(); ctx.restore(); }
    }

    if (window.game.waitingForPlayers) { ctx.fillStyle = '#fff'; ctx.font = `${Math.min(30, canvas.width*0.05)}px Arial`; ctx.textAlign = 'center'; ctx.fillText("他プレイヤーの到着を待っています", canvas.width/2, canvas.height * 0.15); ctx.textAlign = 'left'; }
    if (window.game.noKeyMsgTimer > 0) { let yOffset = (2.0 - window.game.noKeyMsgTimer) * (canvas.height*0.03); ctx.fillStyle = '#fff'; ctx.font = `${Math.min(40, canvas.width*0.07)}px Arial`; ctx.textAlign = 'center'; ctx.fillText("鍵を所持していない…", canvas.width/2, canvas.height/2 - (canvas.height*0.05) - yOffset); ctx.textAlign = 'left'; }

    if(window.game.shakeTimer > 0) { let maxShift = window.game.shakeTimer * (window.TILE_SIZE*0.6); ctx.canvas.style.transform = `translate(${(Math.random()-0.5)*maxShift}px, ${(Math.random()-0.5)*maxShift}px)`; } 
    else ctx.canvas.style.transform = 'translate(0, 0)';
}

// --- メインアップデート・ゲームループ ---
function update(dt) {
    if (window.game.isGameOver || window.game.isTransitioning) return;
    if (window.game.noKeyMsgTimer > 0) window.game.noKeyMsgTimer -= dt;

    if (window.game.spawnGraceTimer > 0) { 
        window.game.spawnGraceTimer -= dt; 
        if(window.game.spawnGraceTimer <= 0) { 
            window.game.spawnGraceTimer = 0; 
            if(window.game.isBossFloor) {
                if(window.AudioEngine) window.AudioEngine.startBossBGM(); 
            } else {
                if(window.AudioEngine) window.AudioEngine.startDungeonBGM(); 
            }
        }
        window.game.timeLeft = 100; 
    } else if(window.game.timeLeft > 0 && !window.game.bossSpawned && !window.game.isBossFloor) {
        window.game.timeLeft -= dt; if(window.game.timeLeft <= 0) window.game.timeLeft = 0;
        document.getElementById('ui-timer-text').innerText = Math.ceil(window.game.timeLeft);
        if(window.game.timeLeft <= 0) document.getElementById('ui-timer-text').style.color = 'red';
    }
    if(window.Network.isHost && window.game.timeLeft <= 0 && !window.game.bossSpawned && !window.game.isBossFloor) {
        window.game.bossSpawned = true; document.getElementById('red-flash').style.display = 'block'; document.getElementById('ui-timer').style.display = 'none'; if(typeof window.logMsg==='function') window.logMsg("死神が現れた！！！"); 
        if(window.AudioEngine) window.AudioEngine.stopBGM();
        let firstR = window.game.rooms[0]; let b = new window.Boss(firstR.x + Math.floor(firstR.w/2), firstR.y + Math.floor(firstR.h/2), window.game.floor); window.game.entities.push(b); window.game.bossEnt = b;
    }
    
    if(window.game.shakeTimer > 0) window.game.shakeTimer -= dt;
    
    for(let i=window.game.projectiles.length-1; i>=0; i--) if(window.game.projectiles[i].update(dt)) window.game.projectiles.splice(i, 1);
    for(let i=window.game.effects.length-1; i>=0; i--) { window.game.effects[i].timer -= dt; if(window.game.effects[i].timer<=0) window.game.effects.splice(i,1); }
    for (let e of window.game.entities) e.update(dt);
    
    let hasStunnedBoss = window.game.entities.find(e => e.type === 'jumbo_boss' && e.state === 'STUN');
    if(hasStunnedBoss) { piyoTimer += dt; if(piyoTimer > 0.5) { piyoTimer = 0; if(window.AudioEngine) window.AudioEngine.playPiyo(); } }

    window.game.plySyncTimer = (window.game.plySyncTimer || 0) + dt;
    if (window.game.plySyncTimer >= 0.1) { window.game.plySyncTimer = 0; broadcast({ type: 'PLY_UPDATE', x: window.game.player.x, y: window.game.player.y, hp: window.game.player.hp, targetX: window.game.player.targetX, targetY: window.game.player.targetY, massageProgress: window.game.player.massageProgress }); }
    
    if(window.Network.isHost) {
        if(window.game.isBossFloor && !window.game.bossFloorCleared) {
            let hasEnemy = false;
            for(let e of window.game.entities) { if(e.type !== 'player' && e.hp > 0) { hasEnemy = true; break; } }
            if(!hasEnemy) {
                window.game.bossFloorCleared = true; window.game.map[window.game.stairsPos.y][window.game.stairsPos.x] = 2; window.game.hasKey = true; 
                broadcast({ type: 'BOSS_FLOOR_CLEAR', x: window.game.stairsPos.x, y: window.game.stairsPos.y });
            }
        }

        window.game.hostSyncTimer = (window.game.hostSyncTimer || 0) + dt;
        if(window.game.hostSyncTimer >= 0.2) {
            window.game.hostSyncTimer = 0;
            let entData = window.game.entities.filter(e => e.type !== 'player').map(e => ({ 
                id: e.id, x: e.x, y: e.y, hp: e.hp, targetX: e.targetX, targetY: e.targetY, state: e.state,
                skillIdx: e.skillIdx, skillTargets: e.skillTargets, tackleDir: e.tackleDir, jumpTarget: e.jumpTarget, stunTimer: e.stunTimer
            }));
            broadcast({ type: 'ENT_UPDATE', ents: entData, timeLeft: window.game.timeLeft, bossSpawned: window.game.bossSpawned });
            let allDead = true; let pCount = 0;
            for(let id in window.game.players) { pCount++; if(Number(window.game.players[id].hp) > 0) allDead = false; }
            if (pCount > 0 && allDead && !window.game.isGameOver && !window.game.debugMode) broadcast({ type: 'GAME_OVER' });
        }
    }

    let allOnStairs = true; let someoneOnStairs = false;
    for(let id in window.game.players) { let p = window.game.players[id]; if(p.x === window.game.stairsPos.x && p.y === window.game.stairsPos.y) someoneOnStairs = true; else allOnStairs = false; }
    
    let isStairsActive = true;
    if(window.game.isBossFloor && !window.game.bossFloorCleared) isStairsActive = false;

    if (isStairsActive && window.game.player.x === window.game.stairsPos.x && window.game.player.y === window.game.stairsPos.y) {
        if (!window.game.hasKey) { if(!window.game.noKeyMsgTriggered) { window.game.noKeyMsgTimer = 2.0; window.game.noKeyMsgTriggered = true; } } 
        else { 
            if (allOnStairs && !window.game.isTransitioning) { 
                if(window.Network.isHost) { window.game.floor++; startFloorTransitionHost(); } 
            } else if(!allOnStairs) window.game.waitingForPlayers = true; 
        }
    } else { window.game.waitingForPlayers = false; window.game.noKeyMsgTriggered = false; }

    updateUI(); if (Math.floor(Date.now() / 200) % 2 === 0) drawMinimap();
}

let piyoTimer = 0;

function gameLoop(timestamp) {
    if (!window.game.lastTime) window.game.lastTime = timestamp;
    let dt = (timestamp - window.game.lastTime) / 1000; window.game.lastTime = timestamp; if (dt > 0.1) dt = 0.1;
    if(window.gameState === 'playing') { update(dt); render(); }
    requestAnimationFrame(gameLoop);
}

// デバッグツールの初期化
if (typeof window.initDebugTools === 'function') {
    window.initDebugTools();
}

// ループ開始
requestAnimationFrame(gameLoop);
