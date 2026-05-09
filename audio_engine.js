// audio_engine.js
// BGMおよび効果音（SE）の再生・管理エンジン

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let soundEnabled = true;
let isBgmPlaying = false;
let bgmTimer;
let currentBgmType = '';
let bgmNextTime = 0;
let bgmStep = 0;
let currentBgmData = null; // 現在再生中の楽譜データ

// --- 共通の音作り用関数 ---

function playTone(freq, type, duration, vol, pitchBend = 0) {
    if (!soundEnabled || audioCtx.state === 'suspended') return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (pitchBend !== 0) {
            osc.frequency.exponentialRampToValueAtTime(freq * pitchBend, audioCtx.currentTime + duration);
        }
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function playNoise(duration, vol, isLowPass = false) {
    if (!soundEnabled || audioCtx.state === 'suspended') return;
    try {
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        if (isLowPass) {
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            noise.connect(filter);
            filter.connect(gain);
        } else {
            noise.connect(gain);
        }
        gain.connect(audioCtx.destination);
        noise.start();
    } catch (e) {}
}

// BGM専用のノイズ再生関数 (タイミング指定可能)
function playBgmNoise(duration, vol, isLowPass, time) {
    try {
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        if (isLowPass) {
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            noise.connect(filter);
            filter.connect(gain);
        } else {
            noise.connect(gain);
        }
        gain.connect(audioCtx.destination);
        noise.start(time);
    } catch (e) {}
}

// --- 効果音 (SE) ---
function seAttack() { playNoise(0.1, 0.4); playTone(150, 'square', 0.1, 0.2, 0.5); }
function seGetItem() { playTone(880, 'square', 0.05, 0.1); setTimeout(() => playTone(1760, 'square', 0.1, 0.1), 50); }
function seUseItem() { playTone(440, 'triangle', 0.1, 0.1); setTimeout(() => playTone(554, 'triangle', 0.1, 0.1), 50); setTimeout(() => playTone(659, 'triangle', 0.2, 0.1), 100); }
function seEquip() { playNoise(0.05, 0.2, true); playTone(800, 'square', 0.05, 0.1); }
function seEnemyDie() { playTone(600, 'square', 0.3, 0.15, 0.3); }
function seStairs() { playNoise(0.05, 0.5, true); setTimeout(() => playNoise(0.05, 0.5, true), 150); setTimeout(() => playNoise(0.05, 0.5, true), 300); }
function seKey() { playTone(800, 'square', 0.1, 0.2); setTimeout(() => playTone(1200, 'square', 0.2, 0.2), 100); }
function playPiyo() { playTone(800, 'square', 0.1, 0.1, 0.8); setTimeout(() => playTone(1000, 'square', 0.1, 0.1, 1.2), 100); }

// --- BGM再生用関数群 ---

function playBgmOsc(freq, type, dur, vol, time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + dur);
}

function playBgmDrum(isKick, time) {
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = isKick ? 'lowpass' : 'highpass';
    filter.frequency.value = isKick ? 150 : 2000;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(isKick ? 0.2 : 0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start(time);
}

// BGMスケジューラー（共通）
function bgmScheduler() {
    if (!soundEnabled || audioCtx.state === 'suspended' || !currentBgmData) return;
    
    while (bgmNextTime < audioCtx.currentTime + 0.1) {
        // 現在読み込まれている楽譜データのschedulerを呼び出す
        currentBgmData.scheduler(audioCtx, bgmNextTime, bgmStep, playBgmOsc, playBgmDrum, playBgmNoise);
        
        bgmNextTime += 60.0 / currentBgmData.tempo / 4.0;
        bgmStep = (bgmStep + 1) % currentBgmData.steps;
    }
    bgmTimer = setTimeout(bgmScheduler, 25);
}

// BGM再生・停止の制御インターフェース
function startBGM(bgmData) {
    if (currentBgmType === bgmData.id) return;
    clearTimeout(bgmTimer);
    currentBgmData = bgmData;
    currentBgmType = bgmData.id;
    bgmStep = 0;
    bgmNextTime = audioCtx.currentTime + 0.1;
    bgmScheduler();
}

function startTitleBGM() { if (typeof BgmDataTitle !== 'undefined') startBGM(BgmDataTitle); }
function startDungeonBGM() {
    // フロアタイプ判定は設定ファイル(floor_data.js)等から取得するように後ほど連携します
    // ここでは安全のため、存在確認をしてから再生します
    if (window.game && window.game.floorType === 'mansion' && typeof BgmDataMansion !== 'undefined') {
        startBGM(BgmDataMansion);
    } else if (typeof BgmDataDungeon !== 'undefined') {
        startBGM(BgmDataDungeon);
    }
}
function startBossBGM() { if (typeof BgmDataBoss !== 'undefined') startBGM(BgmDataBoss); }

function stopBGM() {
    clearTimeout(bgmTimer);
    currentBgmType = '';
    currentBgmData = null;
}

// グローバルに露出させる（他のスクリプトから呼び出せるようにする）
window.AudioEngine = {
    audioCtx,
    seAttack, seGetItem, seUseItem, seEquip, seEnemyDie, seStairs, seKey, playPiyo, playNoise, playTone,
    startTitleBGM, startDungeonBGM, startBossBGM, stopBGM,
    toggleSound: function() {
        soundEnabled = !soundEnabled;
        return soundEnabled;
    },
    isSoundEnabled: function() {
        return soundEnabled;
    }
};
