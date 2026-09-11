const youtubeUrl =
    document.getElementById(
        "youtubeUrl"
    );

const language =
    document.getElementById(
        "language"
    );

const translateButton =
    document.getElementById(
        "translateButton"
    );

const progressArea =
    document.getElementById(
        "progressArea"
    );

const progressFill =
    document.getElementById(
        "progressFill"
    );

const progressStatus =
    document.getElementById(
        "progressStatus"
    );

const progressPercent =
    document.getElementById(
        "progressPercent"
    );

const resultArea =
    document.getElementById(
        "resultArea"
    );

const resultVideo =
    document.getElementById(
        "resultVideo"
    );

const downloadResult =
    document.getElementById(
        "downloadResult"
    );

const focusUrl =
    document.getElementById(
        "focusUrl"
    );


/*
    Навигация
*/

focusUrl.addEventListener(
    "click",
    () => {

        document
            .getElementById("translate")
            .scrollIntoView({
                behavior: "smooth"
            });

        setTimeout(
            () => youtubeUrl.focus(),
            400
        );
    }
);



/*
    Перевод
*/

translateButton.addEventListener(
    "click",
    async () => {

        const url =
            youtubeUrl.value.trim();

        const targetLanguage =
            language.value;


        if (!url) {

            youtubeUrl.focus();

            progressArea.style.display =
                "block";

            progressStatus.textContent =
                "Вставьте ссылку на YouTube";

            progressPercent.textContent =
                "0%";

            return;
        }


        resultArea.classList.remove(
            "show"
        );


        translateButton.disabled =
            true;


        progressArea.style.display =
            "block";


        progressFill.style.width =
            "10%";

        progressPercent.textContent =
            "10%";

        progressStatus.textContent =
            "Подключение к серверу...";


        try {

            /*
                Отправляем URL
                на локальный Node.js
            */

            const response =
                await fetch(
                    "/api/translate",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                url,
                                language:
                                    targetLanguage
                            })
                    }
                );


            if (!response.ok) {

                const error =
                    await response.json()
                        .catch(() => null);

                throw new Error(
                    error?.error ||
                    "Ошибка сервера"
                );
            }


            /*
                Читаем поток
                прогресса
            */

            const reader =
                response.body.getReader();

            const decoder =
                new TextDecoder();


            let buffer = "";


            while (true) {

                const { value, done } =
                    await reader.read();


                if (done) {
                    break;
                }


                buffer +=
                    decoder.decode(
                        value,
                        {
                            stream: true
                        }
                    );


                const lines =
                    buffer.split("\n");


                buffer =
                    lines.pop();


                for (
                    const line of lines
                ) {

                    if (
                        !line.startsWith(
                            "data:"
                        )
                    ) {

                        continue;
                    }


                    const data =
                        JSON.parse(
                            line
                                .replace(
                                    "data:",
                                    ""
                                )
                                .trim()
                        );


                    if (
                        data.progress
                    ) {

                        progressFill.style.width =
                            data.progress + "%";

                        progressPercent.textContent =
                            data.progress + "%";
                    }


                    if (
                        data.status
                    ) {

                        progressStatus.textContent =
                            data.status;
                    }


                    if (
                        data.completed
                    ) {

                        progressFill.style.width =
                            "100%";

                        progressPercent.textContent =
                            "100%";

                        progressStatus.textContent =
                            "Готово";


                        resultVideo.src =
                            data.video;


                        downloadResult.href =
                            data.video;


                        resultArea.classList.add(
                            "show"
                        );
                    }

                }

            }


        } catch (error) {

            console.error(error);


            progressStatus.textContent =
                error.message ||
                "Произошла ошибка";


            progressFill.style.width =
                "0%";

            progressPercent.textContent =
                "0%";

        }


        translateButton.disabled =
            false;
    }
);