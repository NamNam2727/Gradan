// bgm_title.js
// タイトル画面用BGMの楽譜データ

const BgmDataTitle = {
    id: 'title',
    tempo: 80.0,
    steps: 64, // 16ステップ * 4小節
    scheduler: function(audioCtx, nextTime, step, playOsc, playDrum) {
        let bar = Math.floor(step / 16) % 4; 
        let roots = [48, 45, 41, 43]; 
        let root = roots[bar];

        // ベース (Triangle)
        if (step % 4 === 0) {
            playOsc(midiToFreq(root), 'triangle', 0.8, 0.2, nextTime);
        }

        // アルペジオ (Square)
        if (step % 2 === 0) { 
            let arpOffsets = (bar === 1) ? [0, 3, 7, 12] : [0, 4, 7, 12]; 
            let arpNote = root + arpOffsets[(Math.floor(step / 2)) % 4] + 12; 
            playOsc(midiToFreq(arpNote), 'square', 0.2, 0.05, nextTime); 
        }

        // メロディ (Square)
        let melNote = 0;
        if (bar === 0 && step === 0) melNote = root + 24 + 4; 
        if (bar === 0 && step === 8) melNote = root + 24 + 7;
        if (bar === 1 && step === 0) melNote = root + 24 + 3; 
        if (bar === 1 && step === 8) melNote = root + 24 + 7;
        if (bar === 2 && step === 0) melNote = root + 24 + 4; 
        if (bar === 2 && step === 8) melNote = root + 24 + 0;
        if (bar === 3 && step === 0) melNote = root + 24 + 4; 
        if (bar === 3 && step === 8) melNote = root + 24 + 2;
        
        if (melNote > 0) {
            playOsc(midiToFreq(melNote), 'square', 1.0, 0.1, nextTime);
        }
    }
};

// ヘルパー関数 (ファイル内で完結させるため)
function midiToFreq(m) { 
    return 440 * Math.pow(2, (m - 69) / 12); 
}
