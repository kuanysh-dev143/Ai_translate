const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec, spawn } = require("child_process");

const app = express();
const PORT = 3000;
const ROOT = __dirname;
const DOWNLOADS_DIR = path.join(ROOT, "downloads");

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

// Үлкен аудио файлдарды қабылдау үшін лимитті көтереміз
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(ROOT));
app.use("/downloads", express.static(DOWNLOADS_DIR));

// Белсенді аудио ағындарын сақтауға арналған объект
const activeStreams = {};

// Сілтеме арқылы дубляж тапсырмаларының статусын сақтау
const linkJobs = {};

// Сервер статусы
app.get("/api/status", (req, res) => {
    res.json({ server: true, status: "ready" });
});


// =====================================================
// 1) НАҚТЫ УАҚЫТТАҒЫ ЭКРАН/ВКЛАДКА ДУБЛЯЖЫ
// =====================================================

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

app.post("/api/dubbing/stop", (req, res) => {
    const { sessionId, targetLang } = req.body;

    if (!sessionId || !activeStreams[sessionId]) {
        return res.status(400).json({ success: false, error: "Сессия табылмады" });
    }

    const session = activeStreams[sessionId];
    const lang = targetLang || "kk";

    session.stream.end(async () => {
        delete activeStreams[sessionId];
        console.log(`Сессия аяқталды: ${sessionId}. Файл сақталды.`);

        const targetWav = path.join(ROOT, "test.wav");

        fs.copyFile(session.filePath, targetWav, (err) => {
            if (err) {
                console.error("Файлды көшіру қатесі:", err);
            }
        });

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
            }

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


// =====================================================
// 2) YOUTUBE СІЛТЕМЕСІ АРҚЫЛЫ ТОЛЫҚ ВИДЕО ДУБЛЯЖЫ
// =====================================================

// Дубляж тапсырмасын бастау (ұзаққа созылады, сондықтан фондық job ретінде)
app.post("/api/dub-link/start", (req, res) => {

    const { url, targetLang } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: "URL берілмеді" });
    }

    const jobId = "job_" + Date.now();
    const lang = targetLang || "kk";

    linkJobs[jobId] = {
        status: "starting",
        message: "Басталуда...",
        file: null,
        segments: null,
        error: null
    };

    const child = spawn("python", ["dub_youtube.py", url, lang]);

    child.stdout.on("data", (data) => {

        const lines = data.toString().split("\n").filter(Boolean);

        for (const line of lines) {

            try {

                const parsed = JSON.parse(line);

                linkJobs[jobId].status = parsed.status;
                linkJobs[jobId].message = parsed.message || "";

                if (parsed.status === "completed") {
                    linkJobs[jobId].file = parsed.file;
                    linkJobs[jobId].segments = parsed.segments;
                }

                if (parsed.status === "error") {
                    linkJobs[jobId].error = parsed.message;
                }

                console.log(`[${jobId}]`, parsed.status, parsed.message || "");

            } catch (e) {
                // JSON емес шығыс жолдары (мыс. кітапхана логтары) — елемей өтеміз
            }
        }
    });

    child.stderr.on("data", (data) => {
        console.error(`[${jobId}] stderr:`, data.toString());
    });

    child.on("close", (code) => {
        if (code !== 0 && linkJobs[jobId].status !== "completed") {
            linkJobs[jobId].status = "error";
            linkJobs[jobId].error = linkJobs[jobId].error || "Белгісіз қате";
        }
    });

    res.json({ success: true, jobId });
});

// Тапсырманың ағымдағы статусын сұрау (клиент осыны периодты түрде шақырады)
app.get("/api/dub-link/status/:jobId", (req, res) => {

    const job = linkJobs[req.params.jobId];

    if (!job) {
        return res.status(404).json({ success: false, error: "Тапсырма табылмады" });
    }

    res.json({
        success: true,
        status: job.status,
        message: job.message,
        file: job.file ? `/downloads/${job.file}` : null,
        segments: job.segments,
        error: job.error
    });
});


// Серверді іске қосу
app.listen(PORT, () => {
    console.log(`Сервер жұмыс істеп тұр: http://localhost:${PORT}`);
});
