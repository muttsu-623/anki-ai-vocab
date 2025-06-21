import * as readline from 'readline';
import { AnkiConnector } from './ankiConnector';
import { VocabularyFetcher } from './vocabularyFetcher';
import { parseJapaneseMeanings, createAnkiFields } from './utils';
import { Config, WordInfo, AnkiAudioFile, WordIdiom, SimilarWord } from '../types';

export class InteractiveSession {
  private anki: AnkiConnector;
  private fetcher: VocabularyFetcher;
  private config: Config;
  private deckName: string;
  private modelName: string;
  private voice: string;
  private noAudio: boolean;
  private fieldNames: string[] = [];
  private rl: readline.Interface;

  constructor(
    config: Config,
    deckName: string,
    modelName: string,
    voice: string,
    noAudio: boolean
  ) {
    this.config = config;
    this.deckName = deckName;
    this.modelName = modelName;
    this.voice = voice;
    this.noAudio = noAudio;
    
    this.anki = new AnkiConnector(config.anki_host, config.anki_port);
    this.fetcher = new VocabularyFetcher(config.openai_api_key);
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start(): Promise<void> {
    try {
      // Check if model exists
      const availableModels = await this.anki.getModelNames();
      if (!availableModels.includes(this.modelName)) {
        console.log(`Error: Note type '${this.modelName}' not found in Anki.`);
        console.log('\nAvailable note types:');
        availableModels.forEach(model => {
          console.log(`  - ${model}`);
        });
        return;
      }

      // Get field names for the model
      this.fieldNames = await this.anki.getModelFieldNames(this.modelName);
      console.log('✓ Connected to Anki');
      console.log(`✓ Using deck: '${this.deckName}'`);
      console.log(`✓ Using model: '${this.modelName}' with fields: ${this.fieldNames.join(', ')}`);
      console.log(`✓ Voice: '${this.voice}'`);
      console.log(`✓ Audio: ${this.noAudio ? 'Disabled' : 'Enabled'}`);

      if (!this.config.openai_api_key) {
        console.log('Error: OpenAI API key not found. Please set OPENAI_API_KEY environment variable or add it to config.');
        return;
      }

      console.log('\n' + '='.repeat(50));
      console.log('Interactive Mode - Anki AI Vocabulary Builder');
      console.log('='.repeat(50));
      console.log('Commands:');
      console.log('  add <word> [japanese-meanings]  - Add a word to your deck');
      console.log('    Examples:');
      console.log('      add sophisticated');
      console.log('      add sophisticated 洗練された,上品な');
      console.log('  delete <word>                   - Delete cards containing the word');
      console.log('  help                            - Show this help message');
      console.log('  quit                            - Exit interactive mode');
      console.log('='.repeat(50));

      await this.interactiveLoop();
    } catch (error) {
      console.error(`Error in interactive session: ${error}`);
    } finally {
      this.rl.close();
    }
  }

  private async interactiveLoop(): Promise<void> {
    while (true) {
      try {
        const userInput = await this.prompt('\n> ');
        
        if (!userInput.trim()) {
          continue;
        }

        const parts = userInput.trim().split(/\s+/);
        const command = parts[0]?.toLowerCase();

        if (command === 'quit' || command === 'exit') {
          console.log('Goodbye!');
          break;
        } else if (command === 'help') {
          this.showHelp();
        } else if (command === 'add') {
          await this.handleAddCommand(parts);
        } else if (command === 'delete') {
          await this.handleDeleteCommand(parts);
        } else {
          console.log(`Unknown command: ${command}`);
          console.log("Type 'help' for available commands");
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('SIGINT')) {
          console.log("\nUse 'quit' to exit or continue with another command");
        } else {
          console.error('Error:', error);
        }
      }
    }
  }

  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  private showHelp(): void {
    console.log('\nCommands:');
    console.log('  add <word> [japanese-meanings]  - Add a word to your deck');
    console.log('    Examples:');
    console.log('      add sophisticated');
    console.log('      add sophisticated 洗練された,上品な');
    console.log('  delete <word>                   - Delete cards containing the word');
    console.log('  help                            - Show this help message');
    console.log('  quit                            - Exit interactive mode');
  }

  private async handleAddCommand(parts: string[]): Promise<void> {
    if (parts.length < 2) {
      console.log('Usage: add <word> [japanese-meanings]');
      console.log('  Example: add sophisticated');
      console.log('  Example: add sophisticated 洗練された,上品な');
      return;
    }

    const word = parts[1];
    if (!word) {
      console.log('Usage: add <word> [japanese-meanings]');
      console.log('  Example: add sophisticated');
      console.log('  Example: add sophisticated 洗練された,上品な');
      return;
    }
    
    let japaneseMeanings: string[] = [];
    
    // Check if Japanese meanings are provided as additional arguments
    if (parts.length >= 3) {
      const japaneseMeaningsStr = parts.slice(2).join(' ');
      japaneseMeanings = parseJapaneseMeanings(japaneseMeaningsStr);
    }
    
    if (japaneseMeanings.length > 0) {
      console.log(`\nFetching information for '${word}' with specific Japanese meanings: ${japaneseMeanings.join(', ')}`);
    } else {
      console.log(`\nFetching information for '${word}'...`);
    }

    try {
      // Use appropriate method based on whether Japanese meanings are provided
      let wordInfo: WordInfo;
      if (japaneseMeanings.length > 0) {
        wordInfo = await this.fetcher.getWordInfoWithSpecificMeanings(word, japaneseMeanings);
      } else {
        wordInfo = await this.fetcher.getWordInfo(word);
      }

      console.log('Word information retrieved:');
      this.displayWordInfo(wordInfo);

      // Generate audio automatically (unless disabled)
      let audioFiles: AnkiAudioFile[] = [];
      let audioGenerated = false;
      
      if (!this.noAudio) {
        console.log(`Generating audio with voice '${this.voice}'...`);
        try {
          const audioResult = await this.fetcher.generateAudioFiles(
            word,
            wordInfo.example_sentence,
            this.voice
          );

          // Create safe filename (same as in createAnkiFields)
          const safeWord = word.replace(/[ /\\]/g, '_');

          // Create audio files list
          audioFiles = [
            {
              filename: `word_${safeWord}.mp3`,
              data: audioResult.wordAudio,
              fields: this.fieldNames.length > 0 ? [this.fieldNames[0]!] : []
            }
          ];

          // Add separate audio file for each example sentence
          audioResult.exampleAudios.forEach(exampleAudio => {
            audioFiles.push({
              filename: `example_${safeWord}_${exampleAudio.index + 1}.mp3`,
              data: exampleAudio.audio,
              fields: this.fieldNames.length > 1 ? [this.fieldNames[1]!] : this.fieldNames
            });
          });

          audioGenerated = true;
          const totalFiles = 1 + audioResult.exampleAudios.length;
          console.log(`✓ Audio files generated successfully (${totalFiles} files: 1 word + ${audioResult.exampleAudios.length} examples)`);
        } catch (error) {
          console.log(`Warning: Failed to generate audio: ${error}`);
          console.log('Continuing without audio...');
        }
      }

      console.log('Adding to Anki...');

      const fields = createAnkiFields(word, wordInfo, this.fieldNames, audioFiles);

      // Debug: Show field contents
      Object.entries(fields).forEach(([fieldName, fieldContent]) => {
        if (fieldContent.includes('[sound:')) {
          console.log(`  Field '${fieldName}' contains audio tags`);
        }
      });

      const noteId = await this.anki.addNote(
        this.deckName,
        this.modelName,
        fields,
        ['english', 'vocabulary', 'ai-generated'],
        audioFiles
      );

      if (audioGenerated && audioFiles.length > 0) {
        console.log(`✓ Successfully added '${word}' with audio to deck '${this.deckName}' (Note ID: ${noteId})`);
      } else {
        console.log(`✓ Successfully added '${word}' to deck '${this.deckName}' (Note ID: ${noteId})`);
      }
    } catch (error) {
      console.log(`Error processing '${word}': ${error}`);
    }
  }

  private async handleDeleteCommand(parts: string[]): Promise<void> {
    if (parts.length < 2) {
      console.log('Usage: delete <word>');
      return;
    }

    const word = parts[1];
    if (!word) {
      console.log('Usage: delete <word>');
      return;
    }
    
    console.log(`Searching for cards containing '${word}'...`);

    try {
      // Build search query - search in all fields and deck
      const query = `"${word}" deck:"${this.deckName}"`;
      const noteIds = await this.anki.findNotes(query);

      if (noteIds.length === 0) {
        console.log(`No cards found containing '${word}' in deck '${this.deckName}'`);
        return;
      }

      // Get note information to show what will be deleted
      const notesInfo = await this.anki.notesInfo(noteIds);
      console.log(`\nFound ${noteIds.length} card(s) to delete:`);

      notesInfo.forEach(note => {
        // Extract word from fields (try to get the front field)
        const fields = note.fields;
        let displayText: string | undefined;
        
        for (const [fieldName, fieldData] of Object.entries(fields)) {
          if (fieldData?.value) {
            displayText = fieldData.value.length > 50 
              ? fieldData.value.substring(0, 50) + '...' 
              : fieldData.value;
            break;
          }
        }
        
        console.log(`  - Note ID ${note.noteId}: ${displayText || 'Unknown content'}`);
      });

      // Confirm deletion
      const confirm = await this.prompt(`\nDelete ${noteIds.length} card(s)? (y/N): `);
      if (confirm.toLowerCase() === 'y') {
        await this.anki.deleteNotes(noteIds);
        console.log(`✓ Successfully deleted ${noteIds.length} card(s)`);
      } else {
        console.log('Deletion cancelled');
      }
    } catch (error) {
      console.log(`Error deleting '${word}': ${error}`);
    }
  }

  private displayWordInfo(wordInfo: WordInfo): void {
    // Handle Japanese meanings display
    const japaneseDisplay = wordInfo.japanese_meaning;
    if (Array.isArray(japaneseDisplay)) {
      console.log('  Japanese:');
      japaneseDisplay.forEach((meaning, i) => {
        console.log(`    ${i + 1}. ${meaning}`);
      });
    } else {
      console.log(`  Japanese: ${japaneseDisplay}`);
    }

    // Handle English meanings display
    const englishDisplay = wordInfo.english_meaning;
    if (Array.isArray(englishDisplay)) {
      console.log('  English:');
      englishDisplay.forEach((meaning, i) => {
        console.log(`    ${i + 1}. ${meaning}`);
      });
    } else {
      console.log(`  English: ${englishDisplay}`);
    }

    console.log(`  IPA: ${wordInfo.ipa || 'N/A'}`);

    // Handle idioms display
    const idiomDisplay = wordInfo.idiom;
    if (Array.isArray(idiomDisplay)) {
      console.log('  Idiom:');
      idiomDisplay.forEach((idiom, i) => {
        if (typeof idiom === 'object' && 'english' in idiom && 'japanese' in idiom) {
          const typedIdiom = idiom as WordIdiom;
          console.log(`    ${i + 1}. ${typedIdiom.english} - ${typedIdiom.japanese}`);
        } else {
          console.log(`    ${i + 1}. ${idiom}`);
        }
      });
    } else {
      console.log(`  Idiom: ${idiomDisplay}`);
    }

    // Handle both string and list for example_sentence display
    const exampleDisplay = wordInfo.example_sentence;
    if (Array.isArray(exampleDisplay)) {
      console.log('  Example:');
      exampleDisplay.forEach((example, i) => {
        console.log(`    ${i + 1}. ${example}`);
      });
    } else {
      console.log(`  Example: ${exampleDisplay}`);
    }

    // Handle similar words display
    const similarDisplay = wordInfo.similar_words;
    if (Array.isArray(similarDisplay)) {
      console.log('  Similar Words:');
      similarDisplay.forEach((similar, i) => {
        if (typeof similar === 'object' && 'word' in similar) {
          const typedSimilar = similar as SimilarWord;
          console.log(`    ${i + 1}. ${typedSimilar.word}: ${typedSimilar.difference || ''}`);
          if (typedSimilar.difference_japanese) {
            console.log(`       → ${typedSimilar.difference_japanese}`);
          }
        } else {
          console.log(`    ${i + 1}. ${similar}`);
        }
      });
    } else if (similarDisplay !== 'N/A') {
      console.log(`  Similar Words: ${similarDisplay}`);
    }
  }
}