#!/usr/bin/env python3
import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

prompt = """
Please provide the following information for the English word "beautiful":
1. Japanese meaning (日本語の意味、複数可、頻出順に)
2. English definition (英語の定義、複数可、頻出順に)
   CRITICAL: Each English definition MUST start with the part of speech in square brackets.
   Format: "[part of speech] definition"
   Examples: 
   - "[verb] to organize and carry out"
   - "[noun] a piece of furniture" 
   - "[adjective] having great size"
3. IPA pronunciation
4. Common idioms or phrases with Japanese translations (if any, otherwise write "N/A")
   Format as an array of objects with "english" and "japanese" keys
5. Example sentences (at least one, if possible 2-3, otherwise write "N/A")
6. Similar words and their differences (類似語とその違い)
   Provide 2-3 words that are similar in meaning but have nuanced differences.
   Format as an array of objects with "word", "difference" (in English), and "difference_japanese" keys.
   Example: [{"word": "big", "difference": "more general term for large size", "difference_japanese": "サイズが大きいことを表す一般的な言葉"}]
   If no similar words exist, write "N/A"

Format the response as JSON with these exact keys:
- japanese_meaning (array of strings)
- english_meaning (array of strings, EACH MUST START WITH [part of speech])
- ipa (string)
- idiom (array of objects with "english" and "japanese" keys, or "N/A" if none)
- example_sentence (array of strings)
- similar_words (array of objects with "word", "difference", and "difference_japanese" keys, or "N/A" if none)

Remember: Every item in english_meaning MUST begin with [noun], [verb], [adjective], [adverb], etc.
"""

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a helpful language teacher providing vocabulary information in JSON format."},
        {"role": "user", "content": prompt}
    ],
    temperature=0.3,
    response_format={"type": "json_object"}
)

data = json.loads(response.choices[0].message.content)
print(json.dumps(data, indent=2, ensure_ascii=False))