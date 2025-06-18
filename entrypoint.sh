#!/bin/bash

# Check if a word was provided
if [ "$#" -eq 0 ]; then
    echo "Usage: docker run anki-ai-vocab-ts <word> [options]"
    echo "       docker-compose run --rm anki-vocab-ts <word> [options]"
    echo ""
    echo "Options:"
    echo "  --deck DECK_NAME    Override default deck name"
    echo "  --model MODEL_NAME  Override default model name"
    echo "  --no-audio          Disable automatic audio generation"
    echo "  --voice VOICE       Select TTS voice (Matthew, Joanna, Amy, Brian, Mizuki, Takumi)"
    echo "  --delete            Delete cards containing the word"
    echo "  --interactive       Enter interactive mode"
    echo ""
    echo "Example:"
    echo "  docker-compose run --rm anki-vocab-ts serendipity"
    echo "  docker-compose run --rm anki-vocab-ts eloquent --deck 'Advanced English'"
    echo "  docker-compose run --rm anki-vocab-ts --interactive"
    exit 1
fi

# Execute the Node.js application with all arguments
exec node /app/dist/index.js "$@"