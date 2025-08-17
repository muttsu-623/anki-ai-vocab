#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { VocabularyFetcher } from '../lib/vocabularyFetcher';

// Load environment variables
dotenv.config();

async function testPolly(): Promise<void> {
  console.log('Testing AWS Polly TTS...');
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not found in environment variables');
    process.exit(1);
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('Error: AWS credentials not found in environment variables');
    process.exit(1);
  }

  try {
    const fetcher = new VocabularyFetcher(process.env.OPENAI_API_KEY);
    
    console.log('Testing basic text synthesis...');
    const audioBuffer = await fetcher.generateAudio('Hello, this is a test of AWS Polly text-to-speech.');
    console.log(`✓ Successfully generated audio: ${audioBuffer.length} bytes`);
    
    console.log('Testing with different voice...');
    const audioBuffer2 = await fetcher.generateAudio('Testing with a different voice.', { voice: 'Joanna' });
    console.log(`✓ Successfully generated audio with Joanna voice: ${audioBuffer2.length} bytes`);
    
    console.log('Testing audio files generation...');
    const result = await fetcher.generateAudioFiles(
      'sophisticated',
      ['This is a sophisticated approach to the problem.', 'She has a sophisticated taste in art.'],
      'Matthew'
    );
    
    console.log(`✓ Word audio: ${result.expressionAudio.length} chars (base64)`);
    console.log(`✓ Example audios: ${result.exampleAudios.length} files`);
    result.exampleAudios.forEach((audio, i) => {
      console.log(`  - Example ${i + 1}: "${audio.sentence}" (${audio.audio.length} chars base64)`);
    });
    
    console.log('\n✓ All AWS Polly tests passed!');
  } catch (error) {
    console.error('Error testing AWS Polly:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testPolly();
}