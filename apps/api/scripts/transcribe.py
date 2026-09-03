#!/usr/bin/env python3
"""
Local speech-to-text transcription using faster-whisper.
Returns transcription in the ORIGINAL spoken language (not translated).
Uses Hugging Face's Systran/faster-whisper-large-v3 model locally for accurate transcription.
"""
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
        # "large-v3" resolves to Hugging Face's Systran/faster-whisper-large-v3 conversion.
        # It is the highest-accuracy multilingual Whisper model available to faster-whisper.
        model_name = os.getenv("TRANSCRIPTION_LOCAL_MODEL", "large-v3")
        model = WhisperModel(model_name, device="cpu", compute_type="int8")

        segments, info = model.transcribe(
            audio_path,
            beam_size=8,
            # task="transcribe" keeps the original language — NOT "translate" which
            # forces English and garbles Hindi/Bengali.
            task="transcribe",
            initial_prompt=(
                "Fleet driver complaint. Terms may include truck, trailer, tyre, engine, "
                "brake, clutch, fuel, loading, unloading, GPS, vehicle number and route names. "
                "The speaker may use English, Hindi, Bengali or a mixture."
            ),
            # Keep VAD conservative so it does not cut softly spoken words between noisy gaps.
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=900,
                speech_pad_ms=600,
            ),
        )

        text = " ".join([segment.text.strip() for segment in segments]).strip()
        print(json.dumps({
            "text": text,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
        }))
    except Exception as e:
        print(json.dumps({"error": str(e), "text": None}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file provided"}))
        sys.exit(1)
    transcribe(sys.argv[1])
