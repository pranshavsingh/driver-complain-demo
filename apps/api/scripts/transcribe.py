#!/usr/bin/env python3
import sys
import os
import json

def transcribe(audio_path):
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}"}))
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
        # Use lightweight tiny model for fast CPU speech-to-text inference
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio_path, beam_size=5)
        text = " ".join([segment.text.strip() for segment in segments]).strip()
        print(json.dumps({"text": text, "language": info.language}))
    except ImportError:
        # Fallback if faster-whisper is not pre-installed in the environment
        print(json.dumps({"error": "faster-whisper not installed", "text": None}))
    except Exception as e:
        print(json.dumps({"error": str(e), "text": None}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)
    transcribe(sys.argv[1])
