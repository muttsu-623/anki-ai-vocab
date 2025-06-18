# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anki AI Vocabulary Builder is a Dockerized CLI tool that automates English vocabulary flashcard creation using OpenAI GPT-4-mini for content generation and AWS Polly for text-to-speech. Implemented in TypeScript with full type safety and modern JavaScript features.

## Common Commands

**Docker Commands:**
```bash
docker compose -f docker-compose.ts.yml build
docker compose -f docker-compose.ts.yml run --rm anki-vocab "word"
docker compose -f docker-compose.ts.yml run --rm anki-vocab "word" --no-audio
docker compose -f docker-compose.ts.yml run --rm anki-vocab "word" --deck "Custom Deck"
docker compose -f docker-compose.ts.yml run --rm anki-vocab "word" --delete
```

**Interactive Mode:**
```bash
docker compose -f docker-compose.ts.yml run --rm anki-vocab --interactive

# Interactive commands:
> add sophisticated
> add sophisticated 洗練された,上品な
> delete simple
> help
> quit
```

**Local Development:**
```bash
npm install              # Install dependencies
npm run dev "word"       # Run in development mode
npm run build           # Build TypeScript
npm start "word"        # Run built version
npm test               # Run tests
npm run lint           # Lint code
```

**Testing:**
```bash
npm run dev src/debug/debugEnv.ts     # Check environment configuration
npm run dev src/debug/testPolly.ts    # Test AWS Polly integration
```

## Architecture

**Main Components:**
- `src/index.ts`: Main CLI entry point
- `src/lib/ankiConnector.ts`: AnkiConnect API communication
- `src/lib/vocabularyFetcher.ts`: OpenAI and AWS Polly integration
- `src/lib/cli.ts`: Interactive session management
- `src/lib/utils.ts`: Utility functions and card formatting
- `src/types/index.ts`: TypeScript type definitions

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
- Word audio: Prosody with slow rate (0.9x) for clarity
- Sentence audio: Natural speech rate (1.0x)
- Voices: Matthew (default), Joanna, Amy, Brian, Mizuki (Japanese), Takumi (Japanese)

**Card Format:**
- Front: Word + IPA + word audio
- Back: English/Japanese definitions + example sentences with audio + idioms + similar words

**Error Handling:**
- AnkiConnect connection errors (ensure Anki is running)
- API key validation (OpenAI, AWS credentials)
- Duplicate card prevention
- Structured error types: AnkiConnectionError, OpenAIError, PollyError

**Type Safety:**
- Complete TypeScript type definitions
- Comprehensive interfaces for all data structures
- Type-safe API interactions

## Development Guidelines

**Code Style:**
- TypeScript with strict type checking
- ES2022 features with async/await
- Modular architecture with clear separation of concerns
- Comprehensive error handling

**Testing:**
- Jest framework with TypeScript support
- Unit tests for core functionality
- Integration tests for external APIs

**Linting:**
- ESLint with TypeScript rules
- Prettier for code formatting
- Pre-commit hooks for code quality

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.