import sys
import os
import json
import uuid
import asyncio
import subprocess

from faster_whisper import WhisperModel
from deep_translator import GoogleTranslator
import edge_tts
from pydub import AudioSegment


MODEL_SIZE = "small"
DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), "downloads")
TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp")

os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)


VOICE_MAP = {
    "kk": "kk-KZ-AigerinNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "en": "en-US-JennyNeural",
    "tr": "tr-TR-EmelNeural",
    "zh-CN": "zh-CN-XiaoxiaoNeural",
}


def log(status, message="", **extra):
    payload = {"status": status, "message": message}
    payload.update(extra)
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def download_video(url, job_id):

    output_template = os.path.join(TEMP_DIR, f"{job_id}_source.%(ext)s")

    command = [
        "yt-dlp",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "-o", output_template,
        "--no-playlist",
        url
    ]

    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if result.returncode != 0:
        raise RuntimeError("yt-dlp қатесі: " + result.stderr.decode(errors="ignore"))

    for f in os.listdir(TEMP_DIR):
        if f.startswith(f"{job_id}_source."):
            return os.path.join(TEMP_DIR, f)

    raise RuntimeError("Жүктелген видео табылмады")


def extract_audio(video_path, job_id):

    wav_path = os.path.join(TEMP_DIR, f"{job_id}_audio.wav")

    command = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        wav_path
    ]

    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if result.returncode != 0:
        raise RuntimeError("ffmpeg (audio extract) қатесі: " + result.stderr.decode(errors="ignore"))

    return wav_path


def get_video_duration(video_path):

    command = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", video_path
    ]

    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    try:
        return float(result.stdout.decode().strip())
    except Exception:
        return None


async def synthesize_segment(text, voice, out_path):

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)


def build_dubbed_audio(segments, voice, job_id, total_duration_ms):

    # Толық ұзақтыққа тең тыныштық трегін жасаймыз
    timeline = AudioSegment.silent(duration=int(total_duration_ms))

    for i, seg in enumerate(segments):

        translated = seg["translated"].strip()

        if not translated:
            continue

        tts_path = os.path.join(TEMP_DIR, f"{job_id}_seg_{i}.mp3")

        try:
            asyncio.run(synthesize_segment(translated, voice, tts_path))
        except Exception as error:
            log("tts_segment_error", str(error), index=i)
            continue

        try:
            clip = AudioSegment.from_file(tts_path, format="mp3")
        except Exception as error:
            log("tts_read_error", str(error), index=i)
            continue

        start_ms = int(seg["start"] * 1000)

        # Егер дауыс кесегі бөлінген уақыттан ұзын болса, аздап жеделдетеміз
        available_ms = int((seg["end"] - seg["start"]) * 1000)

        if available_ms > 200 and len(clip) > available_ms:
            speed_factor = len(clip) / available_ms
            speed_factor = min(speed_factor, 1.5)  # тым тез болмас үшін шек қоямыз

            sped_path = os.path.join(TEMP_DIR, f"{job_id}_seg_{i}_sped.mp3")

            speed_cmd = [
                "ffmpeg", "-y", "-i", tts_path,
                "-filter:a", f"atempo={speed_factor:.3f}",
                sped_path
            ]

            sp = subprocess.run(speed_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            if sp.returncode == 0:
                try:
                    clip = AudioSegment.from_file(sped_path, format="mp3")
                except Exception:
                    pass

        timeline = timeline.overlay(clip, position=start_ms)

        try:
            os.remove(tts_path)
        except:
            pass

    final_audio_path = os.path.join(TEMP_DIR, f"{job_id}_final_audio.mp3")
    timeline.export(final_audio_path, format="mp3")

    return final_audio_path


def mux_video_with_audio(video_path, audio_path, job_id):

    output_path = os.path.join(DOWNLOADS_DIR, f"dubbed_{job_id}.mp4")

    command = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        output_path
    ]

    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if result.returncode != 0:
        raise RuntimeError("ffmpeg (mux) қатесі: " + result.stderr.decode(errors="ignore"))

    return output_path


def cleanup(paths):

    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except:
            pass


def main():

    if len(sys.argv) < 2:
        log("error", "URL берілмеді")
        sys.exit(1)

    url = sys.argv[1]
    target_lang = sys.argv[2] if len(sys.argv) > 2 else "kk"
    job_id = uuid.uuid4().hex[:10]

    voice = VOICE_MAP.get(target_lang, "kk-KZ-AigerinNeural")

    video_path = None
    wav_path = None
    final_audio_path = None

    try:

        log("downloading", "Видео жүктелуде...")
        video_path = download_video(url, job_id)

        log("extracting", "Дыбыс бөлінуде...")
        wav_path = extract_audio(video_path, job_id)

        duration = get_video_duration(video_path)
        if duration is None:
            duration = AudioSegment.from_file(wav_path).duration_seconds

        log("loading_model", "Whisper моделі жүктелуде...")
        model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")

        log("transcribing", "Сөз танылуда...")
        raw_segments, info = model.transcribe(wav_path, beam_size=5, vad_filter=True)

        segments = []

        for seg in raw_segments:

            text = seg.text.strip()
            if not text:
                continue

            try:
                translated = GoogleTranslator(source="auto", target=target_lang).translate(text)
            except Exception:
                translated = ""

            segments.append({
                "start": seg.start,
                "end": seg.end,
                "text": text,
                "translated": translated
            })

            log("segment", text, start=seg.start, end=seg.end, translated=translated)

        if not segments:
            raise RuntimeError("Сөз танылмады (дыбыс табылмады)")

        log("synthesizing", "Жаңа дауыс жасалуда...")
        final_audio_path = build_dubbed_audio(segments, voice, job_id, duration * 1000)

        log("muxing", "Видеомен қосылуда...")
        output_path = mux_video_with_audio(video_path, final_audio_path, job_id)

        log("completed", "Дайын!", file=os.path.basename(output_path), segments=segments)

    except Exception as error:

        log("error", str(error))
        sys.exit(1)

    finally:

        cleanup([video_path, wav_path, final_audio_path])


if __name__ == "__main__":
    main()
