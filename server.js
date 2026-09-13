const express = require("express");
const path = require("path");
const fs = require("fs");

const { spawn } = require("child_process");

const app = express();

const PORT = 3000;

const ROOT = __dirname;

const UPLOADS = path.join(ROOT, "uploads");
const OUTPUT = path.join(ROOT, "output");
const PYTHON = path.join(ROOT, "python");


// =====================================================
// CREATE DIRECTORIES
// =====================================================

for (const folder of [
    UPLOADS,
    OUTPUT,
    PYTHON
]) {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, {
            recursive: true
        });
    }
}


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({
    limit: "10mb"
}));

app.use(express.static(ROOT));


// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(ROOT, "index.html")
    );

});


// =====================================================
// SERVER STATUS
// =====================================================

app.get("/api/status", (req, res) => {

    res.json({

        server: true,

        name: "QazaqVoice AI",

        mode: "real-time-dubbing",

        status: "ready"

    });

});


// =====================================================
// START DUBBING SESSION
// =====================================================

app.post(
    "/api/dubbing/start",
    async (req, res) => {

        const {
            language = "kk"
        } = req.body;


        const sessionId =
            Date.now().toString();


        const sessionFolder =
            path.join(
                UPLOADS,
                sessionId
            );


        if (!fs.existsSync(sessionFolder)) {

            fs.mkdirSync(
                sessionFolder,
                {
                    recursive: true
                }
            );

        }


        console.log("");
        console.log(
            "================================="
        );
        console.log(
            "QAZAQVOICE AI"
        );
        console.log(
            "NEW DUBBING SESSION"
        );
        console.log(
            "================================="
        );
        console.log(
            "Session:",
            sessionId
        );
        console.log(
            "Language:",
            language
        );
        console.log("");


        res.json({

            success: true,

            sessionId,

            language,

            message:
                "Dubbing session started"

        });

    }
);


// =====================================================
// RECEIVE AUDIO CHUNK
// =====================================================

app.post(
    "/api/dubbing/audio",
    async (req, res) => {

        try {

            const {
                sessionId,
                audio
            } = req.body;


            if (!sessionId) {

                return res
                    .status(400)
                    .json({
                        error:
                            "sessionId отсутствует"
                    });

            }


            if (!audio) {

                return res
                    .status(400)
                    .json({
                        error:
                            "audio отсутствует"
                    });

            }


            const sessionFolder =
                path.join(
                    UPLOADS,
                    sessionId
                );


            if (!fs.existsSync(
                sessionFolder
            )) {

                fs.mkdirSync(
                    sessionFolder,
                    {
                        recursive: true
                    }
                );

            }


            /*
             * Browser жіберген
             * Base64 audio
             */

            const buffer =
                Buffer.from(
                    audio,
                    "base64"
                );


            const filename =
                `${Date.now()}.webm`;


            const audioPath =
                path.join(
                    sessionFolder,
                    filename
                );


            fs.writeFileSync(
                audioPath,
                buffer
            );


            console.log(
                "Audio chunk:",
                filename
            );


            /*
             * Кейін осы жерде Python
             * Whisper pipeline шақырылады.
             */


            res.json({

                success: true,

                received: true,

                file: filename

            });

        }

        catch (error) {

            console.error(error);

            res
                .status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// RUN PYTHON AI
// =====================================================

function runPython(
    script,
    args = []
) {

    return new Promise(
        (resolve, reject) => {

            const pythonProcess =
                spawn(
                    "python",
                    [
                        script,
                        ...args
                    ],
                    {
                        cwd: ROOT,
                        windowsHide: true
                    }
                );


            let output = "";

            let errorOutput = "";


            pythonProcess.stdout.on(
                "data",
                data => {

                    const text =
                        data.toString();

                    output += text;

                    console.log(
                        "[PYTHON]",
                        text.trim()
                    );

                }
            );


            pythonProcess.stderr.on(
                "data",
                data => {

                    const text =
                        data.toString();

                    errorOutput += text;

                    console.error(
                        "[PYTHON ERROR]",
                        text.trim()
                    );

                }
            );


            pythonProcess.on(
                "error",
                error => {

                    reject(error);

                }
            );


            pythonProcess.on(
                "close",
                code => {

                    if (code === 0) {

                        resolve(output);

                    }

                    else {

                        reject(
                            new Error(
                                errorOutput ||
                                `Python exited with code ${code}`
                            )
                        );

                    }

                }
            );

        }
    );

}


// =====================================================
// TEST PYTHON CONNECTION
// =====================================================

app.get(
    "/api/python/status",
    async (req, res) => {

        try {

            const script =
                path.join(
                    PYTHON,
                    "test.py"
                );


            if (!fs.existsSync(script)) {

                return res.json({

                    python: true,

                    script: false,

                    message:
                        "python/test.py пока отсутствует"

                });

            }


            const result =
                await runPython(
                    script
                );


            res.json({

                python: true,

                script: true,

                result

            });

        }

        catch (error) {

            res
                .status(500)
                .json({

                    python: false,

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// STOP SESSION
// =====================================================

app.post(
    "/api/dubbing/stop",
    (req, res) => {

        const {
            sessionId
        } = req.body;


        if (!sessionId) {

            return res
                .status(400)
                .json({

                    error:
                        "sessionId отсутствует"

                });

        }


        console.log(
            "Dubbing stopped:",
            sessionId
        );


        res.json({

            success: true,

            sessionId,

            message:
                "Dubbing session stopped"

        });

    }
);


// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(err);

        res
            .status(500)
            .json({

                error:
                    err.message ||
                    "Server error"

            });

    }
);


// =====================================================
// START SERVER
// =====================================================

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "================================="
        );
        console.log(
            "       QAZAQVOICE AI"
        );
        console.log(
            "   REAL-TIME VIDEO DUBBING"
        );
        console.log(
            "================================="
        );
        console.log("");
        console.log(
            `Server: http://localhost:${PORT}`
        );
        console.log("");
        console.log(
            "Mode: Browser Audio Capture"
        );
        console.log(
            "AI: Python / Whisper"
        );
        console.log("");
        console.log(
            "================================="
        );

    }
);
