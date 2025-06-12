#!/bin/bash

# Check if a word was provided
if [ "$#" -eq 0 ]; then
    echo "Usage: docker run anki-ai-vocab <word> [options]"
    echo "       docker-compose run --rm anki-vocab <word> [options]"
    echo ""
    echo "Options:"
    echo "  --deck DECK_NAME    Override default deck name"
    echo "  --model MODEL_NAME  Override default model name"
    echo "  --no-audio          Disable automatic audio generation"
    echo "  --voice VOICE       Select TTS voice (alloy, echo, fable, onyx, nova, shimmer)"
    echo "  --delete            Delete cards containing the word"
    echo ""
    echo "Example:"
    echo "  docker-compose run --rm anki-vocab serendipity"
    echo "  docker-compose run --rm anki-vocab eloquent --deck 'Advanced English'"
    exit 1
fi

# Execute the Python script with all arguments
exec python /app/anki_vocab.py "$@"