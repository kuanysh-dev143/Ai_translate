// =====================================================
// QAZAQVOICE AI
// REAL-TIME VIDEO DUBBING
// =====================================================


// =====================================================
// ELEMENTS
// =====================================================

const startButton =
    document.getElementById("startDubbing");

const stopButton =
    document.getElementById("stopDubbing");

const languageSelect =
    document.getElementById("language");

const statusElement =
    document.getElementById("captureStatus");

const livePanel =
    document.getElementById("livePanel");

const transcriptElement =
    document.getElementById("transcript");

const translatedElement =
    document.getElementById("translated");


// =====================================================
// STATE
// =====================================================

let stream = null;

let mediaRecorder = null;

let sessionId = null;

let selectedLanguage = "kk";

let isRecording = false;


// =====================================================
// INITIAL STATUS
// =====================================================

setStatus(
    "● Дайын — дубляжды бастауға болады",
    "ready"
);


// =====================================================
// STATUS FUNCTION
// =====================================================

function setStatus(
    message,
    type = "ready"
) {

    if (!statusElement) {
        return;
    }


    statusElement.textContent =
        message;


    statusElement.classList.remove(
        "active",
        "error"
    );


    if (type === "active") {

        statusElement.classList.add(
            "active"
        );

    }


    if (type === "error") {

        statusElement.classList.add(
            "error"
        );

    }

}


// =====================================================
// START DUBBING
// =====================================================

async function startDubbing() {

    if (isRecording) {
        return;
    }


    try {

        selectedLanguage =
            languageSelect
                ? languageSelect.value
                : "kk";


        setStatus(
            "● Дайындалып жатыр...",
            "active"
        );


        startButton.disabled =
            true;


        // =================================================
        // 1. CREATE SERVER SESSION
        // =================================================

        const sessionResponse =
            await fetch(
                "/api/dubbing/start",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        language:
                            selectedLanguage

                    })

                }
            );


        if (!sessionResponse.ok) {

            throw new Error(
                "Серверге қосылу мүмкін болмады"
            );

        }


        const sessionData =
            await sessionResponse.json();


        if (!sessionData.success) {

            throw new Error(
                sessionData.message ||
                "Сессия ашылмады"
            );

        }


        sessionId =
            sessionData.sessionId;


        console.log(
            "Session:",
            sessionId
        );


        // =================================================
        // 2. REQUEST SCREEN / TAB CAPTURE
        // =================================================

        setStatus(
            "● YouTube вкладкасын немесе экранды таңдаңыз...",
            "active"
        );


        stream =
            await navigator.mediaDevices
                .getDisplayMedia({

                    video: true,

                    audio: true

                });


        // =================================================
        // 3. CHECK AUDIO
        // =================================================

        const audioTracks =
            stream.getAudioTracks();


        if (
            !audioTracks ||
            audioTracks.length === 0
        ) {

            stopAllTracks();

            throw new Error(
                "Аудио алынбады. YouTube вкладкасын таңдағанда Share audio / Делиться звуком параметрін қосыңыз."
            );

        }


        // =================================================
        // 4. RECORDING
        // =================================================

        let mimeType =
            "audio/webm;codecs=opus";


        if (
            !MediaRecorder.isTypeSupported(
                mimeType
            )
        ) {

            mimeType =
                "audio/webm";

        }


        mediaRecorder =
            new MediaRecorder(
                stream,
                {
                    mimeType
                }
            );


        // =================================================
        // 5. AUDIO DATA
        // =================================================

        mediaRecorder.ondataavailable =
            async (event) => {

                if (
                    !event.data ||
                    event.data.size === 0
                ) {

                    return;

                }


                await sendAudioChunk(
                    event.data
                );

            };


        // =================================================
        // 6. RECORDER STOP
        // =================================================

        mediaRecorder.onstop =
            () => {

                console.log(
                    "MediaRecorder stopped"
                );

            };


        // =================================================
        // 7. USER STOPS SCREEN SHARING
        // =================================================

        stream
            .getVideoTracks()
            .forEach(track => {

                track.onended =
                    () => {

                        if (
                            isRecording
                        ) {

                            stopDubbing();

                        }

                    };

            });


        // =================================================
        // 8. START
        // =================================================

        mediaRecorder.start(
            1000
        );


        isRecording =
            true;


        // =================================================
        // UI
        // =================================================

        startButton.style.display =
            "none";


        stopButton.style.display =
            "block";


        if (livePanel) {

            livePanel.classList.add(
                "active"
            );

        }


        if (transcriptElement) {

            transcriptElement.textContent =
                "Listening...";

        }


        if (translatedElement) {

            translatedElement.textContent =
                "Қазақша дубляж дайындалуда...";

        }


        setStatus(
            "● LIVE — YouTube дыбысы қабылданып жатыр",
            "active"
        );


        console.log(
            "QazaqVoice recording started"
        );

    }

    catch (error) {

        console.error(
            error
        );


        isRecording =
            false;


        stopAllTracks();


        startButton.disabled =
            false;


        startButton.style.display =
            "block";


        stopButton.style.display =
            "none";


        if (livePanel) {

            livePanel.classList.remove(
                "active"
            );

        }


        setStatus(
            "❌ " + error.message,
            "error"
        );

    }

}


// =====================================================
// SEND AUDIO CHUNK
// =====================================================

async function sendAudioChunk(
    blob
) {

    if (!sessionId) {
        return;
    }


    try {

        const base64 =
            await blobToBase64(
                blob
            );


        await fetch(
            "/api/dubbing/audio",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    sessionId,

                    audio: base64

                })

            }
        );

    }

    catch (error) {

        console.error(
            "Audio upload error:",
            error
        );

    }

}


// =====================================================
// BLOB → BASE64
// =====================================================

function blobToBase64(
    blob
) {

    return new Promise(
        (resolve, reject) => {

            const reader =
                new FileReader();


            reader.onloadend =
                () => {

                    const result =
                        reader.result;


                    const base64 =
                        result.split(
                            ","
                        )[1];


                    resolve(
                        base64
                    );

                };


            reader.onerror =
                reject;


            reader.readAsDataURL(
                blob
            );

        }
    );

}


// =====================================================
// STOP DUBBING
// =====================================================

async function stopDubbing() {

    if (!isRecording && !sessionId) {
        return;
    }


    isRecording =
        false;


    // =================================================
    // STOP RECORDER
    // =================================================

    if (
        mediaRecorder &&
        mediaRecorder.state !== "inactive"
    ) {

        mediaRecorder.stop();

    }


    mediaRecorder =
        null;


    // =================================================
    // STOP STREAM
    // =================================================

    stopAllTracks();


    // =================================================
    // SERVER
    // =================================================

    if (sessionId) {

        try {

            await fetch(
                "/api/dubbing/stop",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        sessionId

                    })

                }
            );

        }

        catch (error) {

            console.error(
                error
            );

        }

    }


    sessionId =
        null;


    // =================================================
    // UI
    // =================================================

    startButton.disabled =
        false;


    startButton.style.display =
        "block";


    stopButton.style.display =
        "none";


    if (livePanel) {

        livePanel.classList.remove(
            "active"
        );

    }


    setStatus(
        "● Дайын — дубляжды қайта бастауға болады",
        "ready"
    );


    console.log(
        "QazaqVoice stopped"
    );

}


// =====================================================
// STOP ALL MEDIA TRACKS
// =====================================================

function stopAllTracks() {

    if (!stream) {
        return;
    }


    stream
        .getTracks()
        .forEach(track => {

            track.stop();

        });


    stream =
        null;

}


// =====================================================
// BUTTON EVENTS
// =====================================================

if (startButton) {

    startButton.addEventListener(
        "click",
        startDubbing
    );

}


if (stopButton) {

    stopButton.addEventListener(
        "click",
        stopDubbing
    );

}


// =====================================================
// LANGUAGE CHANGE
// =====================================================

if (languageSelect) {

    languageSelect.addEventListener(
        "change",
        () => {

            selectedLanguage =
                languageSelect.value;


            console.log(
                "Language:",
                selectedLanguage
            );

        }
    );

}


// =====================================================
// PAGE EXIT
// =====================================================

window.addEventListener(
    "beforeunload",
    () => {

        stopAllTracks();

    }
);


// =====================================================
// SERVER STATUS CHECK
// =====================================================

async function checkServer() {

    try {

        const response =
            await fetch(
                "/api/status"
            );


        if (!response.ok) {

            throw new Error(
                "Server unavailable"
            );

        }


        const data =
            await response.json();


        console.log(
            "QazaqVoice server:",
            data
        );


    }

    catch (error) {

        console.warn(
            "QazaqVoice server not available"
        );

    }

}


// =====================================================
// INITIALIZE
// =====================================================

checkServer();
