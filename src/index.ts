#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import { AnkiConnector } from './lib/ankiConnector';
import { VocabularyFetcher } from './lib/vocabularyFetcher';
import { InteractiveSession } from './lib/cli';
import { loadConfig, parseJapaneseMeanings, createAnkiFields } from './lib/utils';
import { CliOptions, WordInfo, AnkiAudioFile } from './types';

// Load environment variables from .env file
dotenv.config();

const program = new Command();

program
  .name('anki-ai-vocab')
  .description('Add English vocabulary to Anki deck with AI-generated definitions or delete existing cards')
  .version('1.0.0')
  .argument('[word]', 'The English word to add or delete (not required in interactive mode)')
  .option('--deck <name>', 'Anki deck name (overrides config)')
  .option('--model <name>', 'Anki note model name (overrides config)')
  .option('--no-audio', 'Disable automatic audio generation')
  .option('--voice <voice>', 'Amazon Polly voice (Joanna, Matthew, Amy, Brian, Mizuki, Takumi, etc.)', 'Matthew')
  .option('--japanese-meaning <meanings>', 'Specific Japanese meaning(s) for the word (comma-separated for multiple meanings)')
  .option('--delete', 'Delete cards containing the word instead of adding')
  .option('--config', 'Show configuration path')
  .option('-i, --interactive', 'Enter interactive mode for continuous word processing');

async function main(): Promise<void> {
  program.parse();
  const options = program.opts<Omit<CliOptions, 'word'>>();
  const word = program.args[0];

  if (options.config) {
    const configPath = path.join(os.homedir(), '.config', 'anki-vocab', 'config.json');
    console.log(`Configuration file location: ${configPath}`);
    return;
  }

  const config = loadConfig();
  const deckName = options.deck || config.deck_name;
  const modelName = options.model || config.model_name;

  // Handle interactive mode
  if (options.interactive) {
    const session = new InteractiveSession(
      config,
      deckName,
      modelName,
      options.voice || 'Matthew',
      options.noAudio || false
    );
    await session.start();
    return;
  }

  // Check if word is provided for non-interactive mode
  if (!word) {
    program.error('the following arguments are required: word (unless using --interactive mode)');
  }

  // TypeScript assertion since we've checked word exists
  const wordToProcess = word as string;

  try {
    const anki = new AnkiConnector(config.anki_host, config.anki_port);

    // Delete mode
    if (options.delete) {
      console.log(`Searching for cards containing '${wordToProcess}'...`);

      // Build search query - search in all fields and deck
      const query = `"${wordToProcess}" deck:"${deckName}"`;
      const noteIds = await anki.findNotes(query);

      if (noteIds.length === 0) {
        console.log(`No cards found containing '${wordToProcess}' in deck '${deckName}'`);
        process.exit(0);
      }

      // Get note information to show what will be deleted
      const notesInfo = await anki.notesInfo(noteIds);
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
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const confirm = await new Promise<string>((resolve) => {
        rl.question(`\nDelete ${noteIds.length} card(s)? (y/N): `, resolve);
      });
      rl.close();

      if (confirm.toLowerCase() === 'y') {
        await anki.deleteNotes(noteIds);
        console.log(`✓ Successfully deleted ${noteIds.length} card(s)`);
      } else {
        console.log('Deletion cancelled');
      }

      process.exit(0);
    }

    // Add mode (existing functionality)
    if (!config.openai_api_key) {
      console.log('Error: OpenAI API key not found. Please set OPENAI_API_KEY environment variable or add it to config.');
      process.exit(1);
    }

    console.log(`Fetching information for '${wordToProcess}'...`);

    // Check if model exists
    const availableModels = await anki.getModelNames();
    if (!availableModels.includes(modelName)) {
      console.log(`Error: Note type '${modelName}' not found in Anki.`);
      console.log('\nAvailable note types:');
      availableModels.forEach(model => {
        console.log(`  - ${model}`);
      });
      console.log(`\nYou can specify a different note type with --model "Note Type Name"`);
      console.log('Or update MODEL_NAME in your .env file');
      process.exit(1);
    }

    // Get field names for the model
    const fieldNames = await anki.getModelFieldNames(modelName);
    console.log(`\nUsing note type '${modelName}' with fields: ${fieldNames.join(', ')}`);

    const fetcher = new VocabularyFetcher(config.openai_api_key);
    
    // Check if specific Japanese meanings are provided
    let wordInfo: WordInfo;
    if (options.japaneseMeaning) {
      const japaneseMeanings = parseJapaneseMeanings(options.japaneseMeaning);
      if (japaneseMeanings.length > 0) {
        console.log(`Using specific Japanese meanings: ${japaneseMeanings.join(', ')}`);
        wordInfo = await fetcher.getWordInfoWithSpecificMeanings(wordToProcess, japaneseMeanings);
      } else {
        console.log('Warning: Invalid Japanese meanings provided, using default behavior');
        wordInfo = await fetcher.getWordInfo(wordToProcess);
      }
    } else {
      wordInfo = await fetcher.getWordInfo(wordToProcess);
    }

    console.log('\nWord information retrieved:');
    displayWordInfo(wordInfo);

    // Generate audio automatically (unless disabled)
    let audioFiles: AnkiAudioFile[] = [];
    let audioGenerated = false;
    
    if (!options.noAudio) {
      console.log(`\nGenerating audio with voice '${options.voice || 'Matthew'}'...`);
      try {
        const audioResult = await fetcher.generateAudioFiles(
          wordToProcess,
          wordInfo.example_sentence,
          options.voice || 'Matthew'
        );

        // Create safe filename (same as in createAnkiFields)
        const safeWord = wordToProcess.replace(/[ /\\]/g, '_');

        // Create audio files list
        audioFiles = [
          {
            filename: `word_${safeWord}.mp3`,
            data: audioResult.wordAudio,
            fields: fieldNames.length > 0 ? [fieldNames[0]!] : []
          }
        ];

        // Add separate audio file for each example sentence
        audioResult.exampleAudios.forEach(exampleAudio => {
          audioFiles.push({
            filename: `example_${safeWord}_${exampleAudio.index + 1}.mp3`,
            data: exampleAudio.audio,
            fields: fieldNames.length > 1 ? [fieldNames[1]!] : fieldNames
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

    console.log('\nAdding to Anki...');

    const fields = createAnkiFields(wordToProcess, wordInfo, fieldNames, audioFiles);

    // Debug: Show field contents
    Object.entries(fields).forEach(([fieldName, fieldContent]) => {
      if (fieldContent.includes('[sound:')) {
        console.log(`  Field '${fieldName}' contains audio tags`);
      }
    });

    const noteId = await anki.addNote(
      deckName,
      modelName,
      fields,
      ['english', 'vocabulary', 'ai-generated'],
      audioFiles
    );

    if (audioGenerated && audioFiles.length > 0) {
      console.log(`✓ Successfully added '${wordToProcess}' with audio to deck '${deckName}' (Note ID: ${noteId})`);
    } else {
      console.log(`✓ Successfully added '${wordToProcess}' to deck '${deckName}' (Note ID: ${noteId})`);
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

function displayWordInfo(wordInfo: WordInfo): void {
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
        console.log(`    ${i + 1}. ${idiom.english} - ${idiom.japanese}`);
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
        console.log(`    ${i + 1}. ${similar.word}: ${similar.difference || ''}`);
        if (similar.difference_japanese) {
          console.log(`       → ${similar.difference_japanese}`);
        }
      } else {
        console.log(`    ${i + 1}. ${similar}`);
      }
    });
  } else if (similarDisplay !== 'N/A') {
    console.log(`  Similar Words: ${similarDisplay}`);
  }
}

// Run main function
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}