// core_data.js
// グローバル変数、階層データ、アイテムデータの統合ファイル

var TILE_SIZE = 32;
var VIEW_COLS = 11;
var VIEW_W = 11;
var VIEW_H = 15;
var MOVE_DURATION = 0.3;
var nextEntId = 1;

var game = {
    floor: 1, stars: 0, hasKey: false, timeLeft: 100, bossSpawned: false, bossEnt: null, debugMode: false,
    map: [], roomMap: [], rooms: [], discoveredMap: [], width: 50, height: 50, stairsPos: {x:0,y:0},
    entities: [], items: [], projectiles: [], effects: [], players: {}, player: null,
    equipment: { weapon: null, armor: null, accessory: null },
    logs: [], lastTime: 0, inventory: new Array(20).fill(null),
    isGameOver: false, isTransitioning: false, spawnGraceTimer: 0,
    throwMode: false, skillMode: null, throwTriangles: [], selectedItemIndex: -1,
    shakeTimer: 0, waitingForPlayers: false, hostSyncTimer: 0, plySyncTimer: 0,
    isBossFloor: false, bossFloorCleared: false, noKeyMsgTimer: 0, noKeyMsgTriggered: false,
    floorType: 'dungeon'
};

var gameState = 'title';

function getDistance(x1, y1, x2, y2) { return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)); }

function calculateDamage(attacker, target, mult=1.0) { 
    var baseAtk = attacker.baseAtk + attacker.atkBonus; 
    var def = target.baseDef + target.defBonus; 
    if (attacker.type !== 'player') { mult += 0.01 * game.floor; }
    var rand = 0.8 + Math.random() * 0.4; 
    return Math.max(1, Math.round(((baseAtk * mult) - def) * rand)); 
}

function getPath(startX, startY, destX, destY) {
    if (startX === destX && startY === destY) return []; 
    if (destX < 0) destX = 0; if (destX >= game.width) destX = game.width - 1; 
    if (destY < 0) destY = 0; if (destY >= game.height) destY = game.height - 1;
    if (game.map[destY][destX] === 1) { 
        var nearest = null; var minDist = Infinity; 
        for (var y = 0; y < game.height; y++) {
            for (var x = 0; x < game.width; x++) {
                if (game.map[y][x] !== 1) { 
                    var d = Math.hypot(x - destX, y - destY); 
                    if (d < minDist) { minDist = d; nearest = {x, y}; } 
                }
            }
        }
        if (nearest) { destX = nearest.x; destY = nearest.y; } else return []; 
    }
    var queue = [{x: startX, y: startY, path: []}]; 
    var visited = Array.from({length: game.height}, () => new Array(game.width).fill(false)); 
    visited[startY][startX] = true;
    var dirs = [ {dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}, {dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: 1, dy: 1} ];
    while (queue.length > 0) {
        var curr = queue.shift(); 
        if (curr.x === destX && curr.y === destY) return curr.path;
        for (var d of dirs) {
            var nx = curr.x + d.dx, ny = curr.y + d.dy;
            if (nx >= 0 && nx < game.width && ny >= 0 && ny < game.height && game.map[ny][nx] !== 1 && !visited[ny][nx]) {
                if (d.dx !== 0 && d.dy !== 0) { if (game.map[curr.y][nx] === 1 || game.map[ny][curr.x] === 1) continue; }
                visited[ny][nx] = true; 
                var newPath = curr.path.slice(); newPath.push({x: nx, y: ny}); 
                queue.push({x: nx, y: ny, path: newPath});
            }
        }
    }
    return [];
}

function logMsg(msg) {
    game.logs.push(msg); 
    if (game.logs.length > 30) game.logs.shift();
    var logEl = document.getElementById('tab-log'); 
    if(logEl) {
        logEl.innerHTML = game.logs.map(l => `<div>${l}</div>`).join(''); 
        logEl.scrollTop = logEl.scrollHeight;
    }
}

class Projectile {
    constructor(sx, sy, dx, dy, item, hit) { this.x = sx; this.y = sy; this.destX = dx; this.destY = dy; this.item = item; this.timer = 0; this.duration = 0.3; this.hit = hit; }
    update(dt) { this.timer += dt; if(this.timer >= this.duration) { this.hit(); return true; } return false; }
    getRenderPos() { var p = this.timer / this.duration; return { x: this.x + (this.destX - this.x) * p, y: this.y + (this.destY - this.y) * p }; }
}

const GameData = {
    // ★GitHub(jsDelivr)のURLに全て変更しました
    images: {
        player: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/Grachan.png',
        enemy: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/Grime.png',
        reaper: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/Reaper.png',
        jumboGrime: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/Grime.png',
        grabot: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/Grabat.png',
        graspider: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/Graspider.png',
        stairs: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/Stairs.png',
        hpPotion: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/HPP.png',
        spPotion: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/SPP.png',
        coin: 'https://cdn.jsdelivr.net/gh/NamNam2727/Gradan/coin.png'
    },
    getFloorData: function(floorNum) {
        if (floorNum === 10) return this.floors.boss10;
        if (floorNum === 20) return this.floors.boss20;
        if (floorNum >= 1 && floorNum <= 9) return this.floors.dungeon;
        if (floorNum >= 11 && floorNum <= 19) return this.floors.mansion;
        return this.floors.dungeon;
    },
    floors: {
        dungeon: { id: 'dungeon', isBossFloor: false, wallColor: '#79553d', floorColor: '#a8d578', floorStroke: '#68b558', bgmType: 'dungeon', enemyPool: ['grime'], itemPool: ['hp_potion', 'sp_potion', 'sword', 'shield', 'ring', 'star'] },
        boss10: { id: 'boss10', isBossFloor: true, bossType: 'jumbo_boss', wallColor: '#79553d', floorColor: '#a8d578', floorStroke: '#68b558', bgmType: 'boss' },
        mansion: { id: 'mansion', isBossFloor: false, wallColor: '#000080', floorColor: '#d3d3d3', floorStroke: '#a9a9a9', bgmType: 'mansion', enemyPool: ['grabot', 'graspider'], itemPool: ['hp_potion', 'sp_potion', 'sword', 'shield', 'ring', 'star'] },
        boss20: { id: 'boss20', isBossFloor: true, bossType: 'boss', wallColor: '#000080', floorColor: '#d3d3d3', floorStroke: '#a9a9a9', bgmType: 'boss' }
    }
};

const ItemData = {
    hp_potion: { type: 'hp_potion', name: 'HP回復ポーション', equipType: null, effectText: '効果: HPを50%回復する', flavorText: '', iconType: 'image', iconUrlKey: 'hpPotion', showAction1: true },
    sp_potion: { type: 'sp_potion', name: 'SP回復ポーション', equipType: null, effectText: '効果: SPを50%回復する', flavorText: '', iconType: 'image', iconUrlKey: 'spPotion', showAction1: true },
    sword: { type: 'sword', name: '鉄の剣', equipType: 'weapon', effectText: '装備: 攻撃力 +5', atkBonus: 5, defBonus: 0, flavorText: '', iconType: 'emoji', iconString: '🗡️', showAction1: true },
    shield: { type: 'shield', name: '木の盾', equipType: 'armor', effectText: '装備: 防御力 +3', atkBonus: 0, defBonus: 3, flavorText: '', iconType: 'emoji', iconString: '🛡️', showAction1: true },
    ring: { type: 'ring', name: '力の指輪', equipType: 'accessory', effectText: '装備: 攻撃力 +2', atkBonus: 2, defBonus: 0, flavorText: '', iconType: 'emoji', iconString: '💍', showAction1: true },
    star: { type: 'star', name: '星粒', equipType: null, effectText: '効果: 取得すると星粒が増える', flavorText: '', iconType: 'image', iconUrlKey: 'coin', showAction1: false },
    book_red: { type: 'book_red', name: 'グラドールの本(一巻)', equipType: null, effectText: '効果: なし (投げることは可能)', flavorText: '幼い少女がお気に入りの人形と出逢う物語。', iconType: 'emoji', iconString: '📕', showAction1: false },
    book_orange: { type: 'book_orange', name: 'グラドールの本(二巻)', equipType: null, effectText: '効果: なし (投げることは可能)', flavorText: '少女がお気に入りの人形と遊ぶ物語。', iconType: 'emoji', iconString: '📙', showAction1: false },
    book_green: { type: 'book_green', name: 'グラドールの本(三巻)', equipType: null, effectText: '効果: なし (投げることは可能)', flavorText: '少女がお気に入りの人形を無くしてしまう物語。', iconType: 'emoji', iconString: '📗', showAction1: false },
    book_blue: { type: 'book_blue', name: 'グラドールの本(四巻)', equipType: null, effectText: '効果: なし (投げることは可能)', flavorText: '少女がお気に入りの人形とお別れをする物語。', iconType: 'emoji', iconString: '📘', showAction1: false },
    book_default: { type: 'book_default', name: 'グラドールの本(白紙)', equipType: null, effectText: '効果: なし (投げることは可能)', flavorText: '古い本だ。表紙の文字は擦り切れて読めない。', iconType: 'emoji', iconString: '📖', showAction1: false }
};

// 【重要】各データを外部から呼び出せるように公開（エクスポート）する処理
window.TILE_SIZE = TILE_SIZE;
window.VIEW_COLS = VIEW_COLS;
window.VIEW_W = VIEW_W;
window.VIEW_H = VIEW_H;
window.MOVE_DURATION = MOVE_DURATION;
window.nextEntId = nextEntId;
window.game = game;
window.gameState = gameState;
window.getDistance = getDistance;
window.calculateDamage = calculateDamage;
window.getPath = getPath;
window.logMsg = logMsg;
window.Projectile = Projectile;
window.GameData = GameData;
window.ItemData = ItemData;
