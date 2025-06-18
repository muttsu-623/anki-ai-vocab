#!/usr/bin/env python3
"""Test script to verify similar words functionality"""

import json
import os
from dotenv import load_dotenv
from anki_vocab import VocabularyFetcher

# Load environment variables
load_dotenv()

# Test the get_word_info method
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("Error: OPENAI_API_KEY not found in environment variables")
    exit(1)

fetcher = VocabularyFetcher(api_key)

# Test with a word that should have similar words
test_word = "beautiful"
print(f"Testing word: {test_word}")
print("="*50)

try:
    word_info = fetcher.get_word_info(test_word)
    
    # Pretty print the JSON response
    print("Raw JSON response:")
    print(json.dumps(word_info, indent=2, ensure_ascii=False))
    
    print("\n" + "="*50)
    print("Similar words section:")
    
    # Check if similar_words exists in response
    if 'similar_words' in word_info:
        similar_words = word_info['similar_words']
        if similar_words != 'N/A' and isinstance(similar_words, list):
            print(f"Found {len(similar_words)} similar words:")
            for i, similar in enumerate(similar_words, 1):
                if isinstance(similar, dict):
                    print(f"\n{i}. {similar.get('word', 'N/A')}")
                    print(f"   Difference: {similar.get('difference', 'N/A')}")
                    print(f"   Japanese: {similar.get('difference_japanese', 'N/A')}")
        else:
            print("No similar words found or invalid format")
    else:
        print("'similar_words' key not found in response")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()