window.addEventListener('DOMContentLoaded', () => {

    // HTML要素を取得 (パン関連を追加)
    const durationInput = document.getElementById('duration');
    const frequencyInput = document.getElementById('frequency');
    const gainInput = document.getElementById('gain');
    const gainValueDisplay = document.getElementById('gainValue');
    const panInput = document.getElementById('pan');           // 追加
    const panValueDisplay = document.getElementById('panValue'); // 追加

    const generateButton = document.getElementById('generateButton');
    const downloadLink = document.getElementById('downloadLink');
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');

    // (Canvasの高解像度対応 ... 変更なし)
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // --- イベントリスナー ---

    // ゲインスライダー
    gainInput.addEventListener('input', () => {
        gainValueDisplay.textContent = parseFloat(gainInput.value).toFixed(2);
        drawWaveform();
    });

    // 周波数
    frequencyInput.addEventListener('input', () => {
        drawWaveform();
    });

    // (追加) パンスライダー
    panInput.addEventListener('input', () => {
        panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
        // パンは波形プレビューには反映させない（プレビューはモノラルのため）
    });

    // 「生成ボタン」がクリックされたときの処理
    generateButton.addEventListener('click', async () => {

        // 1. パラメータの取得 (パンを追加)
        const duration = parseFloat(durationInput.value);
        const frequency = parseFloat(frequencyInput.value);
        const gain = parseFloat(gainInput.value);
        const pan = parseFloat(panInput.value); // 追加

        // (バリデーション ... 省略)
        if (isNaN(duration) || duration <= 0) { /*...*/ return; }
        if (isNaN(frequency) || frequency <= 0) { /*...*/ return; }
        if (isNaN(gain) || gain < 0 || gain > 1) { /*...*/ return; }
        if (isNaN(pan) || pan < -1 || pan > 1) { /*...*/ return; } // 追加

        console.log(`生成開始: ${duration}秒, ${frequency}Hz, ゲイン ${gain}, パン ${pan}`);

        try {
            // 2. オーディオバッファを生成 (引数にpanを追加)
            const audioBuffer = await createSineWaveBuffer(duration, frequency, gain, pan);

            // 3. AudioBufferをWAV(Blob)に変換 (ステレオ対応版)
            const wavBlob = bufferToWavBlob(audioBuffer);

            // 4. Blobをダウンロード
            const filename = `sine_${frequency}Hz_${duration}s_pan${pan.toFixed(1)}.wav`;
            downloadBlob(wavBlob, filename);

            console.log("生成完了");

        } catch (error) {
            console.error("WAVの生成に失敗しました:", error);
            alert("エラーが発生しました。コンソールを確認してください。");
        }
    });

    // --- 関数定義 ---

    /**
     * (追加) 波形をCanvasに描画する関数 (変更なし)
     */
    function drawWaveform() {
        // (前回と同じコード...省略)
        const frequency = parseFloat(frequencyInput.value) || 440;
        const gain = parseFloat(gainInput.value) || 0;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const midY = height / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 中央線
        ctx.beginPath();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
        // サイン波
        ctx.beginPath();
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 2;
        const timeRange = 0.02;
        let firstPoint = true;
        for (let x = 0; x <= width; x++) {
            const t = (x / width) * timeRange;
            const y = gain * Math.sin(2 * Math.PI * frequency * t);
            const canvasY = midY - (y * midY);
            if (firstPoint) {
                ctx.moveTo(x, canvasY);
                firstPoint = false;
            } else {
                ctx.lineTo(x, canvasY);
            }
        }
        ctx.stroke();
    }


    /**
     * 2. オーディオバッファを生成する関数 (ステレオ化 + Panner追加)
     * @param {number} duration - 秒数
     * @param {number} frequency - 周波数 (Hz)
     * @param {number} gain - 音量 (0.0 ～ 1.0)
     * @param {number} pan - パン (-1.0 ～ 1.0)
     * @returns {Promise<AudioBuffer>} 生成されたAudioBuffer
     */
    function createSineWaveBuffer(duration, frequency, gain, pan) {
        const sampleRate = 44100;
        const totalSamples = Math.floor(sampleRate * duration);

        // (変更) チャンネル数を 1 (モノラル) -> 2 (ステレオ) に変更
        const audioContext = new OfflineAudioContext(
            2,            // 2: ステレオ (チャンネル数)
            totalSamples, // 合計サンプルフレーム数
            sampleRate    // サンプルレート
        );

        // オシレーター (サイン波の元)
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, 0);

        // ゲインノード (音量)
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(gain, 0);

        // (追加) パンナーノード (左右)
        const pannerNode = audioContext.createStereoPanner();
        pannerNode.pan.setValueAtTime(pan, 0); // 引数のパンを設定

        // ノードの接続を変更
        // [オシレーター] -> [ゲイン] -> [パンナー] -> [最終出力]
        oscillator.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(audioContext.destination);

        // 開始・停止
        oscillator.start(0);
        oscillator.stop(duration);

        return audioContext.startRendering();
    }

    /**
     * 3. AudioBufferをWAV(Blob)に変換する関数 (ステレオ対応版)
     * @param {AudioBuffer} buffer - 変換元のAudioBuffer (ステレオ前提)
     * @returns {Blob} WAV形式のBlobオブジェクト
     */
    function bufferToWavBlob(buffer) {
        // (変更) チャンネル数を取得 (2になるはず)
        const numOfChan = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;

        // (変更) 左右両方のチャンネルのPCMデータを取得
        const pcmDataL = buffer.getChannelData(0); // 左チャンネル
        const pcmDataR = buffer.getChannelData(1); // 右チャンネル
        const dataLength = pcmDataL.length; // 左右の長さは同じ

        // (変更) データサイズは 左右の合計になる
        // (サンプル数 * チャンネル数 * 1サンプルあたりのバイト数)
        const dataSize = dataLength * numOfChan * bytesPerSample;

        const bufferSize = 44 + dataSize;
        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        // --- WAVヘッダ (チャンネル数やデータ速度がステレオ用に自動計算される) ---
        writeString(view, 0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numOfChan, true); // 2 が入る
        view.setUint32(24, sampleRate, true);
        // (変更) データ速度 (ステレオ用に自動計算)
        view.setUint32(28, sampleRate * numOfChan * bytesPerSample, true);
        // (変更) ブロックサイズ (ステレオ用に自動計算)
        view.setUint16(32, numOfChan * bytesPerSample, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // --- PCMデータを書き込む (変更) ---
        // ステレオWAVは、[L, R, L, R, L, R, ...] の順 (インターリーブ) で書き込む
        let offset = 44;
        for (let i = 0; i < dataLength; i++) {
            // 左チャンネルのサンプル
            let sL = Math.max(-1, Math.min(1, pcmDataL[i]));
            let valL = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;
            view.setInt16(offset, valL, true);
            offset += bytesPerSample;

            // 右チャンネルのサンプル
            let sR = Math.max(-1, Math.min(1, pcmDataR[i]));
            let valR = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
            view.setInt16(offset, valR, true);
            offset += bytesPerSample;
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    /*
     * 4. downloadBlob 関数 (変更なし)
     */
    function downloadBlob(blob, filename) {
        // (前回と同じコード...省略)
        const url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
    }

    /*
     * ヘルパー関数 (変更なし)
     */
    function writeString(view, offset, string) {
        // (前回と同じコード...省略)
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // --- 初期化 ---
    drawWaveform(); // 起動時に波形描画
    // (追加) 起動時にパンの初期値を表示
    panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
});
