// =====================================================
// QAZAQVOICE AI - REAL-TIME VIDEO DUBBING
// =====================================================

// Батырмаларды кез келген тәсілмен табу (ID немесе класс бойынша)
const startButton = document.getElementById("startDubbing") || 
                    document.querySelector(".btn-start") || 
                    document.querySelector("button");

const stopButton = document.getElementById("stopDubbing") || 
                   document.querySelector(".btn-stop");
const languageSelect = document.getElementById("language");
const statusElement = document.getElementById("captureStatus");
const livePanel = document.getElementById("livePanel");
const transcriptElement = document.getElementById("transcript");
const translatedElement = document.getElementById("translated");

let stream = null;
let mediaRecorder = null;
let sessionId = null;
let selectedLanguage = "kk";
let isRecording = false;

setStatus("● Дайын — дубляжды бастауға болады", "ready");

function setStatus(message, type = "ready") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.classList.remove("active", "error");
    if (type === "active") statusElement.classList.add("active");
    if (type === "error") statusElement.classList.add("error");
}

async function startDubbing() {
    if (isRecording) return;

    try {
        selectedLanguage = languageSelect ? languageSelect.value : "kk";
        setStatus("● Дайындалып жатыр...", "active");
        startButton.disabled = true;

        // 1. Сессия ашу
        const sessionResponse = await fetch("/api/dubbing/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: selectedLanguage })
        });

        if (!sessionResponse.ok) throw new Error("Серверге қосылу мүмкін болмады");

        const sessionData = await sessionResponse.json();
        if (!sessionData.success) throw new Error("Сессия ашылмады");

        sessionId = sessionData.sessionId;

        // 2. Экран/вкладка дыбысын таңдау
        setStatus("● YouTube вкладкасын немесе экранды таңдаңыз...", "active");
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

        const audioTracks = stream.getAudioTracks();
        if (!audioTracks || audioTracks.length === 0) {
            stopAllTracks();
            throw new Error("Аудио алынбады. Share audio параметрін қосыңыз.");
        }

        let mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/webm";
        }

        mediaRecorder = new MediaRecorder(stream, { mimeType });

        mediaRecorder.ondataavailable = async (event) => {
            if (!event.data || event.data.size === 0) return;
            await sendAudioChunk(event.data);
        };

        stream.getVideoTracks().forEach(track => {
            track.onended = () => {
                if (isRecording) stopDubbing();
            };
        });

        mediaRecorder.start(1000);
        isRecording = true;

        startButton.style.display = "none";
        stopButton.style.display = "block";
        if (livePanel) livePanel.classList.add("active");
        if (transcriptElement) transcriptElement.textContent = "Listening...";
        if (translatedElement) translatedElement.textContent = "Қазақша дубляж дайындалуда...";

        setStatus("● LIVE — YouTube дыбысы қабылданып жатыр", "active");

    } catch (error) {
        console.error(error);
        isRecording = false;
        stopAllTracks();
        startButton.disabled = false;
        startButton.style.display = "block";
        stopButton.style.display = "none";
        if (livePanel) livePanel.classList.remove("active");
        setStatus("❌ " + error.message, "error");
    }
}

async function sendAudioChunk(blob) {
    if (!sessionId) return;
    try {
        const base64 = await blobToBase64(blob);
        await fetch("/api/dubbing/audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, audio: base64 })
        });
    } catch (error) {
        console.error("Audio upload error:", error);
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            const base64 = result.split(",")[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function stopDubbing() {
    if (!isRecording && !sessionId) return;
    isRecording = false;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    mediaRecorder = null;
    stopAllTracks();

    if (sessionId) {
        try {
            setStatus("● Өңделіп жатыр (Python Whisper)...", "active");
            
            const response = await fetch("/api/dubbing/stop", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId })
            });

            const data = await response.json();

            // Серверден қайтқан мәтінді экранға шығарамыз
            if (data.success && data.text) {
                if (transcriptElement) {
                    transcriptElement.textContent = data.text;
                }
                if (translatedElement) {
                    translatedElement.textContent = "Нәтиже: " + data.text;
                }
            }
        } catch (error) {
            console.error(error);
            setStatus("❌ Қате орын алды", "error");
        }
    }

    sessionId = null;
    startButton.disabled = false;
    startButton.style.display = "block";
    stopButton.style.display = "none";
    if (livePanel) livePanel.classList.remove("active");
    setStatus("● Дайын — дубляжды қайта бастауға болады", "ready");
}

function stopAllTracks() {
    if (!stream) return;
    stream.getTracks().forEach(track => track.stop());
    stream = null;
}

if (startButton) startButton.addEventListener("click", startDubbing);
if (stopButton) stopButton.addEventListener("click", stopDubbing);

if (languageSelect) {
    languageSelect.addEventListener("change", () => {
        selectedLanguage = languageSelect.value;
    });
}

window.addEventListener("beforeunload", () => { stopAllTracks(); });
