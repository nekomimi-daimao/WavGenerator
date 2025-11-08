window.addEventListener('DOMContentLoaded', () => {

    // HTML要素を取得 (周波数とゲインを追加)
    const durationInput = document.getElementById('duration');
    const frequencyInput = document.getElementById('frequency'); // 追加
    const gainInput = document.getElementById('gain');           // 追加
    const gainValueDisplay = document.getElementById('gainValue'); // 追加
    const generateButton = document.getElementById('generateButton');
    const downloadLink = document.getElementById('downloadLink');

    // (追加) スライダーを操作したら、値表示を更新する
    gainInput.addEventListener('input', () => {
        // toFixed(2) で小数点以下2桁まで表示
        gainValueDisplay.textContent = parseFloat(gainInput.value).toFixed(2);
    });

    // 「生成ボタン」がクリックされたときの処理
    generateButton.addEventListener('click', async () => {

        // 1. パラメータの取得 (周波数とゲインを追加)
        const duration = parseFloat(durationInput.value);
        const frequency = parseFloat(frequencyInput.value); // 追加
        const gain = parseFloat(gainInput.value);           // 追加

        // 簡単なバリデーション (入力チェック)
        if (isNaN(duration) || duration <= 0) {
            alert("再生の長さを正しく入力してください。");
            return;
        }
        if (isNaN(frequency) || frequency <= 0) {
            alert("周波数を正しく入力してください。");
            return;
        }
        if (isNaN(gain) || gain < 0 || gain > 1) {
            alert("ゲインは0から1の間で入力してください。");
            return;
        }

        console.log(`生成開始: ${duration}秒, ${frequency}Hz, ゲイン ${gain}`);

        try {
            // 2. サイン波のオーディオバッファを生成 (引数を追加)
            const audioBuffer = await createSineWaveBuffer(duration, frequency, gain);

            // 3. AudioBufferをWAVファイルのBlobに変換 (変更なし)
            const wavBlob = bufferToWavBlob(audioBuffer);

            // 4. Blobをダウンロード (ファイル名を少し変更)
            const filename = `sine_${frequency}Hz_${duration}s.wav`;
            downloadBlob(wavBlob, filename);

            console.log("生成完了");

        } catch (error) {
            console.error("WAVの生成に失敗しました:", error);
            alert("エラーが発生しました。コンソールを確認してください。");
        }
    });

    /**
     * 2. サイン波のオーディオバッファを生成する関数 (引数を追加)
     * @param {number} duration - 生成する秒数
     * @param {number} frequency - 周波数 (Hz)
     * @param {number} gain - 音量 (0.0 ～ 1.0)
     * @returns {Promise<AudioBuffer>} 生成されたAudioBuffer
     */
    function createSineWaveBuffer(duration, frequency, gain) {
        const sampleRate = 44100;
        const totalSamples = Math.floor(sampleRate * duration);
        const audioContext = new OfflineAudioContext(1, totalSamples, sampleRate);

        // サイン波を生成するノード (オシレーター)
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, 0); // 引数の周波数を設定

        // (追加) 音量を制御するノード (ゲイン)
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(gain, 0); // 引数のゲインを設定

        // ノードの接続を変更
        // [オシレーター] -> [ゲインノード] -> [最終出力]
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // 音声の生成を開始・停止
        oscillator.start(0);
        oscillator.stop(duration);

        return audioContext.startRendering();
    }

    /**
     * 3. AudioBufferをWAV(Blob)に変換する関数
     * (この関数は前回から変更ありません)
     */
    function bufferToWavBlob(buffer) {
        const numOfChan = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;

        const pcmData = buffer.getChannelData(0);
        const dataSize = pcmData.length * bytesPerSample;

        const bufferSize = 44 + dataSize;
        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        // WAVヘッダ
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

        // PCMデータ
        let offset = 44;
        for (let i = 0; i < pcmData.length; i++) {
            const s = Math.max(-1, Math.min(1, pcmData[i]));
            const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset, val, true);
            offset += bytesPerSample;
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    /**
     * ヘルパー関数 (変更なし)
     */
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    /**
     * 4. Blobデータをファイルとしてダウンロードさせる関数 (変更なし)
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
});
