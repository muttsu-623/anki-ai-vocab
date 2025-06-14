#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import boto3
from dotenv import load_dotenv
from openai import OpenAI


class AnkiConnector:
    def __init__(self, host='localhost', port=8765):
        self.url = f'http://{host}:{port}'

    def _request(self, action: str, **params) -> Dict[str, Any]:
        return {'action': action, 'params': params, 'version': 6}

    def invoke(self, action: str, **params) -> Any:
        request_json = json.dumps(self._request(action, **params)).encode('utf-8')
        request_obj = urllib.request.Request(self.url, request_json)

        try:
            response = json.load(urllib.request.urlopen(request_obj))
        except urllib.error.URLError as e:
            raise Exception(f"Cannot connect to Anki. Make sure Anki is running with AnkiConnect installed. Error: {e}")

        if len(response) != 2:
            raise Exception('Response has an unexpected number of fields')
        if 'error' not in response:
            raise Exception('Response is missing required error field')
        if 'result' not in response:
            raise Exception('Response is missing required result field')
        if response['error'] is not None:
            raise Exception(response['error'])

        return response['result']

    def get_model_names(self) -> list:
        """Get list of all available note types (models) in Anki"""
        return self.invoke('modelNames')

    def get_model_field_names(self, model_name: str) -> list:
        """Get list of field names for a specific model"""
        return self.invoke('modelFieldNames', modelName=model_name)

    def get_deck_names(self) -> list:
        """Get list of all deck names in Anki"""
        return self.invoke('deckNames')

    def create_deck(self, deck_name: str) -> int:
        """Create a new deck. Returns deck ID."""
        return self.invoke('createDeck', deck=deck_name)

    def find_notes(self, query: str) -> list:
        """Find notes by search query. Returns list of note IDs."""
        return self.invoke('findNotes', query=query)

    def notes_info(self, note_ids: list) -> list:
        """Get detailed information about notes."""
        return self.invoke('notesInfo', notes=note_ids)

    def delete_notes(self, note_ids: list) -> None:
        """Delete notes by their IDs."""
        return self.invoke('deleteNotes', notes=note_ids)

    def add_note(self, deck_name: str, model_name: str, fields: Dict[str, str], tags: list = None, audio: list = None) -> int:
        # Check if deck exists and create if needed
        existing_decks = self.get_deck_names()
        if deck_name not in existing_decks:
            print(f"Creating new deck: {deck_name}")
            self.create_deck(deck_name)

        note = {
            "deckName": deck_name,
            "modelName": model_name,
            "fields": fields,
            "options": {
                "allowDuplicate": False,
                "duplicateScope": "deck"
            }
        }

        if tags:
            note["tags"] = tags

        if audio:
            note["audio"] = audio
            # Debug: show audio attachment details
            print(f"  Attaching {len(audio)} audio files to note")

        return self.invoke('addNote', note=note)


class VocabularyFetcher:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
        # Initialize AWS Polly client
        self.polly_client = boto3.client(
            'polly',
            region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
        )

    def get_word_info(self, word: str) -> Dict[str, str]:
        prompt = f"""
        Please provide the following information for the English word "{word}":
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

        Format the response as JSON with these exact keys:
        - japanese_meaning (array of strings)
        - english_meaning (array of strings, EACH MUST START WITH [part of speech])
        - ipa (string)
        - idiom (array of objects with "english" and "japanese" keys, or "N/A" if none)
        - example_sentence (array of strings)
        
        Remember: Every item in english_meaning MUST begin with [noun], [verb], [adjective], [adverb], etc.
        """

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful language teacher providing vocabulary information in JSON format. Always include parts of speech in square brackets [noun], [verb], [adjective], etc. at the beginning of each English definition."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            content = response.choices[0].message.content
            data = json.loads(content)
            
            # Ensure english_meaning entries have parts of speech
            if 'english_meaning' in data and isinstance(data['english_meaning'], list):
                processed_meanings = []
                for meaning in data['english_meaning']:
                    # Check if it already has a part of speech tag
                    if not meaning.startswith('['):
                        # Try to infer part of speech from the definition
                        meaning_lower = meaning.lower()
                        if meaning_lower.startswith(('to ', 'to be ')):
                            processed_meanings.append(f"[verb] {meaning}")
                        elif meaning_lower.startswith(('a ', 'an ', 'the ')):
                            processed_meanings.append(f"[noun] {meaning}")
                        elif any(meaning_lower.startswith(w) for w in ['having ', 'being ', 'showing ', 'causing ', 'pleasing ', 'making ']):
                            processed_meanings.append(f"[adjective] {meaning}")
                        elif any(w in meaning_lower for w in [' act of ', ' process of ', ' state of ', ' quality of ']):
                            processed_meanings.append(f"[noun] {meaning}")
                        elif 'ly' in meaning_lower.split()[-1] if meaning_lower.split() else False:
                            processed_meanings.append(f"[adverb] {meaning}")
                        else:
                            # For single word, it's often an adjective
                            if len(meaning.split()) <= 5 and not any(c in meaning for c in '.,:;'):
                                processed_meanings.append(f"[adjective] {meaning}")
                            else:
                                processed_meanings.append(f"[definition] {meaning}")
                    else:
                        processed_meanings.append(meaning)
                data['english_meaning'] = processed_meanings
            
            return data
        except Exception as e:
            raise Exception(f"Error fetching word information from OpenAI: {e}")

    def generate_audio(self, text: str, voice: str = "Matthew", speed: float = 1.0) -> bytes:
        """Generate audio using Amazon Polly TTS API"""
        try:
            # Map speed to Polly's rate parameter (percentage)
            # OpenAI: 0.25-4.0, Polly: 20%-200%
            polly_rate = int(speed * 100)

            # Wrap text in SSML for speed control
            ssml_text = f'<speak><prosody rate="{polly_rate}%">{text}</prosody></speak>'

            response = self.polly_client.synthesize_speech(
                Text=ssml_text,
                TextType='ssml',
                OutputFormat='mp3',
                VoiceId=voice,
                Engine='neural'  # Use neural engine for better quality
            )

            # Read the audio stream
            audio_stream = response['AudioStream']
            return audio_stream.read()
        except Exception as e:
            raise Exception(f"Error generating audio with Polly: {e}")

    def generate_audio_files(self, word: str, example_sentences, voice: str = "Matthew") -> Tuple[str, list]:
        """Generate audio files for word and example sentences, return word audio and list of example audios"""
        try:
            # Generate audio for the word (slower speed for clarity)
            word_audio = self.generate_audio(word, voice=voice, speed=0.9)
            word_audio_base64 = base64.b64encode(word_audio).decode('utf-8')

            # Generate audio for each example sentence separately
            example_audio_list = []

            if example_sentences:
                # Handle both string and list input
                if isinstance(example_sentences, str):
                    if example_sentences.strip() and example_sentences.strip() != 'N/A':
                        sentences = [example_sentences.strip()]
                    else:
                        sentences = []
                elif isinstance(example_sentences, list):
                    sentences = [s.strip() for s in example_sentences if s.strip() and s.strip() != 'N/A']
                else:
                    sentences = []

                # Generate audio for each sentence
                for i, sentence in enumerate(sentences):
                    if sentence:
                        example_audio = self.generate_audio(sentence, voice=voice, speed=1.0)
                        example_audio_base64 = base64.b64encode(example_audio).decode('utf-8')
                        example_audio_list.append({
                            'index': i,
                            'sentence': sentence,
                            'audio': example_audio_base64
                        })

            return word_audio_base64, example_audio_list
        except Exception as e:
            raise Exception(f"Error generating audio files: {e}")


def load_config() -> Dict[str, Any]:
    config_path = os.path.expanduser("~/.config/anki-vocab/config.json")

    # Default configuration with environment variable support
    default_config = {
        "deck_name": os.getenv("DECK_NAME", "English Vocabulary"),
        "model_name": os.getenv("MODEL_NAME", "Basic (and reversed card)"),
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        "anki_host": os.getenv("ANKI_HOST", "localhost"),
        "anki_port": int(os.getenv("ANKI_PORT", "8765"))
    }

    if not os.path.exists(config_path):
        return default_config

    # Load from config file and override with environment variables
    with open(config_path, 'r') as f:
        file_config = json.load(f)

    # Environment variables take precedence
    for key in default_config:
        env_value = os.getenv(key.upper())
        if env_value:
            if key == "anki_port":
                file_config[key] = int(env_value)
            else:
                file_config[key] = env_value

    return file_config


def create_anki_fields(word: str, word_info: Dict[str, str], field_names: list, audio_files: list = None) -> Dict[str, str]:
    # Create safe filename (replace spaces and special chars)
    safe_word = word.replace(' ', '_').replace('/', '_').replace('\\', '_')

    # Front field: Word with pronunciation and audio
    # Find word audio file
    word_audio_tag = ""
    if audio_files:
        word_audio_file = next((af for af in audio_files if af['filename'].startswith(f'word_{safe_word}')), None)
        if word_audio_file:
            word_audio_tag = f" [sound:{word_audio_file['filename']}]"

    front = f"""
    <div style="font-size: 24px; font-weight: bold;">{word}{word_audio_tag}</div>
    <div style="font-size: 18px; color: #666;">{word_info.get('ipa', '')}</div>
    """

    # Handle English meanings (list or string)
    english_content = word_info.get('english_meaning', '')
    if isinstance(english_content, list):
        english_html = '<ul style="margin: 5px 0; padding-left: 20px;">' + ''.join([f"<li>{meaning}</li>" for meaning in english_content]) + '</ul>'
    else:
        english_html = english_content

    # Back field: Meanings without word audio
    back = f"""
    <div style="margin-bottom: 15px;">
        <strong>English:</strong> {english_html}
    </div>
    """

    # Handle both string and list for example_sentence in HTML
    example_content = word_info.get('example_sentence', '')

    # Find example audio files
    example_audio_files = []
    if audio_files:
        example_audio_files = [af for af in audio_files if af['filename'].startswith(f'example_{safe_word}_')]
        # Sort by filename to maintain order
        example_audio_files.sort(key=lambda x: x['filename'])

    if isinstance(example_content, list):
        example_items = []
        for i, example in enumerate(example_content):
            # Add audio button if corresponding audio file exists
            audio_tag = ""
            if i < len(example_audio_files):
                audio_filename = example_audio_files[i]['filename']
                audio_tag = f" [sound:{audio_filename}]"
            example_items.append(f"<li>{example}{audio_tag}</li>")
        example_html = '<ul style="margin: 5px 0; padding-left: 20px;">' + ''.join(example_items) + '</ul>'
    else:
        # Single example sentence
        audio_tag = ""
        if example_audio_files:
            audio_filename = example_audio_files[0]['filename']
            audio_tag = f" [sound:{audio_filename}]"
        example_html = f"{example_content}{audio_tag}"

    back += f"""
    <div style="margin-bottom: 15px; margin-top: 20px; padding: 10px; background-color: #f0f0f0; border-radius: 5px;">
        <strong>Example:</strong> {example_html}
    </div>
    """

    # Divider between English and Japanese meanings
    back += """
    <hr style="margin: 20px 0; border: 1px solid #ccc;">
    """

    # Handle Japanese meanings (list or string)
    japanese_content = word_info.get('japanese_meaning', '')
    if isinstance(japanese_content, list):
        japanese_html = '<ul style="margin: 5px 0; padding-left: 20px;">' + ''.join([f"<li>{meaning}</li>" for meaning in japanese_content]) + '</ul>'
    else:
        japanese_html = japanese_content

    back += f"""
    <div style="margin-bottom: 15px;">
        <strong>Japanese:</strong> {japanese_html}
    </div>
    """


    # Handle idioms (list or string)
    if word_info.get('idiom') and word_info['idiom'] != 'N/A':
        idiom_content = word_info['idiom']
        if isinstance(idiom_content, list):
            idiom_items = []
            for idiom in idiom_content:
                if isinstance(idiom, dict) and 'english' in idiom and 'japanese' in idiom:
                    idiom_items.append(f"<li>{idiom['english']}<br><span style='color: #666; margin-left: 20px;'>→ {idiom['japanese']}</span></li>")
                else:
                    idiom_items.append(f"<li>{idiom}</li>")
            idiom_html = '<ul style="margin: 5px 0; padding-left: 20px;">' + ''.join(idiom_items) + '</ul>'
        else:
            idiom_html = idiom_content

        back += f"""
        <div style="margin-bottom: 15px;">
            <strong>Idiom/Phrase:</strong> {idiom_html}
        </div>
        """

    # Map to actual field names
    fields = {}

    # Common field name patterns
    if len(field_names) >= 2:
        # Try to identify front and back fields
        front_field = None
        back_field = None

        for field in field_names:
            field_lower = field.lower()
            if any(x in field_lower for x in ['front', 'question', 'text1', 'expression', 'word']):
                front_field = field
            elif any(x in field_lower for x in ['back', 'answer', 'text2', 'meaning', 'definition']):
                back_field = field

        # If not found by name, use first two fields
        if not front_field:
            front_field = field_names[0]
        if not back_field:
            back_field = field_names[1] if len(field_names) > 1 else field_names[0]

        fields[front_field] = front
        if back_field != front_field:
            fields[back_field] = back
    else:
        # Single field note type
        fields[field_names[0]] = front + "\n" + back

    return fields


def interactive_session(config: Dict[str, Any], deck_name: str, model_name: str, voice: str, no_audio: bool):
    """Interactive session for continuous word processing"""
    
    try:
        anki = AnkiConnector(config["anki_host"], config["anki_port"])
        
        # Check if model exists
        available_models = anki.get_model_names()
        if model_name not in available_models:
            print(f"Error: Note type '{model_name}' not found in Anki.")
            print(f"\nAvailable note types:")
            for model in available_models:
                print(f"  - {model}")
            return
        
        # Get field names for the model
        field_names = anki.get_model_field_names(model_name)
        print(f"✓ Connected to Anki")
        print(f"✓ Using deck: '{deck_name}'")
        print(f"✓ Using model: '{model_name}' with fields: {', '.join(field_names)}")
        print(f"✓ Voice: '{voice}'")
        print(f"✓ Audio: {'Disabled' if no_audio else 'Enabled'}")
        
        if not config.get("openai_api_key"):
            print("Error: OpenAI API key not found. Please set OPENAI_API_KEY environment variable or add it to config.")
            return
        
        fetcher = VocabularyFetcher(config["openai_api_key"])
        
        print("\n" + "="*50)
        print("Interactive Mode - Anki AI Vocabulary Builder")
        print("="*50)
        print("Commands:")
        print("  add <word>     - Add a word to your deck")
        print("  delete <word>  - Delete cards containing the word")
        print("  help           - Show this help message")
        print("  quit           - Exit interactive mode")
        print("="*50)
        
        while True:
            try:
                user_input = input("\n> ").strip()
                
                if not user_input:
                    continue
                
                parts = user_input.split(None, 1)
                command = parts[0].lower()
                
                if command == "quit" or command == "exit":
                    print("Goodbye!")
                    break
                
                elif command == "help":
                    print("\nCommands:")
                    print("  add <word>     - Add a word to your deck")
                    print("  delete <word>  - Delete cards containing the word")
                    print("  help           - Show this help message")
                    print("  quit           - Exit interactive mode")
                
                elif command == "add":
                    if len(parts) < 2:
                        print("Usage: add <word>")
                        continue
                    
                    word = parts[1].strip()
                    print(f"\nFetching information for '{word}'...")
                    
                    try:
                        word_info = fetcher.get_word_info(word)
                        
                        print("Word information retrieved:")
                        
                        # Handle Japanese meanings display
                        japanese_display = word_info.get('japanese_meaning', 'N/A')
                        if isinstance(japanese_display, list):
                            print(f"  Japanese:")
                            for i, meaning in enumerate(japanese_display, 1):
                                print(f"    {i}. {meaning}")
                        else:
                            print(f"  Japanese: {japanese_display}")
                        
                        # Handle English meanings display
                        english_display = word_info.get('english_meaning', 'N/A')
                        if isinstance(english_display, list):
                            print(f"  English:")
                            for i, meaning in enumerate(english_display, 1):
                                print(f"    {i}. {meaning}")
                        else:
                            print(f"  English: {english_display}")
                        
                        print(f"  IPA: {word_info.get('ipa', 'N/A')}")
                        
                        # Handle idioms display
                        idiom_display = word_info.get('idiom', 'N/A')
                        if isinstance(idiom_display, list) and idiom_display != 'N/A':
                            print(f"  Idiom:")
                            for i, idiom in enumerate(idiom_display, 1):
                                if isinstance(idiom, dict) and 'english' in idiom and 'japanese' in idiom:
                                    print(f"    {i}. {idiom['english']} - {idiom['japanese']}")
                                else:
                                    print(f"    {i}. {idiom}")
                        else:
                            print(f"  Idiom: {idiom_display}")
                        
                        # Handle both string and list for example_sentence display
                        example_display = word_info.get('example_sentence', 'N/A')
                        if isinstance(example_display, list):
                            print(f"  Example:")
                            for i, example in enumerate(example_display, 1):
                                print(f"    {i}. {example}")
                        else:
                            print(f"  Example: {example_display}")
                        
                        # Generate audio automatically (unless disabled)
                        audio_files = None
                        audio_generated = False
                        if not no_audio:
                            print(f"Generating audio with voice '{voice}'...")
                            try:
                                word_audio_b64, example_audio_list = fetcher.generate_audio_files(
                                    word,
                                    word_info.get('example_sentence', ''),
                                    voice=voice
                                )
                                
                                # Create safe filename (same as in create_anki_fields)
                                safe_word = word.replace(' ', '_').replace('/', '_').replace('\\', '_')
                                
                                # Create audio files list
                                audio_files = [
                                    {
                                        "filename": f"word_{safe_word}.mp3",
                                        "data": word_audio_b64,
                                        "fields": [field_names[0]] if field_names else []  # Only front field
                                    }
                                ]
                                
                                # Add separate audio file for each example sentence
                                for example_audio in example_audio_list:
                                    audio_files.append({
                                        "filename": f"example_{safe_word}_{example_audio['index'] + 1}.mp3",
                                        "data": example_audio['audio'],
                                        "fields": [field_names[1]] if len(field_names) > 1 else field_names  # Only back field
                                    })
                                
                                audio_generated = True
                                total_files = 1 + len(example_audio_list)
                                print(f"✓ Audio files generated successfully ({total_files} files: 1 word + {len(example_audio_list)} examples)")
                            except Exception as e:
                                print(f"Warning: Failed to generate audio: {e}")
                                print("Continuing without audio...")
                        
                        print("Adding to Anki...")
                        
                        fields = create_anki_fields(word, word_info, field_names, audio_files)
                        
                        # Debug: Show field contents
                        for field_name, field_content in fields.items():
                            if "[sound:" in field_content:
                                print(f"  Field '{field_name}' contains audio tags")
                        
                        note_id = anki.add_note(deck_name, model_name, fields, tags=["english", "vocabulary", "ai-generated"], audio=audio_files)
                        
                        if audio_generated and audio_files:
                            print(f"✓ Successfully added '{word}' with audio to deck '{deck_name}' (Note ID: {note_id})")
                        else:
                            print(f"✓ Successfully added '{word}' to deck '{deck_name}' (Note ID: {note_id})")
                    
                    except Exception as e:
                        print(f"Error processing '{word}': {e}")
                
                elif command == "delete":
                    if len(parts) < 2:
                        print("Usage: delete <word>")
                        continue
                    
                    word = parts[1].strip()
                    print(f"Searching for cards containing '{word}'...")
                    
                    try:
                        # Build search query - search in all fields and deck
                        query = f'"{word}" deck:"{deck_name}"'
                        note_ids = anki.find_notes(query)
                        
                        if not note_ids:
                            print(f"No cards found containing '{word}' in deck '{deck_name}'")
                            continue
                        
                        # Get note information to show what will be deleted
                        notes_info = anki.notes_info(note_ids)
                        print(f"\nFound {len(note_ids)} card(s) to delete:")
                        
                        for note in notes_info:
                            # Extract word from fields (try to get the front field)
                            fields = note.get('fields', {})
                            display_text = None
                            for field_name, field_data in fields.items():
                                if field_data and field_data.get('value'):
                                    display_text = field_data['value'][:50] + "..." if len(field_data['value']) > 50 else field_data['value']
                                    break
                            print(f"  - Note ID {note['noteId']}: {display_text if display_text else 'Unknown content'}")
                        
                        # Confirm deletion
                        confirm = input(f"\nDelete {len(note_ids)} card(s)? (y/N): ")
                        if confirm.lower() == 'y':
                            anki.delete_notes(note_ids)
                            print(f"✓ Successfully deleted {len(note_ids)} card(s)")
                        else:
                            print("Deletion cancelled")
                    
                    except Exception as e:
                        print(f"Error deleting '{word}': {e}")
                
                else:
                    print(f"Unknown command: {command}")
                    print("Type 'help' for available commands")
            
            except KeyboardInterrupt:
                print("\nUse 'quit' to exit or continue with another command")
            except EOFError:
                print("\nGoodbye!")
                break
    
    except Exception as e:
        print(f"Error in interactive session: {e}")


def main():
    # Load environment variables from .env file
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Add English vocabulary to Anki deck with AI-generated definitions or delete existing cards"
    )
    parser.add_argument("word", nargs="?", help="The English word to add or delete (not required in interactive mode)")
    parser.add_argument("--deck", help="Anki deck name (overrides config)")
    parser.add_argument("--model", help="Anki note model name (overrides config)")
    parser.add_argument("--no-audio", action="store_true", help="Disable automatic audio generation")
    parser.add_argument("--voice", help="Amazon Polly voice (Joanna, Matthew, Amy, Brian, Mizuki, Takumi, etc.)", default="Matthew")
    parser.add_argument("--delete", action="store_true", help="Delete cards containing the word instead of adding")
    parser.add_argument("--config", action="store_true", help="Show configuration path")
    parser.add_argument("--interactive", "-i", action="store_true", help="Enter interactive mode for continuous word processing")

    args = parser.parse_args()

    if args.config:
        config_path = os.path.expanduser("~/.config/anki-vocab/config.json")
        print(f"Configuration file location: {config_path}")
        return

    config = load_config()

    deck_name = args.deck or config["deck_name"]
    model_name = args.model or config["model_name"]

    # Handle interactive mode
    if args.interactive:
        interactive_session(config, deck_name, model_name, args.voice, args.no_audio)
        return

    # Check if word is provided for non-interactive mode
    if not args.word:
        parser.error("the following arguments are required: word (unless using --interactive mode)")

    try:
        anki = AnkiConnector(config["anki_host"], config["anki_port"])

        # Delete mode
        if args.delete:
            print(f"Searching for cards containing '{args.word}'...")

            # Build search query - search in all fields and deck
            query = f'"{args.word}" deck:"{deck_name}"'
            note_ids = anki.find_notes(query)

            if not note_ids:
                print(f"No cards found containing '{args.word}' in deck '{deck_name}'")
                sys.exit(0)

            # Get note information to show what will be deleted
            notes_info = anki.notes_info(note_ids)
            print(f"\nFound {len(note_ids)} card(s) to delete:")

            for note in notes_info:
                # Extract word from fields (try to get the front field)
                fields = note.get('fields', {})
                display_text = None
                for field_name, field_data in fields.items():
                    if field_data and field_data.get('value'):
                        display_text = field_data['value'][:50] + "..." if len(field_data['value']) > 50 else field_data['value']
                        break
                print(f"  - Note ID {note['noteId']}: {display_text if display_text else 'Unknown content'}")

            # Confirm deletion
            confirm = input(f"\nDelete {len(note_ids)} card(s)? (y/N): ")
            if confirm.lower() == 'y':
                anki.delete_notes(note_ids)
                print(f"✓ Successfully deleted {len(note_ids)} card(s)")
            else:
                print("Deletion cancelled")

            sys.exit(0)

        # Add mode (existing functionality)
        if not config.get("openai_api_key"):
            print("Error: OpenAI API key not found. Please set OPENAI_API_KEY environment variable or add it to config.")
            sys.exit(1)

        print(f"Fetching information for '{args.word}'...")

        # Check if model exists
        available_models = anki.get_model_names()
        if model_name not in available_models:
            print(f"Error: Note type '{model_name}' not found in Anki.")
            print(f"\nAvailable note types:")
            for model in available_models:
                print(f"  - {model}")
            print(f"\nYou can specify a different note type with --model \"Note Type Name\"")
            print(f"Or update MODEL_NAME in your .env file")
            sys.exit(1)

        # Get field names for the model
        field_names = anki.get_model_field_names(model_name)
        print(f"\nUsing note type '{model_name}' with fields: {', '.join(field_names)}")

        fetcher = VocabularyFetcher(config["openai_api_key"])
        word_info = fetcher.get_word_info(args.word)

        print("\nWord information retrieved:")

        # Handle Japanese meanings display
        japanese_display = word_info.get('japanese_meaning', 'N/A')
        if isinstance(japanese_display, list):
            print(f"  Japanese:")
            for i, meaning in enumerate(japanese_display, 1):
                print(f"    {i}. {meaning}")
        else:
            print(f"  Japanese: {japanese_display}")

        # Handle English meanings display
        english_display = word_info.get('english_meaning', 'N/A')
        if isinstance(english_display, list):
            print(f"  English:")
            for i, meaning in enumerate(english_display, 1):
                print(f"    {i}. {meaning}")
        else:
            print(f"  English: {english_display}")

        print(f"  IPA: {word_info.get('ipa', 'N/A')}")

        # Handle idioms display
        idiom_display = word_info.get('idiom', 'N/A')
        if isinstance(idiom_display, list) and idiom_display != 'N/A':
            print(f"  Idiom:")
            for i, idiom in enumerate(idiom_display, 1):
                if isinstance(idiom, dict) and 'english' in idiom and 'japanese' in idiom:
                    print(f"    {i}. {idiom['english']} - {idiom['japanese']}")
                else:
                    print(f"    {i}. {idiom}")
        else:
            print(f"  Idiom: {idiom_display}")

        # Handle both string and list for example_sentence display
        example_display = word_info.get('example_sentence', 'N/A')
        if isinstance(example_display, list):
            print(f"  Example:")
            for i, example in enumerate(example_display, 1):
                print(f"    {i}. {example}")
        else:
            print(f"  Example: {example_display}")

        # Generate audio automatically (unless disabled)
        audio_files = None
        audio_generated = False
        if not args.no_audio:
            print(f"\nGenerating audio with voice '{args.voice}'...")
            try:
                word_audio_b64, example_audio_list = fetcher.generate_audio_files(
                    args.word,
                    word_info.get('example_sentence', ''),
                    voice=args.voice
                )

                # Create safe filename (same as in create_anki_fields)
                safe_word = args.word.replace(' ', '_').replace('/', '_').replace('\\', '_')

                # Create audio files list
                audio_files = [
                    {
                        "filename": f"word_{safe_word}.mp3",
                        "data": word_audio_b64,
                        "fields": [field_names[0]] if field_names else []  # Only front field
                    }
                ]

                # Add separate audio file for each example sentence
                for example_audio in example_audio_list:
                    audio_files.append({
                        "filename": f"example_{safe_word}_{example_audio['index'] + 1}.mp3",
                        "data": example_audio['audio'],
                        "fields": [field_names[1]] if len(field_names) > 1 else field_names  # Only back field
                    })

                audio_generated = True
                total_files = 1 + len(example_audio_list)
                print(f"✓ Audio files generated successfully ({total_files} files: 1 word + {len(example_audio_list)} examples)")
            except Exception as e:
                print(f"Warning: Failed to generate audio: {e}")
                print("Continuing without audio...")

        print("\nAdding to Anki...")

        fields = create_anki_fields(args.word, word_info, field_names, audio_files)

        # Debug: Show field contents
        for field_name, field_content in fields.items():
            if "[sound:" in field_content:
                print(f"  Field '{field_name}' contains audio tags")

        note_id = anki.add_note(deck_name, model_name, fields, tags=["english", "vocabulary", "ai-generated"], audio=audio_files)

        if audio_generated and audio_files:
            print(f"✓ Successfully added '{args.word}' with audio to deck '{deck_name}' (Note ID: {note_id})")
        else:
            print(f"✓ Successfully added '{args.word}' to deck '{deck_name}' (Note ID: {note_id})")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
