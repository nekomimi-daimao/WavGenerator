window.addEventListener('DOMContentLoaded', () => {

    // HTML要素を取得
    const durationInput = document.getElementById('duration');
    const frequencyInput = document.getElementById('frequency');
    const gainInput = document.getElementById('gain');
    const gainValueDisplay = document.getElementById('gainValue');
    const generateButton = document.getElementById('generateButton');
    const downloadLink = document.getElementById('downloadLink');

    // (追加) Canvas関連
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');

    // (追加) 高解像度ディスプレイ対応 (Retinaなど)
    // Canvasの描画バッファサイズを、表示サイズ（CSS）の2倍（またはデバイス比率）にする
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr); // コンテキストのスケールを調整
    // ※CSSでCanvasの表示サイズ (width: 100%, height: 100px) を指定しているため、
    //   この処理で描画がボケるのを防ぎます。


    // --- イベントリスナー ---

    // (変更) スライダーを操作したら、値表示を更新し、波形を描画
    gainInput.addEventListener('input', () => {
        gainValueDisplay.textContent = parseFloat(gainInput.value).toFixed(2);
        drawWaveform(); // 描画関数を呼び出し
    });

    // (追加) 周波数が変更されたら波形を描画
    frequencyInput.addEventListener('input', () => {
        drawWaveform(); // 描画関数を呼び出し
    });

    // (追加) 再生長さの変更は波形表示には影響しませんが、念のため
    durationInput.addEventListener('input', () => {
        // 現在の実装では再生長さは波形プレビューに影響しない
        // もし将来的に影響させるなら、ここでも drawWaveform() を呼ぶ
    });

    // 「生成ボタン」がクリックされたときの処理
    generateButton.addEventListener('click', async () => {

        // 1. パラメータの取得
        const duration = parseFloat(durationInput.value);
        const frequency = parseFloat(frequencyInput.value);
        const gain = parseFloat(gainInput.value);

        // (バリデーションは省略...前回と同じ)
        if (isNaN(duration) || duration <= 0) { /*...*/ return; }
        if (isNaN(frequency) || frequency <= 0) { /*...*/ return; }
        if (isNaN(gain) || gain < 0 || gain > 1) { /*...*/ return; }

        console.log(`生成開始: ${duration}秒, ${frequency}Hz, ゲイン ${gain}`);

        try {
            // 2. サイン波のオーディオバッファを生成
            const audioBuffer = await createSineWaveBuffer(duration, frequency, gain);

            // 3. AudioBufferをWAVファイルのBlobに変換
            const wavBlob = bufferToWavBlob(audioBuffer);

            // 4. Blobをダウンロード
            const filename = `sine_${frequency}Hz_${duration}s.wav`;
            downloadBlob(wavBlob, filename);

            console.log("生成完了");

        } catch (error) {
            console.error("WAVの生成に失敗しました:", error);
            alert("エラーが発生しました。コンソールを確認してください。");
        }
    });

    // --- 関数定義 ---

    /**
     * (追加) 波形をCanvasに描画する関数
     */
    function drawWaveform() {
        // 現在のパラメータを取得
        const frequency = parseFloat(frequencyInput.value) || 440;
        const gain = parseFloat(gainInput.value) || 0;

        // Canvasのサイズ情報を取得 (CSSで指定した表示サイズ)
        const width = canvas.clientWidth; // 表示上の幅
        const height = canvas.clientHeight; // 表示上の高さ
        const midY = height / 2; // Y軸の中央

        // 描画をクリア
        // (scale()を考慮し、バッファサイズ(canvas.width)でクリア)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- 1. 中央線（ゼロ振幅）を描画 ---
        ctx.beginPath();
        ctx.strokeStyle = '#ccc'; // 薄いグレー
        ctx.lineWidth = 1;
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();

        // --- 2. サイン波を描画 ---
        ctx.beginPath();
        ctx.strokeStyle = '#007bff'; // ボタンと同じ青色
        ctx.lineWidth = 2; // 少し太く

        // Canvasの幅に表示する秒数を決定
        // (周波数が高いほど短くしないと潰れるが、ここでは固定値にする)
        // 440Hzの場合、0.01秒で約4.4周期。
        const timeRange = 0.02; // 0.02秒間をCanvas全体に描画

        let firstPoint = true;

        for (let x = 0; x <= width; x++) {
            // 現在のxピクセル位置を時間(t)に変換
            const t = (x / width) * timeRange;

            // サイン波の振幅yを計算 (値の範囲: -gain ～ +gain)
            const y = gain * Math.sin(2 * Math.PI * frequency * t);

            // 振幅yをCanvasのY座標に変換
            // (y = 0 が midY になるようにする)
            // (y = +gain が 0 に、 y = -gain が height に近づくように)
            // (y * midY) で、ゲインに応じた振幅を計算
            const canvasY = midY - (y * midY);

            if (firstPoint) {
                ctx.moveTo(x, canvasY);
                firstPoint = false;
            } else {
                ctx.lineTo(x, canvasY);
            }
        }
        ctx.stroke(); // 線を描画
    }


    /*
     * 2. createSineWaveBuffer 関数 (変更なし)
     */
    function createSineWaveBuffer(duration, frequency, gain) {
        // (前回と同じコード...省略)
        const sampleRate = 44100;
        const totalSamples = Math.floor(sampleRate * duration);
        const audioContext = new OfflineAudioContext(1, totalSamples, sampleRate);

        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, 0);

        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(gain, 0);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(0);
        oscillator.stop(duration);

        return audioContext.startRendering();
    }

    /*
     * 3. bufferToWavBlob 関数 (変更なし)
     */
    function bufferToWavBlob(buffer) {
        // (前回と同じコード...省略)
        const numOfChan = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const pcmData = buffer.getChannelData(0);
        const dataSize = pcmData.length * bytesPerSample;
        const bufferSize = 44 + dataSize;
        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);
        writeString(view, 0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numOfChan, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numOfChan * bytesPerSample, true);
        view.setUint16(32, numOfChan * bytesPerSample, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);
        let offset = 44;
        for (let i = 0; i < pcmData.length; i++) {
            const s = Math.max(-1, Math.min(1, pcmData[i]));
            const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset, val, true);
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
    // (追加) ページ読み込み時に、現在のデフォルト値で波形を一度描画する
    drawWaveform();

});
