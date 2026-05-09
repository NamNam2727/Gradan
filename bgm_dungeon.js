// bgm_dungeon.js
// 1〜9階（通常ダンジョン）用BGMの楽譜データ

const BgmDataDungeon = {
    id: 'dungeon',
    tempo: 130.0,
    steps: 64, // 16ステップ * 4小節
    scheduler: function(audioCtx, nextTime, step, playOsc, playDrum) {
        const melDungeon = [
            72,0,67,0, 64,0,67,0, 72,0,76,0, 72,0,67,0, 
            74,0,67,0, 62,0,67,0, 74,0,79,0, 74,0,67,0, 
            76,0,69,0, 64,0,69,0, 76,0,81,0, 76,0,69,0, 
            77,0,69,0, 65,0,69,0, 77,0,81,0, 77,0,69,0
        ];
        const chordsRootsDungeon = [48, 43, 45, 41];
        
        let bar = Math.floor(step / 16); 
        let beat = Math.floor((step % 16) / 4); 
        let sub = step % 4;

        // メロディ (Square)
        if (melDungeon[step] > 0) {
            playOsc(midiToFreq(melDungeon[step]), 'square', 0.1, 0.05, nextTime);
        }

        // アルペジオ (Square)
        let arpRoot = chordsRootsDungeon[bar] + 12; 
        let arpOffsets = bar === 1 ? [0,4,7,12] : bar === 2 ? [0,3,7,12] : [0,4,7,12]; 
        let arpNote = arpRoot + arpOffsets[step % 4];
        playOsc(midiToFreq(arpNote), 'square', 0.1, 0.03, nextTime);

        // ベース (Triangle)
        if (sub === 0 || sub === 2) {
            playOsc(midiToFreq(chordsRootsDungeon[bar]), 'triangle', 0.2, 0.1, nextTime);
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
