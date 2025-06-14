# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anki AI Vocabulary Builder is a Dockerized CLI tool that automates English vocabulary flashcard creation using OpenAI GPT-4-mini for content generation and AWS Polly for text-to-speech.

## Common Commands

**Build & Run:**
```bash
docker compose build
docker compose run --rm anki-vocab "word"
docker compose run --rm anki-vocab "word" --no-audio
docker compose run --rm anki-vocab "word" --deck "Custom Deck"
docker compose run --rm anki-vocab "word" --delete
```

**Testing:**
```bash
python test_polly.py     # Test AWS Polly integration
python debug_env.py      # Check environment configuration
```

## Architecture

**Main Components:**
- `anki_vocab.py`: Core application containing:
  - `AnkiConnector`: AnkiConnect API communication
  - `VocabularyFetcher`: OpenAI and AWS Polly integration
  - Card formatting and CLI orchestration

**Configuration Priority:**
1. Environment variables (`.env` file)
2. JSON config file (`~/.config/anki-vocab/config.json`)

**External Dependencies:**
- Anki Desktop with AnkiConnect add-on (code: 2055492159)
- OpenAI API (for content generation)
- AWS Polly (for TTS)

**Data Flow:**
1. CLI input → OpenAI API → JSON response with meanings, definitions, examples
2. Text content → AWS Polly → MP3 audio files (base64 encoded)
3. Formatted HTML + audio → AnkiConnect API → Anki flashcard

## Key Implementation Details

**Audio Generation:**
- Word audio: Prosody with slow rate for clarity
- Sentence audio: Natural speech rate
- Voices: Joanna (default), Matthew, Amy, Brian, Mizuki (Japanese), Takumi (Japanese)

**Card Format:**
- Front: Word + IPA + word audio
- Back: English/Japanese definitions + example sentences with audio + idioms

**Error Handling:**
- AnkiConnect connection errors (ensure Anki is running)
- API key validation (OpenAI, AWS credentials)
- Duplicate card prevention