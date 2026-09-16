const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = 3000;
const ROOT = __dirname;

// Үлкен аудио файлдарды қабылдау үшін лимитті көтереміз
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(ROOT));

// Белсенді аудио ағындарын сақтауға арналған объект
const activeStreams = {};

// Сервер статусы
app.get("/api/status", (req, res) => {
    res.json({ server: true, status: "ready" });
});

// Дубляж сессиясын бастау
app.post("/api/dubbing/start", (req, res) => {
    const sessionId = "session_" + Date.now();
    const sessionFile = path.join(ROOT, `${sessionId}.webm`);

    activeStreams[sessionId] = {
        filePath: sessionFile,
        stream: fs.createWriteStream(sessionFile)
    };

    console.log(`Сессия басталды: ${sessionId}`);
    res.json({ success: true, sessionId });
});

// Аудио бөлшектерін (chunks) қабылдап жазу
app.post("/api/dubbing/audio", (req, res) => {
    const { sessionId, audio } = req.body;

    if (!sessionId || !activeStreams[sessionId] || !audio) {
        return res.status(400).json({ success: false, error: "Қате сессия немесе аудио" });
    }

    try {
        const buffer = Buffer.from(audio, "base64");
        activeStreams[sessionId].stream.write(buffer);
        res.json({ success: true });
    } catch (err) {
        console.error("Аудионы жазу қатесі:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Дубляжды тоқтату, Python арқылы мәтінге айналдыру және аудару
app.post("/api/dubbing/stop", (req, res) => {
    const { sessionId, targetLang } = req.body;

    if (!sessionId || !activeStreams[sessionId]) {
        return res.status(400).json({ success: false, error: "Сессия табылмады" });
    }

    const session = activeStreams[sessionId];

    // Клиент тіл жібермесе, әдепкі бойынша қазақшаға аударамыз
    const lang = targetLang || "kk";

    session.stream.end(async () => {
        delete activeStreams[sessionId];
        console.log(`Сессия аяқталды: ${sessionId}. Файл сақталды.`);

        const targetWav = path.join(ROOT, "test.wav");

        // Жазылған файлды test.wav етіп көшіреміз (Python оқуы үшін)
        fs.copyFile(session.filePath, targetWav, (err) => {
            if (err) {
                console.error("Файлды көшіру қатесі:", err);
            }
        });

        // Python скриптін мақсатты тілмен бірге іске қосамыз
        exec(`python test.py ${lang}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Python қатесі: ${error}`);
                console.error(`stderr: ${stderr}`);
                return res.status(500).json({ success: false, error: "Python өңдеу қатесі" });
            }

            const resultPath = path.join(ROOT, "result.json");

            let text = "Мәтін табылмады";
            let translated = "";
            let language = null;

            if (fs.existsSync(resultPath)) {

                const raw = fs.readFileSync(resultPath, "utf8");

                try {
                    const parsed = JSON.parse(raw);
                    text = parsed.text;
                    translated = parsed.translated;
                    language = parsed.language;
                } catch (parseError) {
                    console.error("JSON оқу қатесі:", parseError);
                }

            } else {
                console.error("result.json табылмады");
            }

            console.log("Танылған мәтін:", text);
            console.log("Аударма:", translated);

            // Мәтінді және аударманы клиентке қайтарамыз
            res.json({
                success: true,
                sessionId,
                language,
                targetLang: lang,
                text,
                translated
            });
        });
    });
});

// Серверді іске қосу
app.listen(PORT, () => {
    console.log(`Сервер жұмыс істеп тұр: http://localhost:${PORT}`);
});
