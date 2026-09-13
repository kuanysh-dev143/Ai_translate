from faster_whisper import WhisperModel

print("Whisper іске қосылуда...")

model = WhisperModel(
    "small",
    device="cpu",
    compute_type="int8"
)

print("Whisper дайын!")

segments, info = model.transcribe(
    "test.wav",
    vad_filter=True
)

print("Тіл:", info.language)

for segment in segments:
    print(
        f"[{segment.start:.2f} - {segment.end:.2f}] "
        f"{segment.text}"
    )
