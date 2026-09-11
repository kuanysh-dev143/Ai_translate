const express = require("express");

const fs = require("fs");
const path = require("path");

const { spawn } =
    require("child_process");

const app = express();

const PORT = 3000;


const ROOT =
    __dirname;

const TOOLS =
    path.join(
        ROOT,
        "tools"
    );


const UPLOADS =
    path.join(
        ROOT,
        "uploads"
    );


const OUTPUT =
    path.join(
        ROOT,
        "output"
    );


const YTDLP =
    path.join(
        TOOLS,
        "yt-dlp.exe"
    );


const FFMPEG =
    path.join(
        TOOLS,
        "ffmpeg.exe"
    );



/*
    Создаём папки
*/

for (
    const folder of [
        TOOLS,
        UPLOADS,
        OUTPUT
    ]
) {

    if (
        !fs.existsSync(folder)
    ) {

        fs.mkdirSync(
            folder,
            {
                recursive: true
            }
        );

    }

}



/*
    Статика
*/

app.use(
    express.static(ROOT)
);


app.use(
    express.json()
);



/*
    Проверка инструментов
*/

app.get(
    "/api/status",
    (req, res) => {

        res.json({

            ytDlp:
                fs.existsSync(
                    YTDLP
                ),

            ffmpeg:
                fs.existsSync(
                    FFMPEG
                )

        });

    }
);



/*
    Запуск команды
*/

function runCommand(
    command,
    args,
    onData
) {

    return new Promise(
        (resolve, reject) => {

            const process =
                spawn(
                    command,
                    args,
                    {
                        windowsHide: true
                    }
                );


            let stderr = "";


            process.stdout.on(
                "data",
                (data) => {

                    onData?.(
                        data.toString()
                    );

                }
            );


            process.stderr.on(
                "data",
                (data) => {

                    stderr +=
                        data.toString();

                    onData?.(
                        data.toString()
                    );

                }
            );


            process.on(
                "error",
                reject
            );


            process.on(
                "close",
                (code) => {

                    if (
                        code === 0
                    ) {

                        resolve();

                    } else {

                        reject(
                            new Error(
                                stderr ||
                                `Process exited with code ${code}`
                            )
                        );

                    }

                }
            );

        }
    );
}



/*
    YouTube → файл
*/

app.post(
    "/api/translate",
    async (req, res) => {

        const {
            url,
            language
        } = req.body;


        if (!url) {

            return res
                .status(400)
                .json({
                    error:
                        "YouTube ссылка отсутствует"
                });

        }


        if (
            !fs.existsSync(
                YTDLP
            )
        ) {

            return res
                .status(500)
                .json({

                    error:
                        "Не найден tools/yt-dlp.exe"

                });

        }


        res.setHeader(
            "Content-Type",
            "text/event-stream"
        );

        res.setHeader(
            "Cache-Control",
            "no-cache"
        );

        res.setHeader(
            "Connection",
            "keep-alive"
        );


        const send =
            (
                status,
                progress
            ) => {

                res.write(
                    `data: ${JSON.stringify({
                        status,
                        progress
                    })}\n\n`
                );

            };


        try {

            /*
                Уникальное имя
            */

            const id =
                Date.now();


            const outputTemplate =
                path.join(
                    UPLOADS,
                    `${id}.%(ext)s`
                );


            send(
                "Загрузка видео с YouTube...",
                10
            );


            /*
                yt-dlp
            */

            await runCommand(
                YTDLP,
                [
                    "--no-playlist",

                    "-f",
                    "bv*+ba/b",

                    "--merge-output-format",
                    "mp4",

                    "-o",
                    outputTemplate,

                    url
                ],
                (text) => {

                    if (
                        text.includes(
                            "[download]"
                        )
                    ) {

                        const match =
                            text.match(
                                /(\d+(?:\.\d+)?)%/
                            );


                        if (
                            match
                        ) {

                            const percent =
                                Number(
                                    match[1]
                                );


                            send(
                                "Загрузка видео...",
                                Math.min(
                                    45,
                                    Math.round(
                                        percent *
                                        0.45
                                    )
                                )
                            );

                        }

                    }

                }
            );


            /*
                Ищем полученный MP4
            */

            const files =
                fs.readdirSync(
                    UPLOADS
                );


            const downloaded =
                files.find(
                    file =>
                        file.startsWith(
                            String(id)
                        )
                );


            if (!downloaded) {

                throw new Error(
                    "Видео не найдено после загрузки"
                );

            }


            const source =
                path.join(
                    UPLOADS,
                    downloaded
                );


            /*
                ВРЕМЕННО:

                здесь будет Whisper
            */

            send(
                "Видео загружено. Следующий этап — Whisper...",
                55
            );


            /*
                Пока создаём копию
                как тест результата.
            */

            const output =
                path.join(
                    OUTPUT,
                    `${id}-${language}.mp4`
                );


            fs.copyFileSync(
                source,
                output
            );


            send(
                "Видео подготовлено...",
                90
            );


            /*
                Сейчас просто
                показываем полученное видео.
            */

            send(
                "Готово",
                100
            );


            res.write(
                `data: ${JSON.stringify({
                    completed: true,
                    video:
                        `/output/${path.basename(output)}`
                })}\n\n`
            );


            res.end();

        } catch (
            error
        ) {

            console.error(
                error
            );


            res.write(
                `data: ${JSON.stringify({
                    status:
                        "Ошибка: " +
                        error.message,
                    progress: 0
                })}\n\n`
            );


            res.end();

        }

    }
);



/*
    SERVER
*/

app.listen(
    PORT,
    () => {

        console.log(
            ""
        );

        console.log(
            "================================"
        );

        console.log(
            "AI VIDEO TRANSLATOR"
        );

        console.log(
            "================================"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            ""
        );

    }
);