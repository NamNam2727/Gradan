// bgm_mansion.js
// 11〜19階（寂れた洋館）用BGMの楽譜データ

const BgmDataMansion = {
    id: 'mansion',
    tempo: 70.0,
    steps: 64, // 16ステップ * 4小節
    scheduler: function(audioCtx, nextTime, step, playOsc, playDrum, playBgmNoise) {
        const chordRootsMansion = [45, 43, 41, 40]; // Am, G, F, E
        
        let bar = Math.floor(step / 16) % 4; 
        
        // ベース (Triangle)
        if (step % 16 === 0) {
            playOsc(midiToFreq(chordRootsMansion[bar] - 12), 'triangle', 2.0, 0.2, nextTime);
        }
        
        // コード (Square)
        if (step % 16 === 0) { 
            playOsc(midiToFreq(chordRootsMansion[bar]), 'square', 1.5, 0.05, nextTime); 
            playOsc(midiToFreq(chordRootsMansion[bar] + 7), 'square', 1.5, 0.03, nextTime); 
        }

        // メロディ (Square)
        let melNote = 0; 
        let p = step % 16;
        if (bar === 0) { 
            if (p === 0) melNote = 69; 
            if (p === 6) melNote = 71; 
            if (p === 8) melNote = 72; 
        } else if (bar === 1) { 
            if (p === 4) melNote = 71; 
            if (p === 10) melNote = 67; 
        } else if (bar === 2) { 
            if (p === 0) melNote = 65; 
            if (p === 8) melNote = 64; 
        } else if (bar === 3) { 
            if (p === 4) melNote = 68; 
        }

        if (melNote > 0) {
            playOsc(midiToFreq(melNote), 'square', 0.8, 0.08, nextTime);
        }

        // ランダムな環境音（洋館のきしみ音や不気味な物音など）
        // ※playBgmNoise は親となるオーディオエンジン側で新しく定義します
        if (Math.random() < 0.05) {
            playBgmNoise(0.2 + Math.random() * 0.3, 0.05, true, nextTime);
        }
    }
};

// ヘルパー関数 (ファイル内で完結させるため)
if (typeof midiToFreq === 'undefined') {
    window.midiToFreq = function(m) { 
        return 440 * Math.pow(2, (m - 69) / 12); 
    };
}
