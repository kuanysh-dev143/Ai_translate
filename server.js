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

// Дубляжды тоқтату және Python арқылы мәтінге айналдыру
app.post("/api/dubbing/stop", (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId || !activeStreams[sessionId]) {
        return res.status(400).json({ success: false, error: "Сессия табылмады" });
    }

    const session = activeStreams[sessionId];
    
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

        // Python скриптін іске қосамыз
        exec("python test.py", (error, stdout, stderr) => {
            if (error) {
                console.error(`Python қатесі: ${error}`);
                return res.status(500).json({ success: false, error: "Python өңдеу қатесі" });
            }

            // result.txt файлынан танылған мәтінді оқимыз
            let transcriptText = "Мәтін табылмады";
            const resultPath = path.join(ROOT, "result.txt");
            
            if (fs.existsSync(resultPath)) {
                transcriptText = fs.readFileSync(resultPath, "utf8");
            }

            console.log("Python нәтижесі оқылды:", transcriptText);

            // Мәтінді клиентке қайтарамыз
            res.json({
                success: true,
                sessionId,
                text: transcriptText
            });
        });
    });
});

// Серверді іске қосу
app.listen(PORT, () => {
    console.log(`Сервер жұмыс істеп тұр: http://localhost:${PORT}`);
});
