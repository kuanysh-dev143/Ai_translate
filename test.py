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

full_text = ""

for segment in segments:
    line = f"[{segment.start:.2f} - {segment.end:.2f}] {segment.text}"
    print(line)
    full_text += segment.text + " "

# Айналған мәтінді файлға сақтаймыз
with open("result.txt", "w", encoding="utf-8") as f:
    f.write(full_text.strip())

print("Мәтін result.txt файлына сәтті сақталды!")
