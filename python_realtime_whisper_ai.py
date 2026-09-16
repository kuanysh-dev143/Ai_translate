import soundcard as sc
import numpy as np
import wave
import os
import time
import asyncio
from faster_whisper import WhisperModel
from deep_translator import GoogleTranslator
import edge_tts
from playsound import playsound


# ==============================
# SETTINGS
# ==============================

MODEL_SIZE = "small"
SAMPLE_RATE = 16000
CHUNK_SECONDS = 5

TARGET_LANG = "kk"                 # аударма тілі: kk, ru, en т.б.
TTS_VOICE = "kk-KZ-AigerinNeural"  # дауыс: ru-RU-SvetlanaNeural / en-US-JennyNeural


# ==============================
# WHISPER
# ==============================

print("Loading Whisper...")

model = WhisperModel(
    MODEL_SIZE,
    device="cpu",
    compute_type="int8"
)

print("Whisper ready!")
print()


# ==============================
# FIND SPEAKERS
# ==============================

print("Available speakers:")

speakers = sc.all_speakers()

for i, speaker in enumerate(speakers):
    print(i, speaker.name)

print()


speaker = sc.default_speaker()

print("Using speaker:")
print(speaker.name)
print()


# ==============================
# LOOPBACK MICROPHONE
# ==============================

try:

    microphone = sc.get_microphone(
        id=str(speaker.name),
        include_loopback=True
    )

except Exception as error:

    print("Loopback error:")
    print(error)

    print()
    print("Available microphones:")

    for mic in sc.all_microphones():
        print(mic)

    raise


# ==============================
# TTS FUNCTION
# ==============================

async def speak(text, filename="translated_voice.mp3"):

    communicate = edge_tts.Communicate(text, TTS_VOICE)

    await communicate.save(filename)

    playsound(filename)

    try:
        os.remove(filename)
    except:
        pass


print("================================")
print("DybysDub REAL-TIME WHISPER")
print("================================")
print()
print("Now play a YouTube video.")
print("Listening to system audio...")
print()


# ==============================
# RECORD LOOP
# ==============================

with microphone.recorder(
    samplerate=SAMPLE_RATE,
    channels=1
) as recorder:

    while True:

        try:

            print("Listening...")

            audio = recorder.record(
                numframes=SAMPLE_RATE * CHUNK_SECONDS
            )

            audio = np.asarray(audio)

            audio = audio.flatten()

            # Normalize
            audio = np.clip(
                audio,
                -1,
                1
            )

            # Check volume
            volume = np.max(
                np.abs(audio)
            )

            if volume < 0.01:

                print("No speech detected.")
                print()

                continue


            # ==============================
            # SAVE TEMP WAV
            # ==============================

            filename = "realtime_audio.wav"

            audio_int16 = (
                audio * 32767
            ).astype(
                np.int16
            )

            with wave.open(
                filename,
                "wb"
            ) as wav:

                wav.setnchannels(1)

                wav.setsampwidth(2)

                wav.setframerate(
                    SAMPLE_RATE
                )

                wav.writeframes(
                    audio_int16.tobytes()
                )


            # ==============================
            # WHISPER (SPEECH -> TEXT)
            # ==============================

            segments, info = model.transcribe(
                filename,
                beam_size=5,
                vad_filter=True
            )


            text = []

            for segment in segments:

                part = segment.text.strip()

                if part:

                    text.append(part)


            result = " ".join(text)


            if result:

                # ==============================
                # TRANSLATION
                # ==============================

                translated = None

                try:

                    translated = GoogleTranslator(
                        source="auto",
                        target=TARGET_LANG
                    ).translate(result)

                except Exception as error:

                    print("Аударма қатесі:", error)


                print()
                print("────────────────────────")
                print("LANGUAGE:", info.language)
                print("TEXT:", result)
                print("TRANSLATED:", translated)
                print("────────────────────────")
                print()


                # ==============================
                # TEXT -> SPEECH
                # ==============================

                if translated:

                    try:

                        asyncio.run(
                            speak(translated)
                        )

                    except Exception as error:

                        print("Дауыстау қатесі:", error)


            # Delete temporary file

            try:

                os.remove(filename)

            except:

                pass


        except KeyboardInterrupt:

            print()
            print("DybysDub stopped.")

            break


        except Exception as error:

            print()
            print("ERROR:")
            print(error)
            print()

            time.sleep(1)
