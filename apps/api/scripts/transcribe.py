#!/usr/bin/env python3
import sys
import os
import json
import subprocess

def ensure_faster_whisper():
    try:
        from faster_whisper import WhisperModel
        return WhisperModel
    except ImportError:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "faster-whisper", "--quiet"])
            from faster_whisper import WhisperModel
            return WhisperModel
        except Exception:
            return None

def transcribe(audio_path):
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}"}))
        sys.exit(1)

    WhisperModel = ensure_faster_whisper()
    if not WhisperModel:
        print(json.dumps({"error": "faster-whisper not installed", "text": None}))
        sys.exit(0)

    try:
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio_path, beam_size=5)
        text = " ".join([segment.text.strip() for segment in segments]).strip()
        print(json.dumps({"text": text, "language": info.language}))
    except Exception as e:
        print(json.dumps({"error": str(e), "text": None}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)
    transcribe(sys.argv[1])
