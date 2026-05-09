// bgm_boss.js
// ボス戦用BGMの楽譜データ

const BgmDataBoss = {
    id: 'boss',
    tempo: 150.0,
    steps: 64, // 16ステップ * 4小節
    scheduler: function(audioCtx, nextTime, step, playOsc, playDrum, playBgmNoise) {
        const chordRootsBoss = [45, 43, 41, 40]; // Am, G, F, E
        const chordNotesBoss = [ [57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59] ];
        const melBoss = [
            69,0,69,72, 69,0,76,0, 69,0,76,77, 76,72,69,0, 
            67,0,67,71, 67,0,74,0, 67,0,74,76, 74,71,67,0, 
            65,0,65,69, 65,0,72,0, 65,0,72,74, 72,69,65,0, 
            64,0,64,68, 64,0,71,0, 71,0,76,0, 76,80,76,0  
        ];
        
        let bar = Math.floor(step / 16) % 4; 
        let sub = step % 4; 
        let beat = Math.floor((step % 16) / 4);

        // メロディ (Square)
        if (melBoss[step] > 0) {
            playOsc(midiToFreq(melBoss[step]), 'square', 0.15, 0.1, nextTime);
        }

        // ランダムなコードアルペジオ (Square)
        if (sub === 2 || (step % 8 === 6)) { 
            let notes = chordNotesBoss[bar]; 
            let note = notes[Math.floor(Math.random() * notes.length)]; 
            playOsc(midiToFreq(note), 'square', 0.05, 0.04, nextTime); 
        }

        // ベース (Triangle)
        if (sub === 0 || sub === 2) {
            playOsc(midiToFreq(chordRootsBoss[bar]), 'triangle', 0.15, 0.15, nextTime);
        }

        // ドラム (Noise)
        if (sub === 0) playDrum(true, nextTime); // キック
        if (beat % 2 === 1 && sub === 0) playDrum(false, nextTime); // スネア/ハイハット
    }
};

// ヘルパー関数 (ファイル内で完結させるため)
if (typeof midiToFreq === 'undefined') {
    window.midiToFreq = function(m) { 
        return 440 * Math.pow(2, (m - 69) / 12); 
    };
}
