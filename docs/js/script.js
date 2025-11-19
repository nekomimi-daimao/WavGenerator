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
    const generateButton = document.getElementById('generateButton');
    const downloadLink = document.getElementById('downloadLink');
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');

    // ▼▼▼ グローバル変数 ▼▼▼
    let audioContext = null;
    let isPlaying = false;
    let currentOscillator = null;
    // currentGainNode, currentPannerNode は削除し、元の状態に戻しました

    // --- ヘルパー関数 ---

    function getAudioContext() {
        if (audioContext === null || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    /**
     * UIを初期状態（停止状態）に戻す
     */
    function resetUI() {
        isPlaying = false;
        if (currentOscillator) {
            // 安全のため、オシレーターが残っていたら接続を解除
            try {
                currentOscillator.stop(0); // 既に停止していてもエラーにならないように
                currentOscillator.disconnect();
            } catch (e) {
                // 停止済みの場合のエラーを無視
            }
        }
        currentOscillator = null;
        previewButton.textContent = 'プレビュー再生';
        previewButton.disabled = false;
        previewButton.style.backgroundColor = '#28a745';
    }

    /**
     * 最新の入力パラメータをオブジェクトとして取得する関数
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

    // --- AudioContext/WAV関連の関数 (元の状態に戻しました) ---

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

    function playSineWave(params) {
        const { duration, onDuration, offDuration, frequency, gain, pan } = params;

        return new Promise((resolve) => {
            const context = getAudioContext();

            const oscillator = context.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, 0);

            const gainNode = context.createGain();
            // playSineWave内のゲイン設定は元の状態に戻しました
            gainNode.gain.setValueAtTime(0, context.currentTime);

            const pannerNode = context.createStereoPanner();
            pannerNode.pan.setValueAtTime(pan, context.currentTime);

            oscillator.connect(gainNode);
            gainNode.connect(pannerNode);
            pannerNode.connect(context.destination);

            currentOscillator = oscillator; // オシレーターのみグローバルに保持

            let currentTime = context.currentTime;
            const endTime = currentTime + duration;

            while (currentTime < endTime) {
                gainNode.gain.setValueAtTime(gain, currentTime);
                currentTime += onDuration;
                gainNode.gain.setValueAtTime(0, currentTime);
                currentTime += offDuration;
            }

            oscillator.start(context.currentTime);
            oscillator.stop(context.currentTime + duration);

            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
                pannerNode.disconnect();
                resolve();
            };
        });
    }

    // --- Audio Paramatersの即時更新関数 (削除しました) ---


    // --- 波形描画関数 (省略) ---

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const visualWidth = canvas.clientWidth;
    const visualHeight = canvas.clientHeight;

    function drawWaveform() {
        const params = getParameters();
        const { frequency, gain, onDuration, offDuration } = params;
        const period = onDuration + offDuration;
        const width = visualWidth;
        const height = visualHeight;
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
        const currentDuration = params.duration;
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


    // --- イベントリスナー ---

    const inputElementsToWatch = [
        durationInput,
        onDurationInput,
        offDurationInput,
        frequencyInput,
        gainInput,
        panInput
    ];

    inputElementsToWatch.forEach(input => {

        // 1. inputイベント: リアルタイムフィードバック + 再生停止ロジックを追加
        input.addEventListener('input', () => {

            // スライダーの値表示の更新
            if (input === gainInput) {
                gainValueDisplay.textContent = parseFloat(gainInput.value).toFixed(2);
            } else if (input === panInput) {
                panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
            }

            drawWaveform();

            // ★ プレビュー再生中の場合、即座に停止する ★
            if (isPlaying) {
                if (currentOscillator) {
                    currentOscillator.stop();
                    // currentOscillatorのonendedハンドラがresetUIを呼ぶため、ここでisPlaying=falseは設定しない
                }
            }
        });

        // 2. changeイベント: 値が確定したとき（フォーカスが外れたとき）にバリデーションと修正を実行
        if (input.type === 'number' || input === gainInput || input === panInput) {
            input.addEventListener('change', () => {

                // 数値入力フィールドのみバリデーションとゼロ除去を行う
                if (input.type === 'number') {
                    let currentValue = parseFloat(input.value);
                    const minValue = parseFloat(input.min);
                    const defaultValue = input.defaultValue;

                    let needsCorrection = false;

                    if (isNaN(currentValue) || input.value.trim() === '') {
                        needsCorrection = true;
                    }

                    if (!isNaN(minValue) && currentValue < minValue) {
                        needsCorrection = true;
                    }

                    if (needsCorrection) {
                        input.value = defaultValue;
                        currentValue = parseFloat(defaultValue);
                    }

                    if (!isNaN(currentValue)) {
                        input.value = currentValue.toString();
                    }
                }

                // 値が修正された可能性があるため、波形を再描画
                drawWaveform();

                // changeイベントでも再生中なら停止 (手入力してEnterを押した場合など)
                if (isPlaying) {
                    if (currentOscillator) {
                        currentOscillator.stop();
                    }
                }
            });
        }
    });

    /**
     * 「プレビュー再生/停止」ボタンの処理
     */
    previewButton.addEventListener('click', () => {
        if (isPlaying) {
            if (currentOscillator) {
                currentOscillator.stop();
            }
        } else {
            // 再生前は念のためすべてのフィールドの値を確定させる (changeイベントを手動で発火)
            inputElementsToWatch.forEach(input => {
                if (input.type === 'number' || input.type === 'range') {
                    input.dispatchEvent(new Event('change'));
                }
            });

            const params = getParameters();

            // 最終バリデーション
            if (isNaN(params.duration) || params.duration <= 0) { alert("全体の長さを正しく入力してください。"); return; }
            if (isNaN(params.onDuration) || params.onDuration <= 0) { alert("音が鳴る時間を正しく入力してください。"); return; }
            if (isNaN(params.offDuration) || params.offDuration < 0) { alert("無音の時間を正しく入力してください。"); return; }
            if (isNaN(params.frequency) || params.frequency < 20 || params.frequency > 99999) { alert("周波数を20Hzから99999Hzの間で正しく入力してください。"); return; }
            if (isNaN(params.gain) || params.gain < 0 || params.gain > 1) { alert("ゲインは0から1の間で入力してください。"); return; }
            if (isNaN(params.pan) || params.pan < -1 || params.pan > 1) { alert("パンは-1から1の間で入力してください。"); return; }

            isPlaying = true;
            previewButton.textContent = '停止';
            previewButton.style.backgroundColor = '#dc3545';

            playSineWave(params)
                .then(resetUI)
                .catch(error => {
                    console.error("再生エラー:", error);
                    resetUI();
                });
        }
    });

    /**
     * 「ダウンロード」ボタンがクリックされたときの処理 (変更なし)
     */
    generateButton.addEventListener('click', async () => {

        // ダウンロード前は念のためすべてのフィールドの値を確定させる (changeイベントを手動で発火)
        inputElementsToWatch.forEach(input => {
            if (input.type === 'number' || input.type === 'range') {
                input.dispatchEvent(new Event('change'));
            }
        });

        const params = getParameters();
        const { duration, onDuration, offDuration, frequency, gain, pan } = params;

        // 最終バリデーション
        if (isNaN(duration) || duration <= 0) { alert("全体の長さを正しく入力してください。"); return; }
        if (isNaN(onDuration) || onDuration <= 0) { alert("音が鳴る時間を正しく入力してください。"); return; }
        if (isNaN(offDuration) || offDuration < 0) { alert("無音の時間を正しく入力してください。"); return; }
        if (isNaN(frequency) || frequency < 20 || frequency > 99999) { alert("周波数を20Hzから99999Hzの間で正しく入力してください。"); return; }
        if (isNaN(gain) || gain < 0 || gain > 1) { alert("ゲインは0から1の間で入力してください。"); return; }
        if (isNaN(pan) || pan < -1 || pan > 1) { alert("パンは-1から1の間で入力してください。"); return; }

        try {
            const originalText = generateButton.textContent;
            generateButton.textContent = "生成中...";
            generateButton.disabled = true;

            const audioBuffer = await createSineWaveBuffer(params);
            const wavBlob = bufferToWavBlob(audioBuffer);

            const panLabel = pan === 0 ? 'C' : (pan < 0 ? 'L' : 'R') + Math.abs(pan).toFixed(2).replace('.', '');
            const gainLabel = gain.toFixed(2).replace('.', '');
            const freqLabel = frequency.toFixed(0);
            const durLabel = duration.toFixed(0);
            const onLabel = onDuration.toFixed(0);
            const offLabel = offDuration.toFixed(0);
            const filename = `Dur${durLabel}_ON${onLabel}_OFF${offLabel}_Freq${freqLabel}_Gain${gainLabel}_Pan${panLabel}.wav`;

            downloadBlob(wavBlob, filename);
            console.log(`生成完了: ${filename}`);

            generateButton.textContent = originalText;
            generateButton.disabled = false;

        } catch (error) {
            console.error("WAVの生成に失敗しました:", error);
            alert("エラーが発生しました。コンソールを確認してください。");
            generateButton.textContent = "ダウンロード";
            generateButton.disabled = false;
        }
    });


    // --- 初期化 ---
    drawWaveform();
    panValueDisplay.textContent = parseFloat(panInput.value).toFixed(2);
});
