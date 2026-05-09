// core_logic.js
// キャラクター、敵、マップ生成、デバッグ機能の統合ファイル

class Entity {
    constructor(x, y, maxHp, atk, def, type, name) {
        this.id = nextEntId++; this.x = x; this.y = y; this.targetX = x; this.targetY = y;
        this.maxHp = maxHp; this.hp = maxHp; this.baseAtk = atk; this.baseDef = def;
        this.atkBonus = 0; this.defBonus = 0; this.type = type; this.name = name;
        this.isMoving = false; this.moveTimer = 0; this.isAttacking = false; this.attackTimer = 0; this.attackTarget = null;
        this.visualOffsetX = 0; this.visualOffsetY = 0; this.hitTimer = 0; this.damagePopups = []; this.roomId = -1;
        this.moveDuration = MOVE_DURATION; this.attackDuration = 0.3;
    }
    occupies(tx, ty) { return (this.x === tx && this.y === ty) || (this.isMoving && this.targetX === tx && this.targetY === ty); }
    getRenderPos() {
        let rx = this.x, ry = this.y;
        if (this.isMoving) { 
            let md = this.moveDuration; let isOnWeb = game.effects.find(ef => ef.type === 'web' && ef.x === this.x && ef.y === this.y);
            if(this.type === 'player' && isOnWeb) md /= 0.7;
            const prog = Math.min(this.moveTimer / md, 1.0); 
            rx = this.x + (this.targetX - this.x) * prog; ry = this.y + (this.targetY - this.y) * prog; 
        }
        return { x: rx + this.visualOffsetX, y: ry + this.visualOffsetY };
    }
    update(dt) {
        if (this.hitTimer > 0) this.hitTimer -= dt;
        for (let i = this.damagePopups.length - 1; i >= 0; i--) { this.damagePopups[i].timer -= dt; if (this.damagePopups[i].timer <= 0) this.damagePopups.splice(i, 1); }
        if (this.isMoving) { 
            let md = this.moveDuration; let isOnWeb = game.effects.find(ef => ef.type === 'web' && ef.x === this.x && ef.y === this.y);
            if(this.type === 'player' && isOnWeb) md /= 0.7;
            this.moveTimer += dt; 
            if (this.moveTimer >= md) { this.x = this.targetX; this.y = this.targetY; this.isMoving = false; this.onMoveComplete(); } 
        }
        if(this.showKeyTimer > 0) this.showKeyTimer -= dt; 
        if(this.chatTimer > 0) this.chatTimer -= dt; else this.chatText = null;
    }
    tryMove(dx, dy) {
        if (this.isMoving || this.isAttacking || this.hp <= 0) return false;
        if (dx !== 0 && dy !== 0) { let wx = game.map[this.y][this.x + dx] === 1, wy = game.map[this.y + dy][this.x] === 1; if (wx && wy) return false; if (wx) dx = 0; else if (wy) dy = 0; }
        if (dx === 0 && dy === 0) return false; 
        const nx = this.x + dx, ny = this.y + dy; 
        if (nx < 0 || nx >= game.width || ny < 0 || ny >= game.height) return false;
        if (this.type !== 'boss' && this.type !== 'jumbo_boss' && this.type !== 'wraith' && game.map[ny][nx] === 1) return false;
        let blocker = game.entities.find(e => {
            if (e === this) return false; if (this.type === 'player' && e.type === 'player') return false; if (e.type === 'wraith' && this.type !== 'player') return false;
            if ((e.type === 'boss' || e.type === 'jumbo_boss') && this.type === 'player' && this.x === e.x && this.y === e.y) return false;
            return e.occupies(nx, ny);
        });
        if (blocker) { if (this.type === 'player' && blocker.type !== 'player' && window.activeDragDir) { if (blocker.state !== 'JUMP') this.autoTarget = blocker; } return false; }
        this.targetX = nx; this.targetY = ny; this.isMoving = true; this.moveTimer = 0; 
        if(this === game.player) { if(typeof broadcast === 'function') broadcast({ type: 'PLY_UPDATE', x: this.x, y: this.y, hp: this.hp, targetX: nx, targetY: ny, massageProgress: this.massageProgress }); }
        return true;
    }
    canAttack(target) {
        if(target.hp <= 0 || target.state === 'JUMP') return false; let dx = 0, dy = 0;
        if (target.type === 'boss' || target.type === 'jumbo_boss') {
            if (this.x < target.x - 1) dx = (target.x - 1) - this.x; else if (this.x > target.x + 1) dx = (target.x + 1) - this.x;
            if (this.y < target.y - 1) dy = (target.y - 1) - this.y; else if (this.y > target.y + 1) dy = (target.y + 1) - this.y;
        } else if (this.type === 'boss' || this.type === 'jumbo_boss') {
            if (this.x - 1 > target.x) dx = this.x - 1 - target.x; else if (this.x + 1 < target.x) dx = target.x - (this.x + 1);
            if (this.y - 1 > target.y) dy = this.y - 1 - target.y; else if (this.y + 1 < target.y) dy = target.y - (this.y + 1);
        } else { dx = target.x - this.x; dy = target.y - this.y; }
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
        if (dx !== 0 && dy !== 0) { let pX = Math.sign(target.x - this.x), pY = Math.sign(target.y - this.y); if (this.type === 'player' && (game.map[this.y][this.x + pX] === 1 || game.map[this.y + pY][this.x] === 1)) return false; }
        return true;
    }
    onMoveComplete() { if (game.roomMap && game.roomMap[this.y]) this.roomId = game.roomMap[this.y][this.x]; }
    takeDamage(amt, attacker) {
        if (this.type === 'player' && game.isTransitioning) return; amt = Number(amt) || 0;
        this.hp -= amt; this.hitTimer = 0.3; this.massageProgress = 0; this.damagePopups.push({ val: amt, timer: 1.0, ratio: amt / this.maxHp });
        if (attacker && this === game.player && typeof logMsg === 'function') logMsg(`${attacker.name}の攻撃！${amt}ダメージ！`); 
        if (this.hp <= 0) { this.hp = 0; this.die(attacker); } 
        if (this.type === 'player' && typeof updateUI === 'function') updateUI(); 
    }
    die(killer) {}
}

class Player extends Entity {
    constructor(x, y) { 
        super(x, y, 100, 10, 10, 'player', 'プレイヤー'); 
        this.autoTarget = null; this.path = []; this.finalDest = null; this.maxSp = 20; this.sp = 20; this.queuedSkill = null; this.massageProgress = 0; this.level = 1; this.exp = 0;
        this.baseInitialHp = 100; this.baseInitialSp = 20; this.baseInitialAtk = 10; this.baseInitialDef = 10;
        this.recalcLevelStats(); this.hp = this.maxHp; this.sp = this.maxSp;
    }
    recalcLevelStats() {
        let mult = 1.0 + (this.level * 0.1);
        this.maxHp = Math.floor(this.baseInitialHp * mult); this.maxSp = Math.floor(this.baseInitialSp * mult);
        this.baseAtk = Math.floor(this.baseInitialAtk * mult); this.baseDef = Math.floor(this.baseInitialDef * mult);
    }
    addExp(amount) {
        this.exp += amount; let leveledUp = false;
        while (this.exp > Math.pow(this.level, 3)) { this.level++; leveledUp = true; }
        if (leveledUp) {
            this.recalcLevelStats(); this.hp = this.maxHp; this.sp = this.maxSp;
            if(typeof logMsg === 'function') logMsg(`${this.name}はレベル${this.level}になった！`); 
            if(window.AudioEngine) AudioEngine.seUseItem(); 
            game.effects.push({type:'stars', x:this.x, y:this.y, timer:1.0}); 
            if (this === game.player && typeof updateUI === 'function') updateUI();
        }
    }
    update(dt) {
        super.update(dt); if(this.hp <= 0) return; this.sp = Math.min(this.maxSp, this.sp + 0.5 * dt);
        if (this.isAttacking) {
            this.attackTimer += dt;
            let isOnWeb = game.effects.find(ef => ef.type === 'web' && ef.x === this.x && ef.y === this.y);
            let ad = this.attackDuration; if(isOnWeb) ad /= 0.7;
            if (this.attackTarget) {
                let dx = this.attackTarget.x - this.x, dy = this.attackTarget.y - this.y, dist = Math.hypot(dx, dy);
                if (dist > 0) { let prog = this.attackTimer / ad; let lunge = (prog <= 0.5) ? (prog / 0.5) * 0.5 : ((1.0 - prog) / 0.5) * 0.5; this.visualOffsetX = (dx / dist) * lunge; this.visualOffsetY = (dy / dist) * lunge; }
            }
            if (this.attackTimer >= ad) {
                this.isAttacking = false; this.visualOffsetX = 0; this.visualOffsetY = 0;
                if (this.attackTarget && this.canAttack(this.attackTarget)) {
                    if(this.queuedSkill) { if(typeof useSkill === 'function') useSkill(this.queuedSkill, this.attackTarget); this.queuedSkill = null; } 
                    else { if(window.AudioEngine) AudioEngine.seAttack(); let dmg = calculateDamage(this, this.attackTarget); if(this.attackTarget.type !== 'player' && typeof broadcast === 'function') { broadcast({ type: 'ATK_ENEMY', targetId: this.attackTarget.id, dmg: dmg }); } }
                }
            }
            return;
        }
        let isMassaging = false;
        if (!this.isMoving && !this.isAttacking) {
            let mTarget = null; 
            for(let id in game.players) { if(id === window.Network?.myId) continue; let p = game.players[id]; if(p.hp <= 0 && p.x === this.x && p.y === this.y) { mTarget = id; break; } }
            if (mTarget) { isMassaging = true; this.massageProgress += dt * 10; if (this.massageProgress >= 100) { if(typeof broadcast === 'function') broadcast({ type: 'REVIVE', targetId: mTarget, hp: 1 }); this.massageProgress = 0; } }
        }
        if(!isMassaging) this.massageProgress = 0;

        if (!this.isMoving && !isMassaging) {
            if (window.activeDragDir) { 
                this.path = []; this.finalDest = null; let nx = this.x + window.activeDragDir.dx, ny = this.y + window.activeDragDir.dy;
                let targetEntity = game.entities.find(e => e !== this && e.occupies(nx, ny) && e.type !== 'player');
                if (targetEntity && targetEntity.state !== 'JUMP') { this.autoTarget = targetEntity; } else { this.autoTarget = null; this.tryMove(window.activeDragDir.dx, window.activeDragDir.dy); }
            }
            if (this.autoTarget && this.autoTarget.hp > 0) {
                if (this.autoTarget.state === 'JUMP') { this.autoTarget = null; } 
                else if (this.canAttack(this.autoTarget)) { this.isAttacking = true; this.attackTimer = 0; this.attackTarget = this.autoTarget; } 
                else if (!window.activeDragDir) {
                    let targetX = this.autoTarget.x, targetY = this.autoTarget.y;
                    if (this.autoTarget.type === 'boss' || this.autoTarget.type === 'jumbo_boss') { let minDist = Infinity; for (let by = targetY - 1; by <= targetY + 1; by++) { for (let bx = targetX - 1; bx <= targetX + 1; bx++) { let d = Math.hypot(bx - this.x, by - this.y); if (d < minDist) { minDist = d; targetX = bx; targetY = by; } } } }
                    let p = getPath(this.x, this.y, targetX, targetY); if (p && p.length > 0) this.tryMove(Math.sign(p[0].x - this.x), Math.sign(p[0].y - this.y));
                }
            } else if (this.path && this.path.length > 0 && !window.activeDragDir) {
                let next = this.path[0], dx = Math.sign(next.x - this.x), dy = Math.sign(next.y - this.y);
                if (this.tryMove(dx, dy)) { this.path.shift(); } else {
                    if (game.map[this.y + dy][this.x + dx] === 1) { this.path = []; this.finalDest = null; } else { let blocker = game.entities.find(e => e.occupies(this.x + dx, this.y + dy)); if (blocker && blocker.type !== 'player') { if(blocker.state !== 'JUMP') this.autoTarget = blocker; this.path = []; } else if (blocker && !blocker.isMoving) { this.path = []; this.finalDest = null; } }
                }
            }
            if (this.autoTarget && this.autoTarget.hp <= 0) this.autoTarget = null;
            if (!this.autoTarget && this.finalDest && this.path.length === 0 && !window.activeDragDir) { 
                if (this.x === this.finalDest.x && this.y === this.finalDest.y) { this.finalDest = null; } else { this.path = getPath(this.x, this.y, this.finalDest.x, this.finalDest.y); if (!this.path || this.path.length === 0) this.finalDest = null; } 
            }
        }
    }
    onMoveComplete() {
        super.onMoveComplete();
        for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { let nx = this.x+dx, ny = this.y+dy; if(nx>=0&&nx<game.width&&ny>=0&&ny<game.height && game.map[ny][nx] !== 1) game.discoveredMap[ny][nx] = true; }
        if (this.roomId !== -1) { let r = game.rooms[this.roomId]; if(r) { for(let ry=r.y-1; ry<=r.y+r.h; ry++) { for(let rx=r.x-1; rx<=r.x+r.w; rx++) { if(rx>=0&&ry>=0&&rx<game.width&&ry<game.height && game.map[ry][rx] !== 1) game.discoveredMap[ry][rx] = true; } } } }
        for (let i = 0; i < game.items.length; i++) {
            const item = game.items[i];
            if (item.x === this.x && item.y === this.y) {
                if (item.type === 'star') { game.stars += item.amount || 1; if(window.AudioEngine) AudioEngine.seGetItem(); if(typeof logMsg === 'function') logMsg(`星粒を拾った！`); } 
                else { 
                    const eIdx = game.inventory.findIndex(x => x === null); 
                    if (eIdx !== -1) { game.inventory[eIdx] = item; if(window.AudioEngine) AudioEngine.seGetItem(); if(typeof logMsg === 'function') logMsg(`${item.name} を拾った！`); if(document.getElementById('tab-item') && document.getElementById('tab-item').style.display==='grid' && typeof renderInventory === 'function') renderInventory(); } 
                    else { if(typeof logMsg === 'function') logMsg("カバンがいっぱいだ"); }
                }
                if(item.type==='star' || game.inventory.includes(item)) { game.items.splice(i, 1); if(typeof broadcast === 'function') broadcast({ type: 'ITEM_DEL', x: item.x, y: item.y }); i--; }
            }
        }
    }
    die() { 
        if(this === game.player) { 
            if(typeof logMsg === 'function') logMsg("力尽きた..."); if(window.AudioEngine) AudioEngine.seEnemyDie(); this.massageProgress = 0; this.path = []; this.finalDest = null; this.autoTarget = null; 
            if (game.debugMode) { setTimeout(() => { if(this.hp <= 0) { this.hp = this.maxHp; this.state = 'alive'; if(typeof broadcast === 'function') broadcast({ type: 'REVIVE', targetId: this.id, hp: this.maxHp }); if(typeof updateUI === 'function') updateUI(); } }, 1000); }
        } 
    }
}

class Enemy extends Entity {
    constructor(x, y, baseHp=10, baseAtk=5, baseDef=3, type='enemy', name='グライム') {
        let mult = 1.0 + (game.floor * 0.1); let maxHp = Math.round(baseHp * mult); let atk = Math.round(baseAtk * mult); let def = Math.round(baseDef * mult);
        super(x, y, maxHp, atk, def, type, name); 
        this.baseHpVal = baseHp; this.baseAtkVal = baseAtk; this.baseDefVal = baseDef;
        this.state = 'IDLE'; this.initX = x; this.initY = y; this.initRoomId = -1; this.prepTimer = 0; this.isSummoned = false;
        this.hasSkill = false; this.skillCooldown = 0; this.skillRange = 1; this.nextAttackIsSkill = false;
        this.debugSpec = "特に目立った特徴はない。"; this.debugSkills = [];
    }
    onMoveComplete() { super.onMoveComplete(); if (this.initRoomId === -1) this.initRoomId = this.roomId; }
    hasLineOfSight(x1, y1, x2, y2) {
        let dx = Math.abs(x2 - x1); let dy = Math.abs(y2 - y1); let sx = (x1 < x2) ? 1 : -1; let sy = (y1 < y2) ? 1 : -1; let err = dx - dy; let cx = x1; let cy = y1;
        while (true) { if (cx === x2 && cy === y2) break; if (game.map[cy][cx] === 1) return false; let e2 = 2 * err; if (e2 > -dy) { err -= dy; cx += sx; } if (e2 < dx) { err += dx; cy += sy; } } return true;
    }
    isInSkillRange(target) { let d = getDistance(this.x, this.y, target.x, target.y); if (d > this.skillRange) return false; return this.hasLineOfSight(this.x, this.y, target.x, target.y); }
    executeSkill(target) {}
    update(dt) {
        super.update(dt); if (this.skillCooldown > 0) this.skillCooldown -= dt;
        if (this.isAttacking) {
            this.attackTimer += dt;
            if (this.attackTarget) { let dx = this.attackTarget.x - this.x, dy = this.attackTarget.y - this.y, dist = Math.hypot(dx, dy); if (dist > 0) { let prog = this.attackTimer / this.attackDuration; if(prog>1) prog=1; let lunge = (prog <= 0.5) ? (prog / 0.5) * 0.5 : ((1.0 - prog) / 0.5) * 0.5; this.visualOffsetX = (dx / dist) * lunge; this.visualOffsetY = (dy / dist) * lunge; } }
            if (this.attackTimer >= this.attackDuration) {
                this.isAttacking = false; this.visualOffsetX = 0; this.visualOffsetY = 0;
                if (window.Network && window.Network.isHost && typeof broadcast === 'function') { 
                    if(this.nextAttackIsSkill) { this.executeSkill(this.attackTarget); } else { let dmg = calculateDamage(this, this.attackTarget); broadcast({ type: 'ATK_PLAYER', targetId: this.attackTarget.id, dmg: dmg, attackerId: this.id }); }
                    let canUseS = this.hasSkill && this.skillCooldown <= 0;
                    if (canUseS && this.isInSkillRange(this.attackTarget)) { this.state = 'PREP'; this.prepTimer = 0.7; this.nextAttackIsSkill = true; } 
                    else if (this.canAttack(this.attackTarget)) { this.state = 'PREP'; this.prepTimer = 0.7; this.nextAttackIsSkill = false; } else { this.state = 'CHASE'; }
                }
            } return;
        }
        if (!window.Network || !window.Network.isHost || game.isGameOver) return;
        let p = null; let minDist = Infinity; 
        for(let id in game.players) { let t = game.players[id]; if (t.hp > 0) { let d = getDistance(this.x, this.y, t.x, t.y); if (d < minDist) { minDist = d; p = t; } } }
        if (!p || this.isMoving) return;
        const dist = getDistance(this.x, this.y, p.x, p.y); let canDetect = (game.spawnGraceTimer <= 0); let canUseSkill = this.hasSkill && this.skillCooldown <= 0;
        switch (this.state) {
            case 'IDLE': if (canDetect && dist <= 4) this.state = 'CHASE'; break;
            case 'CHASE':
                if (canUseSkill && this.isInSkillRange(p)) { this.state = 'PREP'; this.prepTimer = 0.7; this.attackTarget = p; this.nextAttackIsSkill = true; } 
                else if (!canUseSkill && this.canAttack(p)) { this.state = 'PREP'; this.prepTimer = 0.7; this.attackTarget = p; this.nextAttackIsSkill = false; } 
                else if (dist > 5) { this.state = 'RETURN'; } 
                else { let path = getPath(this.x, this.y, p.x, p.y); if (path && path.length > 0) { if (!this.tryMove(Math.sign(path[0].x - this.x), Math.sign(path[0].y - this.y))) { let dx = Math.sign(p.x - this.x), dy = Math.sign(p.y - this.y); if (dx !== 0 && this.tryMove(dx, 0)) {} else if (dy !== 0 && this.tryMove(0, dy)) {} } } } break;
            case 'PREP':
                this.prepTimer -= dt; let stillInRange = false;
                if(this.nextAttackIsSkill) stillInRange = this.isInSkillRange(this.attackTarget); else stillInRange = this.canAttack(this.attackTarget);
                if (!stillInRange && this.prepTimer > 0) { this.state = 'CHASE'; } 
                else if (this.prepTimer <= 0) { this.state = 'ATTACK'; this.isAttacking = true; this.attackTimer = 0; if(window.AudioEngine) AudioEngine.seAttack(); if(typeof broadcast === 'function') broadcast({ type: 'ENEMY_ATK_START', attackerId: this.id, targetId: this.attackTarget.id, isSkill: this.nextAttackIsSkill }); } break;
            case 'RETURN':
                if (canDetect && dist <= 4) { this.state = 'CHASE'; } 
                else if (this.x === this.initX && this.y === this.initY) { this.state = 'IDLE'; } 
                else { let path = getPath(this.x, this.y, this.initX, this.initY); if (path && path.length > 0) { this.tryMove(Math.sign(path[0].x - this.x), Math.sign(path[0].y - this.y)); } else { this.tryMove(Math.sign(this.initX - this.x), Math.sign(this.initY - this.y)); } } break;
        }
    }
    die(killer) {
        if(window.AudioEngine) AudioEngine.seEnemyDie(); 
        if (killer && typeof broadcast === 'function') broadcast({ type: 'LOG', text: `${killer.name}が${this.name}を倒した！` }); 
        game.entities = game.entities.filter(e => e !== this); 
        if(game.player.autoTarget === this) game.player.autoTarget = null;
        if(window.Network && window.Network.isHost && this.type !== 'wraith' && typeof broadcast === 'function') {
            if (this.type === 'boss' || this.type === 'jumbo_boss') { let bossExp = game.floor * game.floor; for(let id in game.players) { broadcast({ type: 'EXP_GAIN', targetId: id, exp: bossExp }); } } 
            else if (killer && killer.type === 'player') { broadcast({ type: 'EXP_GAIN', targetId: killer.id, exp: game.floor }); }
            if(this.isKeyMonster) { broadcast({ type: 'KEY_OBTAINED', senderId: killer ? killer.id : window.Network.myId, name: killer ? killer.name : window.Network.myName }); } 
            else { if (!this.isSummoned) { game.items.push({ x: this.x, y: this.y, type: 'star', name: '星粒', amount: this.maxHp }); broadcast({ type: 'ITEMS_SYNC', items: game.items }); } }
        }
    }
}

class Wraith extends Enemy {
    constructor(x, y, floor, bossAtk=444) { let a = Math.floor(bossAtk / 4); super(x, y, 1, a, a, 'wraith', '死霊'); this.maxHp = 1; this.hp = 1; this.debugSpec = "壁をすり抜けて移動できる。"; }
    tryMove(dx, dy) { if (this.isMoving || this.isAttacking) return false; let nx = this.x + dx, ny = this.y + dy; if (nx < 0 || ny < 0 || nx >= game.width || ny >= game.height) return false; this.targetX = nx; this.targetY = ny; this.isMoving = true; this.moveTimer = 0; return true; }
    update(dt) {
        Entity.prototype.update.call(this, dt); 
        if (this.isAttacking) {
            this.attackTimer += dt;
            if (this.attackTarget) { let dx = this.attackTarget.x - this.x, dy = this.attackTarget.y - this.y, dist = Math.hypot(dx, dy); if (dist > 0) { let prog = this.attackTimer / 0.3; if(prog>1) prog=1; let lunge = (prog <= 0.5) ? (prog / 0.5) * 0.5 : ((1.0 - prog) / 0.5) * 0.5; this.visualOffsetX = (dx / dist) * lunge; this.visualOffsetY = (dy / dist) * lunge; } }
            if (this.attackTimer >= 0.3) { this.isAttacking = false; this.visualOffsetX = 0; this.visualOffsetY = 0; if (window.Network && window.Network.isHost && typeof broadcast === 'function') { broadcast({ type: 'ATK_PLAYER', targetId: this.attackTarget.id, dmg: calculateDamage(this, this.attackTarget), attackerId: this.id }); if (this.canAttack(this.attackTarget)) { this.state = 'PREP'; this.prepTimer = 0.7; } else { this.state = 'CHASE'; } } } return;
        }
        if (!window.Network || !window.Network.isHost || game.isGameOver) return;
        let p = null; let minDist = Infinity; 
        for(let id in game.players) { let t = game.players[id]; if (t.hp > 0) { let d = getDistance(this.x, this.y, t.x, t.y); if (d < minDist) { minDist = d; p = t; } } } 
        if (!p || this.isMoving) return;
        switch (this.state) {
            case 'IDLE': case 'CHASE': case 'RETURN':
                if (this.canAttack(p)) { this.state = 'PREP'; this.prepTimer = 0.7; this.attackTarget = p; } else { this.state = 'CHASE'; let dx = Math.sign(p.x - this.x), dy = Math.sign(p.y - this.y); if (!this.tryMove(dx, dy)) { if (dx !== 0 && this.tryMove(dx, 0)) {} else if (dy !== 0 && this.tryMove(0, dy)) {} } } break;
            case 'PREP': this.prepTimer -= dt; if (!this.canAttack(this.attackTarget) && this.prepTimer > 0) { this.state = 'CHASE'; } else if (this.prepTimer <= 0) { this.state = 'ATTACK'; this.isAttacking = true; this.attackTimer = 0; if(window.AudioEngine) AudioEngine.seAttack(); if(typeof broadcast === 'function') broadcast({ type: 'ENEMY_ATK_START', attackerId: this.id, targetId: this.attackTarget.id }); } break;
        }
    }
}

class Grabot extends Enemy {
    constructor(x, y, floor) { super(x, y, 11, 7, 2, 'grabot', 'グラバット'); this.moveDuration = MOVE_DURATION / 1.2; this.attackDuration = 0.3 / 1.2; this.debugSpec = "移動と攻撃が他のモンスターより少し速い。"; }
}

class Graspider extends Enemy {
    constructor(x, y, floor) { super(x, y, 12, 8, 3, 'graspider', 'グラスパイダー'); this.hasSkill = true; this.skillRange = 3; this.debugSpec = "プレイヤーを蜘蛛の巣で動けなくする。"; this.debugSkills = [{ id: 1, name: "蜘蛛の巣", mult: 0.7, wait: "0.7s", cd: "10.0s", desc: "対象を10秒間移動速度低下させる" }]; }
    executeSkill(target) { this.skillCooldown = 10.0; if(typeof broadcast === 'function') { broadcast({ type: 'PLAY_EFFECT', effectType: 'web', x: target.x, y: target.y, timer: 10.0, shake: 0 }); let dmg = calculateDamage(this, target, 0.7); broadcast({ type: 'ATK_PLAYER', targetId: target.id, dmg: dmg, attackerId: this.id }); } }
}

class JumboGrime extends Enemy {
    constructor(x, y, floor) { super(x, y, 120, 10, 5, 'jumbo_boss', 'ジャンボグライム'); this.skillIdx = 0; this.stunTimer = 0; this.tackleCount = 0; this.jumpTimer = 0; this.jumpTarget = null; this.tackleDir = null; this.debugSpec = "壁に激突するとスタンする。"; this.debugSkills = [{ id: 1, name: "突進", mult: 1.20, wait: "1.0s", cd: "ローテーション", desc: "直線に突進し、壁に当たると5秒スタン" }, { id: 2, name: "ジャンプ", mult: 5.0, wait: "1.0s", cd: "ローテーション", desc: "最も遠いプレイヤーに向かってジャンプし範囲ダメージ" }]; }
    occupies(tx, ty) { if (this.state === 'JUMP') return false; let occ = Math.abs(this.x - tx) <= 1 && Math.abs(this.y - ty) <= 1; if (this.isMoving) occ = occ || (Math.abs(this.targetX - tx) <= 1 && Math.abs(this.targetY - ty) <= 1); return occ; }
    takeDamage(amt, attacker) { if (this.state === 'JUMP') return; super.takeDamage(amt, attacker); }
    tryMove(dx, dy) { if (this.isMoving || this.isAttacking) return false; let nx = this.x + dx, ny = this.y + dy; if (nx < 1 || nx >= game.width-1 || ny < 1 || ny >= game.height-1) return false; let blocker = game.entities.find(e => e !== this && e.occupies(nx, ny) && e.type !== 'wraith'); if (blocker) return false; this.targetX = nx; this.targetY = ny; this.isMoving = true; this.moveTimer = 0; return true; }
    update(dt) {
        Entity.prototype.update.call(this, dt); if (!window.Network || !window.Network.isHost || game.isGameOver) return;
        if(this.stunTimer > 0) { this.stunTimer -= dt; if(this.stunTimer <= 0) this.state = 'IDLE'; return; }
        if(this.state === 'TACKLE') {
            if(this.isMoving) return;
            if(this.tackleCount < 6) {
                let nx = this.x + this.tackleDir.dx, ny = this.y + this.tackleDir.dy, hitWall = false;
                if(nx >= 0 && nx < game.width && ny >= 0 && ny < game.height) { if(game.map[ny][nx] === 1) hitWall = true; } else { hitWall = true; }
                if(hitWall) { this.state = 'STUN'; this.stunTimer = 5.0; if(typeof broadcast === 'function') { broadcast({ type: 'LOG', text: 'ジャンボグライムが壁に激突した！' }); broadcast({ type: 'PLAY_EFFECT', effectType: 'smoke', x: nx, y: ny, timer: 0.5, shake: 0.8 }); } } 
                else {
                    this.targetX = nx; this.targetY = ny; this.isMoving = true; this.moveTimer = 0; this.tackleCount++; if(typeof broadcast === 'function') broadcast({ type: 'PLAY_EFFECT', effectType: 'smoke', x: this.x, y: this.y, timer: 0.5, shake: 0.2 });
                    for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { let tx = nx+dx, ty = ny+dy; for(let e of game.entities) { if(e.occupies(tx, ty) && e !== this && e.type !== 'wraith') { if(e.type === 'player' && typeof broadcast === 'function') broadcast({ type: 'ATK_PLAYER', targetId: e.id, dmg: calculateDamage(this, e, 1.20), attackerId: this.id }); } } }
                }
            } else { this.state = 'IDLE'; } return;
        }
        if(this.state === 'JUMP') {
            this.jumpTimer += dt;
            if(this.jumpTimer >= 1.0) {
                this.x = this.jumpTarget.x; this.y = this.jumpTarget.y; this.state = 'IDLE'; if(typeof broadcast === 'function') broadcast({ type: 'PLAY_EFFECT', effectType: 'smoke', x: this.x, y: this.y, timer: 0.5, shake: 0.5 });
                if(typeof broadcast === 'function') { for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { if(dx!==0 || dy!==0) broadcast({ type: 'PLAY_EFFECT', effectType: 'smoke', x: this.x+dx, y: this.y+dy, timer: 0.5, shake: 0 }); } }
                for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { let tx = this.x+dx, ty = this.y+dy; for(let e of game.entities) { if(e.occupies(tx, ty) && e !== this && e.type !== 'wraith') { if(e.type === 'player' && typeof broadcast === 'function') broadcast({ type: 'ATK_PLAYER', targetId: e.id, dmg: calculateDamage(this, e, 5.0), attackerId: this.id }); else e.takeDamage(calculateDamage(this, e, 5.0), this); } } }
                this.visualOffsetX = 0; this.visualOffsetY = 0;
            } else { let prog = this.jumpTimer / 1.0; this.visualOffsetX = (this.jumpTarget.x - this.x) * prog; this.visualOffsetY = (this.jumpTarget.y - this.y) * prog; } return;
        }
        let maxDist = -1, minDist = Infinity, closeP = null, farP = null;
        for(let id in game.players) { let t = game.players[id]; if (t.hp > 0) { let d = getDistance(this.x, this.y, t.x, t.y); if (d > maxDist) { maxDist = d; farP = t; } if (d < minDist) { minDist = d; closeP = t; } } }
        if (!closeP) return;
        if (this.state === 'IDLE' || this.state === 'CHASE') {
            let inRange = false; if(this.skillIdx === 0 && minDist <= 6) inRange = true; if(this.skillIdx === 1) inRange = true;
            if (inRange) {
                this.state = 'PREP'; this.prepTimer = 1.0;
                if(this.skillIdx === 0) { let dx = closeP.x - this.x, dy = closeP.y - this.y; if (Math.abs(dx) > Math.abs(dy)) this.tackleDir = {dx: Math.sign(dx), dy: 0}; else this.tackleDir = {dx: 0, dy: Math.sign(dy)}; } 
                else if(this.skillIdx === 1) { this.jumpTarget = {x: farP.x, y: farP.y}; }
            } else { let path = getPath(this.x, this.y, closeP.x, closeP.y); if (path && path.length > 0) this.tryMove(Math.sign(path[0].x - this.x), Math.sign(path[0].y - this.y)); else this.tryMove(Math.sign(closeP.x - this.x), Math.sign(closeP.y - this.y)); }
        } else if (this.state === 'PREP') { this.prepTimer -= dt; if (this.prepTimer <= 0) { if(this.skillIdx === 0) { this.state = 'TACKLE'; this.tackleCount = 0; } else if(this.skillIdx === 1) { this.state = 'JUMP'; this.jumpTimer = 0; } this.skillIdx = (this.skillIdx + 1) % 2; } }
    }
    die(killer) { super.die(killer); for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { let tx = this.x+dx, ty = this.y+dy; if(tx>=0 && tx<game.width && ty>=0 && ty<game.height && game.map[ty][tx]!==1) { let slime = new Enemy(tx, ty, 10, 5, 3, 'enemy', 'グライム'); slime.isSummoned = true; game.entities.push(slime); } } }
}

class Boss extends Enemy {
    constructor(x, y, floor) { super(x, y, 6666, 444, 13, 'boss', '死神'); this.skillIdx = 0; this.skillData = [{name:'Death Beam', prep:1}, {name:'Cry Of Blood', prep:2}, {name:'Call Of Soul', prep:1}]; this.debugSpec = "多彩なスキルを持ち、地形を破壊しながら攻撃する。"; this.debugSkills = [{ id: 1, name: "Death Beam", mult: 6.66, wait: "1.0s", cd: "ローテーション", desc: "直線状の地形を破壊し大ダメージ" }, { id: 2, name: "Cry Of Blood", mult: 1.36, wait: "2.0s", cd: "ローテーション", desc: "広範囲のランダムな位置に柱を落とす" }, { id: 3, name: "Call Of Soul", mult: "-", wait: "1.0s", cd: "ローテーション", desc: "死霊(Wraith)を4体召喚する" }]; }
    occupies(tx, ty) { let occ = Math.abs(this.x - tx) <= 1 && Math.abs(this.y - ty) <= 1; if (this.isMoving) occ = occ || (Math.abs(this.targetX - tx) <= 1 && Math.abs(this.targetY - ty) <= 1); return occ; }
    tryMove(dx, dy) { if (this.isMoving || this.isAttacking) return false; let nx = this.x + dx, ny = this.y + dy; if (nx < 1 || nx >= game.width-1 || ny < 1 || ny >= game.height-1) return false; let blocker = game.entities.find(e => e !== this && e.occupies(nx, ny) && e.type !== 'wraith'); if (blocker) return false; this.targetX = nx; this.targetY = ny; this.isMoving = true; this.moveTimer = 0; return true; }
    onMoveComplete() { super.onMoveComplete(); let broke = false; for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { let nx=this.x+dx, ny=this.y+dy; if(nx>=0 && ny>=0 && nx<game.width && ny<game.height && game.map[ny][nx] === 1) { broke = true; } } if(broke && typeof broadcast === 'function') broadcast({ type: 'MAP_BREAK', x: this.x, y: this.y }); }
    update(dt) {
        Entity.prototype.update.call(this, dt); if (!window.Network || !window.Network.isHost || game.isGameOver || this.isMoving) return;
        let p = null; let minDist = Infinity; for(let id in game.players) { let t = game.players[id]; if (t.hp > 0) { let d = getDistance(this.x, this.y, t.x, t.y); if (d < minDist) { minDist = d; p = t; } } } if (!p) return;
        if (this.state === 'IDLE' || this.state === 'CHASE') {
            let dist = getDistance(this.x, this.y, p.x, p.y), inRange = false;
            if(this.skillIdx === 0 && (Math.abs(this.x - p.x) <= 1 || Math.abs(this.y - p.y) <= 1) && dist <= 6) inRange = true;
            if(this.skillIdx === 1 && dist <= 5) inRange = true; if(this.skillIdx === 2 && dist <= 5) inRange = true;
            if (inRange) {
                this.state = 'PREP'; this.prepTimer = this.skillData[this.skillIdx].prep;
                if(this.skillIdx === 0) { let dx = p.x - this.x, dy = p.y - this.y; if (Math.abs(dx) > Math.abs(dy)) this.skillTargets = {dirX: Math.sign(dx), dirY: 0}; else this.skillTargets = {dirX: 0, dirY: Math.sign(dy)}; } 
                else if(this.skillIdx === 1) { this.skillTargets = { circles: [], pIds: Object.keys(game.players), nextPIdx: 0, aCount: 0, skillTimer: 0 }; }
            } else { let path = getPath(this.x, this.y, p.x, p.y); if (path && path.length > 0) this.tryMove(Math.sign(path[0].x - this.x), Math.sign(path[0].y - this.y)); else this.tryMove(Math.sign(p.x - this.x), Math.sign(p.y - this.y)); }
        } else if (this.state === 'PREP') { 
            this.prepTimer -= dt; 
            if (this.skillIdx === 1) {
                this.skillTargets.skillTimer += dt; let targetLimit = Math.floor(this.skillTargets.skillTimer / 0.5) + 1;
                while (this.skillTargets.circles.length < 13 && this.skillTargets.circles.length < targetLimit) {
                    let pId = this.skillTargets.pIds[this.skillTargets.nextPIdx]; let pt = game.players[pId];
                    if (pt) this.skillTargets.circles.push({x: pt.x, y: pt.y, time: this.skillTargets.skillTimer}); else this.skillTargets.circles.push({x: this.x, y: this.y, time: this.skillTargets.skillTimer});
                    this.skillTargets.nextPIdx = (this.skillTargets.nextPIdx + 1) % this.skillTargets.pIds.length;
                }
            }
            if (this.prepTimer <= 0) { this.state = 'ATTACK'; if (this.skillIdx !== 1) this.executeSkill(); } 
        } else if (this.state === 'ATTACK') {
            if (this.skillIdx === 1) {
                this.skillTargets.skillTimer += dt; let targetLimit = Math.floor(this.skillTargets.skillTimer / 0.5) + 1;
                while (this.skillTargets.circles.length < 13 && this.skillTargets.circles.length < targetLimit) {
                    let pId = this.skillTargets.pIds[this.skillTargets.nextPIdx]; let pt = game.players[pId];
                    if (pt) this.skillTargets.circles.push({x: pt.x, y: pt.y, time: this.skillTargets.skillTimer}); else this.skillTargets.circles.push({x: this.x, y: this.y, time: this.skillTargets.skillTimer});
                    this.skillTargets.nextPIdx = (this.skillTargets.nextPIdx + 1) % this.skillTargets.pIds.length;
                }
                while (this.skillTargets.aCount < 13) {
                    let t = this.skillTargets.circles[this.skillTargets.aCount];
                    if(t && this.skillTargets.skillTimer >= t.time + 2.0) {
                        for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) { let tx=t.x+dx, ty=t.y+dy; if(tx>=0 && ty>=0 && tx<game.width && ty<game.height) { if(game.map[ty][tx] === 1) game.map[ty][tx] = 0; for(let e of game.entities) { if(e.occupies(tx,ty) && e!==this && e.type!=='wraith') { if(e.type === 'player' && typeof broadcast === 'function') broadcast({ type: 'ATK_PLAYER', targetId: e.id, dmg: calculateDamage(this, e, 1.36), attackerId: this.id }); else e.takeDamage(calculateDamage(this, e, 1.36), this); } } if(typeof broadcast === 'function') broadcast({ type: 'PLAY_EFFECT', effectType: 'pillar', x: tx, y: ty, timer: 0.5, shake: 0.1 }); } }
                        this.skillTargets.aCount++;
                    } else break;
                }
                if (this.skillTargets.aCount >= 13) { this.state = 'IDLE'; this.skillIdx = (this.skillIdx + 1) % 3; }
            }
        }
    }
    executeSkill() {
        if(this.skillIdx === 0) {
            let dX = this.skillTargets.dirX, dY = this.skillTargets.dirY;
            for(let s=1; s<=7; s++) { 
                let bx = this.x + dX * s, by = this.y + dY * s, pX = dY, pY = dX; 
                for(let w=-1; w<=1; w++) { let tx = bx + pX * w, ty = by + pY * w; if(tx>=0 && ty>=0 && tx<game.width && ty<game.height) { if(game.map[ty][tx] === 1) game.map[ty][tx] = 0; for(let e of game.entities) { if(e.occupies(tx,ty) && e!==this && e.type!=='wraith') { if(e.type === 'player' && typeof broadcast === 'function') { broadcast({ type: 'ATK_PLAYER', targetId: e.id, dmg: calculateDamage(this, e, 6.66), attackerId: this.id }); } else { e.takeDamage(calculateDamage(this, e, 6.66), this); } } } } } 
            }
            if(typeof broadcast === 'function') { broadcast({ type: 'MAP_BREAK', x: this.x, y: this.y }); broadcast({ type: 'PLAY_EFFECT', effectType: 'beam', x: this.x, y: this.y, dirX: dX, dirY: dY, timer: 0.5, shake: 0.3 }); }
            this.state = 'IDLE'; this.skillIdx = (this.skillIdx + 1) % 3;
        } else if (this.skillIdx === 2) {
            let pos = [{dx:0,dy:-2}, {dx:0,dy:2}, {dx:-2,dy:0}, {dx:2,dy:0}]; 
            for(let p of pos) { let tx=this.x+p.dx, ty=this.y+p.dy; if(tx>=0 && ty>=0 && tx<game.width && ty<game.height) { let w = new Wraith(tx, ty, game.floor, this.baseAtk); game.entities.push(w); } }
            if(typeof broadcast === 'function') broadcast({ type: 'PLAY_EFFECT', effectType: 'smoke', x: this.x, y: this.y, timer: 0.5, shake: 0 }); this.state = 'IDLE'; this.skillIdx = (this.skillIdx + 1) % 3;
        }
    }
    die(killer) { 
        super.die(killer); game.bossEnt = null; let tEl = document.getElementById('ui-timer'), rfEl = document.getElementById('red-flash'); if(tEl) tEl.style.display = 'none'; if(rfEl) rfEl.style.display = 'none'; 
        game.entities.forEach(e => { if (e.type === 'wraith' && typeof broadcast === 'function') { broadcast({ type: 'PLAY_EFFECT', effectType: 'smoke', x: e.x, y: e.y, timer: 0.5, shake: 0 }); } });
        game.entities = game.entities.filter(e => e.type !== 'wraith');
        if(window.Network && window.Network.isHost && typeof broadcast === 'function') broadcast({ type: 'LOG', text: "死神を撃退した！" }); 
    }
}

function generateMapHost() {
    const currentFloorData = window.GameData ? window.GameData.getFloorData(game.floor) : null;
    if(!currentFloorData) return;
    game.isBossFloor = currentFloorData.isBossFloor; game.floorType = currentFloorData.id; game.bossFloorCleared = false;
    game.width = game.isBossFloor ? 23 : 50; game.height = game.isBossFloor ? 23 : 50; const w = game.width, h = game.height;
    game.map = Array.from({length: h}, () => new Array(w).fill(1)); game.roomMap = Array.from({length: h}, () => new Array(w).fill(-1));
    game.rooms = []; game.entities = []; game.items = []; game.projectiles = []; game.effects = [];
    
    if (game.isBossFloor) {
        let rx = 1, ry = 1, rw = 21, rh = 21; let room = {x: rx, y: ry, w: rw, h: rh, id: 0}; game.rooms.push(room);
        for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) { game.map[y][x] = 0; game.roomMap[y][x] = 0; }
        game.stairsPos = { x: 11, y: 11 };
        let b; if (currentFloorData.bossType === 'jumbo_boss') { b = new JumboGrime(11, 6, game.floor); } else { b = new Boss(11, 6, game.floor); }
        game.entities.push(b);
    } else {
        const numRooms = Math.floor(Math.random() * 9) + 4; 
        for (let i = 0; i < numRooms; i++) {
            let rw = Math.floor(Math.random() * 9) + 4, rh = Math.floor(Math.random() * 9) + 4, rx = Math.floor(Math.random() * (w - rw - 2)) + 1, ry = Math.floor(Math.random() * (h - rh - 2)) + 1, overlap = false; 
            for (let r of game.rooms) { if (rx <= r.x + r.w && rx + rw >= r.x && ry <= r.y + r.h && ry + rh >= r.y) { overlap = true; break; } }
            if (!overlap) { let room = {x: rx, y: ry, w: rw, h: rh, id: game.rooms.length}; game.rooms.push(room); for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) game.map[y][x] = 0; }
        }
        for (let i = 1; i < game.rooms.length; i++) {
            let r1 = game.rooms[i-1], r2 = game.rooms[i], cx = Math.floor(r1.x + r1.w/2), cy = Math.floor(r1.y + r1.h/2), c2x = Math.floor(r2.x + r2.w/2), c2y = Math.floor(r2.y + r2.h/2);
            while (cx !== c2x) { game.map[cy][cx] = 0; cx += Math.sign(c2x - cx); } while (cy !== c2y) { game.map[cy][cx] = 0; cy += Math.sign(c2y - cy); }
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (game.map[y][x] === 0) for (let r of game.rooms) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { game.roomMap[y][x] = r.id; break; }
        let lastR = game.rooms[game.rooms.length - 1]; game.stairsPos = { x: Math.floor(lastR.x + lastR.w/2), y: Math.floor(lastR.y + lastR.h/2) }; game.map[game.stairsPos.y][game.stairsPos.x] = 2;
        
        let enemyTypes = currentFloorData.enemyPool || ['grime'], itemPools = currentFloorData.itemPool || ['hp_potion', 'star'];
        for (let r of game.rooms) {
            let nE = Math.floor(Math.random() * 4);
            for(let e=0; e<nE; e++) { 
                let ex = r.x + Math.floor(Math.random() * r.w), ey = r.y + Math.floor(Math.random() * r.h); 
                if (game.map[ey][ex] == 0) {
                    let type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
                    if(type === 'grime') game.entities.push(new Enemy(ex, ey, 10, 5, 3));
                    else if(type === 'grabot') game.entities.push(new Grabot(ex, ey, game.floor));
                    else if(type === 'graspider') game.entities.push(new Graspider(ex, ey, game.floor));
                }
            }
            if (Math.random() < 0.5) { 
                let ix = r.x + Math.floor(Math.random() * r.w), iy = r.y + Math.floor(Math.random() * r.h); 
                if (game.map[iy][ix] == 0) { 
                    let tKey = itemPools[Math.floor(Math.random() * itemPools.length)]; let itemDef = window.ItemData ? window.ItemData[tKey] : null;
                    if (itemDef) game.items.push({ x: ix, y: iy, type: itemDef.type, name: itemDef.name, equipped: false, amount: 1 }); 
                } 
            }
        }
        let enemies = game.entities.filter(e => e.type !== 'player' && e.type !== 'boss' && e.type !== 'jumbo_boss');
        if(enemies.length > 0) { enemies[Math.floor(Math.random()*enemies.length)].isKeyMonster = true; } else { let firstR = game.rooms[0]; let ek = new Enemy(firstR.x+2, firstR.y+2, 10, 5, 3); ek.isKeyMonster = true; game.entities.push(ek); }
    }
}

// --- デバッグツール ---
var selectedDebugStat = null; var currentDebugEnemy = null; var currentEnemySkills = []; var currentEnemySkillPage = 0;
function setSelectedStatElement(elId) { document.querySelectorAll('.editable-stat').forEach(el => el.classList.remove('selected')); if(elId) document.getElementById(elId).classList.add('selected'); }
function editStat(statName, elId) { if (!game.debugMode || !window.Network) return; let p = game.players[window.Network.myId]; if (!p || document.getElementById('st-username').innerText !== p.name) return; selectedDebugStat = statName; setSelectedStatElement(elId); if(typeof logMsg === 'function') logMsg(`[Debug] ${statName} を選択中。チャット欄に数字を入力して送信してください。`); }
function editEnemyStat(statName, elId) { if (!game.debugMode) return; selectedDebugStat = 'ENEMY_' + statName; setSelectedStatElement(elId); if(typeof logMsg === 'function') logMsg(`[Debug] 敵の ${statName} を選択中。チャット欄に数字を入力して送信してください。`); }
function editFloor(elId) { if (!game.debugMode) return; selectedDebugStat = 'FLOOR'; setSelectedStatElement(elId); if(typeof logMsg === 'function') logMsg(`[Debug] FLOOR を選択中。チャット欄に数字を入力して送信してください。`); }
function editStars(elId) { if (!game.debugMode) return; selectedDebugStat = 'STARS'; setSelectedStatElement(elId); if(typeof logMsg === 'function') logMsg(`[Debug] STARS を選択中。チャット欄に数字を入力して送信してください。`); }

var dbgIconTaps = 0; var dbgIconTapTimer = null; var dbgIconPressTimer = null;
function onDebugTouchStart(e) { if (document.getElementById('status-window') && document.getElementById('status-window').style.display === 'block') { if (dbgIconTaps >= 3) { dbgIconPressTimer = setTimeout(() => { if (!game.debugMode) { game.debugMode = true; document.body.classList.add('debug-mode'); if(typeof logMsg === 'function') logMsg("[Debug] デバッグモード有効"); if(window.AudioEngine) AudioEngine.seUseItem(); for(let y=0; y<game.height; y++) for(let x=0; x<game.width; x++) if(game.map[y] && game.map[y][x] !== undefined && game.map[y][x] !== 1) game.discoveredMap[y][x] = true; } }, 3000); } } }
function onDebugTouchEnd(e) { if (dbgIconPressTimer) clearTimeout(dbgIconPressTimer); if (document.getElementById('status-window') && document.getElementById('status-window').style.display === 'block') { dbgIconTaps++; if (dbgIconTapTimer) clearTimeout(dbgIconTapTimer); dbgIconTapTimer = setTimeout(() => { dbgIconTaps = 0; }, 1000); } else { dbgIconTaps = 0; } }

function insertDebugItem(itemType) {
    if(!game.debugMode) return; const idx = game.inventory.findIndex(x => x === null);
    if(idx !== -1) { const itemDef = window.ItemData ? window.ItemData[itemType] : null; if (itemDef) { game.inventory[idx] = { x: 0, y: 0, type: itemType, name: itemDef.name, equipped: false, amount: 1 }; if(typeof logMsg === 'function') logMsg(`[Debug] ${itemDef.name} を追加しました。`); if(typeof renderInventory === 'function') renderInventory(); } } else { if(typeof logMsg === 'function') logMsg("[Debug] カバンがいっぱいです。"); }
    let dMenu = document.getElementById('debug-item-menu'); if(dMenu) dMenu.style.display = 'none';
}

function showDebugItemMenu(e) {
    const dMenu = document.getElementById('debug-item-menu'); if(!dMenu || !window.ItemData) return; dMenu.innerHTML = ''; 
    for (let key in window.ItemData) {
        let item = window.ItemData[key]; if (key === 'star') continue;
        let iconHtml = ''; if (item.iconType === 'image' && window.GameData) iconHtml = `<img src="${window.GameData.images[item.iconUrlKey]}" style="width:16px;height:16px;vertical-align:middle;object-fit:contain;"> `; else if (item.iconType === 'emoji') iconHtml = item.iconString + ' ';
        dMenu.innerHTML += `<button onclick="insertDebugItem('${key}')">${iconHtml}${item.name}</button>`;
    }
    dMenu.innerHTML += `<button onclick="document.getElementById('debug-item-menu').style.display='none'">キャンセル</button>`;
    dMenu.style.display = 'flex'; let x = e.clientX, y = e.clientY; if (x + 200 > window.innerWidth) x -= 200; if (y + 350 > window.innerHeight) y -= 350; dMenu.style.left = x + 'px'; dMenu.style.top = y + 'px';
}

function showEnemyStatusWindow(enemy) {
    currentDebugEnemy = enemy; const w = document.getElementById('enemy-status-window'); if(!w) return; w.style.display = 'block'; document.getElementById('est-name').innerText = enemy.name;
    let floorMult = 1.0 + 0.01 * game.floor, eAtk = enemy.baseAtk + enemy.atkBonus, pDef = game.player.baseDef + game.player.defBonus;
    let minDmg = Math.max(1, Math.round(((eAtk * floorMult) - pDef) * 0.8)), maxDmg = Math.max(1, Math.round(((eAtk * floorMult) - pDef) * 1.2));
    let spec = enemy.debugSpec || "特に目立った特徴はない。"; let skills = enemy.debugSkills || [];
    let c = document.getElementById('est-content');
    c.innerHTML = `<p style="margin:5px 0;">HP: <span id="est-hp" class="editable-stat" onclick="editEnemyStat('HP', 'est-hp')">${Math.floor(enemy.hp)}</span> / <span id="est-maxhp" class="editable-stat" onclick="editEnemyStat('MAX_HP', 'est-maxhp')">${enemy.maxHp}</span> (${enemy.baseHpVal || enemy.maxHp})</p><p style="margin:5px 0;">攻撃力: <span id="est-atk" class="editable-stat" onclick="editEnemyStat('ATK', 'est-atk')">${enemy.baseAtk}</span> (${enemy.baseAtkVal || enemy.baseAtk})</p><p style="margin:5px 0;">防御力: <span id="est-def" class="editable-stat" onclick="editEnemyStat('DEF', 'est-def')">${enemy.baseDef}</span> (${enemy.baseDefVal || enemy.baseDef})</p><p style="margin:5px 0;">被ダメージ: ${minDmg} ~ ${maxDmg} (倍率: ${floorMult.toFixed(2)})</p><p style="font-size:12px; color:#ccc; margin:5px 0;">【仕様】<br>${spec}</p>`;
    if (skills.length > 0) {
        c.innerHTML += `<div id="est-skill-section" style="margin-top:10px; border-top:1px solid #555; padding-top:10px;"><div id="est-skill-content"></div><div style="display:flex; justify-content:space-between; margin-top:5px; align-items:center;"><button onclick="changeEnemySkillPage(-1)" style="padding:2px 8px; background:#333; color:#fff; border:1px solid #fff; border-radius:3px; cursor:pointer;">&lt; 前</button><span id="est-skill-page" style="font-size:12px;">1/${skills.length}</span><button onclick="changeEnemySkillPage(1)" style="padding:2px 8px; background:#333; color:#fff; border:1px solid #fff; border-radius:3px; cursor:pointer;">次 &gt;</button></div></div>`;
        currentEnemySkills = skills; currentEnemySkillPage = 0; renderEnemySkillPage();
    }
}
function renderEnemySkillPage() {
    if(currentEnemySkills.length === 0) return; let sk = currentEnemySkills[currentEnemySkillPage];
    let el = document.getElementById('est-skill-content'); if(!el) return;
    el.innerHTML = `<div style="font-size:12px;"><p style="margin:2px 0; color:#a8d578;">[${sk.id}] ${sk.name}</p><p style="margin:2px 0;">ダメージ倍率: ${sk.mult}</p><p style="margin:2px 0;">待機時間: ${sk.wait} / 再使用: ${sk.cd}</p><p style="margin:2px 0; color:#ccc;">仕様: ${sk.desc}</p></div>`;
    document.getElementById('est-skill-page').innerText = `${currentEnemySkillPage+1}/${currentEnemySkills.length}`;
}
function changeEnemySkillPage(dir) { currentEnemySkillPage += dir; if(currentEnemySkillPage < 0) currentEnemySkillPage = currentEnemySkills.length - 1; if(currentEnemySkillPage >= currentEnemySkills.length) currentEnemySkillPage = 0; renderEnemySkillPage(); }

function initDebugTools() {
    const uiIconParent = document.getElementById('ui-icon')?.parentElement; if (uiIconParent) { uiIconParent.addEventListener('pointerdown', onDebugTouchStart); uiIconParent.addEventListener('pointerup', onDebugTouchEnd); }
    const uiUsername = document.getElementById('ui-username'); if (uiUsername) { uiUsername.addEventListener('pointerdown', onDebugTouchStart); uiUsername.addEventListener('pointerup', onDebugTouchEnd); }
    const uiTimer = document.getElementById('ui-timer'); if (uiTimer) { uiTimer.addEventListener('pointerup', () => { if (game.debugMode && !game.isBossFloor && !game.bossSpawned) { if(typeof broadcast === 'function') broadcast({ type: 'DEBUG_TIME_ZERO' }); if(typeof logMsg === 'function') logMsg("[Debug] タイマーを0にしました。"); } }); }
    const uiKeyContainer = document.getElementById('ui-key-container'); if (uiKeyContainer) { uiKeyContainer.addEventListener('pointerup', () => { if (game.debugMode && !game.hasKey && window.Network) { if(typeof broadcast === 'function') broadcast({ type: 'KEY_OBTAINED', senderId: window.Network.myId, name: window.Network.myName }); } }); }
}

// 【重要】各クラスと関数を外部（main.js等）から呼び出せるように公開（エクスポート）する処理
window.Entity = Entity;
window.Player = Player;
window.Enemy = Enemy;
window.Wraith = Wraith;
window.Grabot = Grabot;
window.Graspider = Graspider;
window.JumboGrime = JumboGrime;
window.Boss = Boss;
window.generateMapHost = generateMapHost;
window.selectedDebugStat = selectedDebugStat;
window.currentDebugEnemy = currentDebugEnemy;
window.currentEnemySkills = currentEnemySkills;
window.currentEnemySkillPage = currentEnemySkillPage;
window.dbgIconTaps = dbgIconTaps;
window.dbgIconTapTimer = dbgIconTapTimer;
window.dbgIconPressTimer = dbgIconPressTimer;
window.setSelectedStatElement = setSelectedStatElement;
window.editStat = editStat;
window.editEnemyStat = editEnemyStat;
window.editFloor = editFloor;
window.editStars = editStars;
window.onDebugTouchStart = onDebugTouchStart;
window.onDebugTouchEnd = onDebugTouchEnd;
window.insertDebugItem = insertDebugItem;
window.showDebugItemMenu = showDebugItemMenu;
window.showEnemyStatusWindow = showEnemyStatusWindow;
window.renderEnemySkillPage = renderEnemySkillPage;
window.changeEnemySkillPage = changeEnemySkillPage;
window.initDebugTools = initDebugTools;
