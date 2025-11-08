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

    const previewButton = document.getElementById('previewButton');
    const stopButton = document.getElementById('stopButton');
    const generateButton = document.getElementById('generateButton');
    const downloadLink = document.getElementById('downloadLink');
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');

    // ▼▼▼ グローバル変数 ▼▼▼
    let audioContext = null;
    let isPlaying = false;
    let currentOscillator = null;

    // --- ヘルパー関数 ---

    function getAudioContext() {
        if (audioContext === null || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    function resetUI() {
        isPlaying = false;
        currentOscillator = null;
        previewButton.textContent = 'プレビュー再生';
        previewButton.disabled = false;
        stopButton.disabled = true;
    }

    /**
     * 最新の入力パラメータをオブジェクトとして取得する関数
     * ★ 波形表示/再生/生成の前に毎回これを呼び出します。★
     */
    function getParameters() {
        return {
            duration: parseFloat(durationInput.value) || 30,
            onDuration: parseFloat(onDurationInput.value) || 1,
            offDuration: parseFloat(offDurationInput.value) || 1,
            frequency: parseFloat(frequencyInput.value) || 440,
            gain: parseFloat(gainInput.value) || 0.5,
            pan: parseFloat(panInput.value) || 0
        };
    }

    // --- AudioContext/WAV関連の関数 ---

    /**
     * 2-A. オーディオバッファを生成する関数 (WAVダウンロード用)
     */
    function createSineWaveBuffer(params) {
        const { duration, onDuration, offDuration, frequency, gain, pan } = params;

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
     * 2-B. サイン波をリアルタイムで再生する関数 (プレビュー用)
     */
    function playSineWave(params) {
        const { duration, onDuration, offDuration, frequency, gain, pan } = params;

        return new Promise((resolve) => {
            const context = getAudioContext();

            const oscillator = context.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, 0);

            const gainNode = context.createGain();
            gainNode.gain.setValueAtTime(0, context.currentTime);

            const pannerNode = context.createStereoPanner();
            pannerNode.pan.setValueAtTime(pan, context.currentTime);

            oscillator.connect(gainNode);
            gainNode.connect(pannerNode);
            pannerNode.connect(context.destination);

            currentOscillator = oscillator;

            let currentTime = context.currentTime;
            const endTime = currentTime + duration;
            const cyclePeriod = onDuration + offDuration;

            while (currentTime < endTime) {
                gainNode.gain.setValueAtTime(gain, currentTime);
                currentTime += onDuration;
                gainNode.gain.setValueAtTime(0, currentTime);
                currentTime += offDuration;
            }

            oscillator.start(context.currentTime);
            oscillator.stop(context.currentTime + duration);

            oscillator.onended = () => {
                // クリーンアップ
                oscillator.disconnect();
                gainNode.disconnect();
                pannerNode.disconnect();
                resolve();
            };
        });
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


    // --- 波形描画関数 ---

    /**
     * 波形をCanvasに描画する関数
     */
    function drawWaveform() {
        // ★ 最新のパラメータを取得 ★
        const params = getParameters();
        const { frequency, gain, onDuration, offDuration } = params;
        const period = onDuration + offDuration;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const midY = height / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 中心線
        ctx.beginPath();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 2;

        const currentDuration = params.duration; // drawWaveformの引数ではなく、最新値を取得

        let cyclesToDraw = 2;

        if (period <= 0) return;

        const maxCyclesToShow = Math.ceil(currentDuration / period);

        if (maxCyclesToShow > 2) {
            cyclesToDraw = Math.min(10, maxCyclesToShow);
        }

        const timeRange = period * cyclesToDraw;

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


    // --- イベントリスナーの再設定 ---

    const inputElementsToWatch = [
        durationInput,
        onDurationInput,
        offDurationInput,
        frequencyInput,
        gainInput,
        panInput
    ];

    inputElementsToWatch.forEach(input => {
        input.addEventListener('input', () => {
            if (input === gainInput) {
                gainValueDisplay.textContent = parseFloat(gainInput.value).toFixed(2);
            } else if (input === panInput) {
                panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
            }
            // ★ 入力が変更されたら波形を再描画 ★
            drawWaveform();
        });
    });

    // 「プレビュー再生」ボタンの処理
    previewButton.addEventListener('click', () => {
        if (isPlaying) {
            return;
        }

        const params = getParameters();

        // バリデーション
        if (isNaN(params.duration) || params.duration <= 0) { alert("全体の長さを正しく入力してください。"); return; }
        if (isNaN(params.onDuration) || params.onDuration <= 0) { alert("音が鳴る時間を正しく入力してください。"); return; }
        if (isNaN(params.offDuration) || params.offDuration < 0) { alert("無音の時間を正しく入力してください。"); return; }
        if (isNaN(params.frequency) || params.frequency <= 0) { alert("周波数を正しく入力してください。"); return; }
        if (isNaN(params.gain) || params.gain < 0 || params.gain > 1) { alert("ゲインは0から1の間で入力してください。"); return; }
        if (isNaN(params.pan) || params.pan < -1 || params.pan > 1) { alert("パンは-1から1の間で入力してください。"); return; }

        isPlaying = true;
        previewButton.textContent = '再生中...';
        previewButton.disabled = true;
        stopButton.disabled = false;

        // ★ playSineWave にパラメータオブジェクトを渡す ★
        playSineWave(params)
            .then(resetUI)
            .catch(error => {
                console.error("再生エラー:", error);
                resetUI();
            });
    });

    // 「停止」ボタンの処理
    stopButton.addEventListener('click', () => {
        if (currentOscillator) {
            currentOscillator.stop();
        }
    });

    // 「生成ボタン」がクリックされたときの処理 (修正)
    generateButton.addEventListener('click', async () => {

        // ★ 最新のパラメータを取得 ★
        const params = getParameters();
        const { duration, onDuration, offDuration, frequency, gain, pan } = params;

        // バリデーション 
        if (isNaN(duration) || duration <= 0) { alert("全体の長さを正しく入力してください。"); return; }
        if (isNaN(onDuration) || onDuration <= 0) { alert("音が鳴る時間を正しく入力してください。"); return; }
        if (isNaN(offDuration) || offDuration < 0) { alert("無音の時間を正しく入力してください。"); return; }
        if (isNaN(frequency) || frequency <= 0) { alert("周波数を正しく入力してください。"); return; }
        if (isNaN(gain) || gain < 0 || gain > 1) { alert("ゲインは0から1の間で入力してください。"); return; }
        if (isNaN(pan) || pan < -1 || pan > 1) { alert("パンは-1から1の間で入力してください。"); return; }

        try {
            // 2. オーディオバッファを生成 (パラメータオブジェクトを渡す)
            const audioBuffer = await createSineWaveBuffer(params);

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


    // --- 初期化 ---
    drawWaveform();
    panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
});
