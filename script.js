window.addEventListener('DOMContentLoaded', () => {

    // ▼▼▼ 1. HTML要素を取得 ▼▼▼
    const durationInput = document.getElementById('duration');
    const onDurationInput = document.getElementById('onDuration');
    const offDurationInput = document.getElementById('offDuration');
    const frequencyInput = document.getElementById('frequency');
    const gainInput = document.getElementById('gain');
    const gainValueDisplay = document.getElementById('gainValue');
    const panInput = document.getElementById('pan');
    const panValueDisplay = document.getElementById('panValue');

    const generateButton = document.getElementById('generateButton');
    const downloadLink = document.getElementById('downloadLink');
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');

    // Canvasの高解像度対応
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // --- イベントリスナー ---

    const inputElementsToWatch = [
        durationInput,
        onDurationInput,
        offDurationInput,
        frequencyInput,
        gainInput
    ];

    inputElementsToWatch.forEach(input => {
        input.addEventListener('input', () => {
            if (input === gainInput) {
                gainValueDisplay.textContent = parseFloat(gainInput.value).toFixed(2);
            } else if (input === panInput) {
                panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
            }
            drawWaveform();
        });
    });

    // 「生成ボタン」がクリックされたときの処理
    generateButton.addEventListener('click', async () => {

        // 1. パラメータの取得
        const duration = parseFloat(durationInput.value);
        const onDuration = parseFloat(onDurationInput.value);
        const offDuration = parseFloat(offDurationInput.value);
        const frequency = parseFloat(frequencyInput.value);
        const gain = parseFloat(gainInput.value);
        const pan = parseFloat(panInput.value);

        // バリデーション
        if (isNaN(duration) || duration <= 0) { alert("全体の長さを正しく入力してください。"); return; }
        if (isNaN(onDuration) || onDuration <= 0) { alert("音が鳴る時間を正しく入力してください。"); return; }
        if (isNaN(offDuration) || offDuration < 0) { alert("無音の時間を正しく入力してください。"); return; }
        if (isNaN(frequency) || frequency <= 0) { alert("周波数を正しく入力してください。"); return; }
        if (isNaN(gain) || gain < 0 || gain > 1) { alert("ゲインは0から1の間で入力してください。"); return; }
        if (isNaN(pan) || pan < -1 || pan > 1) { alert("パンは-1から1の間で入力してください。"); return; }

        try {
            // 2. オーディオバッファを生成
            const audioBuffer = await createSineWaveBuffer(duration, onDuration, offDuration, frequency, gain, pan);

            // 3. AudioBufferをWAV(Blob)に変換
            const wavBlob = bufferToWavBlob(audioBuffer);

            // ファイル名生成ロジック
            const panLabel = pan === 0 ? 'C' : (pan < 0 ? 'L' : 'R') + Math.abs(pan).toFixed(2).replace('.', '');
            const gainLabel = gain.toFixed(2).replace('.', '');
            const freqLabel = frequency.toFixed(0);
            const durLabel = duration.toFixed(0);
            const onLabel = onDuration.toFixed(0);
            const offLabel = offDuration.toFixed(0);
            const filename = `Dur${durLabel}_ON${onLabel}_OFF${offLabel}_Freq${freqLabel}_Gain${gainLabel}_Pan${panLabel}.wav`;

            // 4. Blobをダウンロード
            downloadBlob(wavBlob, filename);
            console.log(`生成完了: ${filename}`);

        } catch (error) {
            console.error("WAVの生成に失敗しました:", error);
            alert("エラーが発生しました。コンソールを確認してください。");
        }
    });

    // ------------------------------------
    // --- 関数定義 ---
    // ------------------------------------

    /**
     * 波形をCanvasに描画する関数 (全体表示のために修正済み)
     */
    function drawWaveform() {
        const frequency = parseFloat(frequencyInput.value) || 440;
        const gain = parseFloat(gainInput.value) || 0;
        const onDuration = parseFloat(onDurationInput.value) || 1;
        const offDuration = parseFloat(offDurationInput.value) || 1;
        const period = onDuration + offDuration;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const midY = height / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 2;

        // ▼▼▼ 波形の全体表示のための修正ロジック ▼▼▼
        const currentDuration = parseFloat(durationInput.value) || 30; // 現在の全体の長さを取得
        let cyclesToDraw = 2; // 最低2周期

        // 周期 (period) がゼロまたは負の場合は描画しないように保護
        if (period <= 0) return;

        const maxCyclesToShow = Math.ceil(currentDuration / period);

        // 最大10周期、または全体の長さに含まれる周期の数まで描画します。
        if (maxCyclesToShow > 2) {
            cyclesToDraw = Math.min(10, maxCyclesToShow);
        }

        const timeRange = period * cyclesToDraw; // 描画する時間の範囲を決定
        // ▲▲▲ 修正ロジック終了 ▲▲▲

        if (timeRange === 0) {
            return;
        }

        let firstPoint = true;

        for (let x = 0; x <= width; x++) {
            const t = (x / width) * timeRange;
            const t_in_period = t % period;

            let instantaneous_gain = 0;
            if (t_in_period < onDuration) {
                instantaneous_gain = gain;
            } else {
                instantaneous_gain = 0;
            }

            const y = instantaneous_gain * Math.sin(2 * Math.PI * frequency * t);
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
     * 2. オーディオバッファを生成する関数
     */
    function createSineWaveBuffer(duration, onDuration, offDuration, frequency, gain, pan) {
        const sampleRate = 44100;
        const totalSamples = Math.floor(sampleRate * duration);
        const audioContext = new OfflineAudioContext(2, totalSamples, sampleRate);
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, 0);
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0, 0);
        const pannerNode = audioContext.createStereoPanner();
        pannerNode.pan.setValueAtTime(pan, 0);
        oscillator.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(audioContext.destination);
        const cyclePeriod = onDuration + offDuration;
        let currentTime = 0;

        while (currentTime < duration) {
            gainNode.gain.setValueAtTime(gain, currentTime);
            currentTime += onDuration;
            gainNode.gain.setValueAtTime(0, currentTime);
            currentTime += offDuration;
        }

        oscillator.start(0);
        oscillator.stop(duration);
        return audioContext.startRendering();
    }

    /**
     * 3. AudioBufferをWAV(Blob)に変換する関数
     */
    function bufferToWavBlob(buffer) {
        const numOfChan = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const pcmDataL = buffer.getChannelData(0);
        const pcmDataR = buffer.getChannelData(1);
        const dataLength = pcmDataL.length;
        const dataSize = dataLength * numOfChan * bytesPerSample;
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
        for (let i = 0; i < dataLength; i++) {
            let sL = Math.max(-1, Math.min(1, pcmDataL[i]));
            let valL = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;
            view.setInt16(offset, valL, true);
            offset += bytesPerSample;
            let sR = Math.max(-1, Math.min(1, pcmDataR[i]));
            let valR = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
            view.setInt16(offset, valR, true);
            offset += bytesPerSample;
        }
        return new Blob([view], { type: 'audio/wav' });
    }

    /**
     * 4. Blobデータをファイルとしてダウンロードさせる関数
     */
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
    }

    /**
     * ヘルパー関数
     */
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }


    // --- 初期化 ---
    drawWaveform();
    panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
});
