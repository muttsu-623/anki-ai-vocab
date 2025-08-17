import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ExpressionInfo, AnkiAudioFile, WordIdiom, SimilarExpression, Derivative } from '../types';

export function parseJapaneseMeanings(meaningsStr: string): string[] {
  if (!meaningsStr?.trim()) {
    return [];
  }
  
  // Split by comma and clean up each meaning
  const meanings = meaningsStr.split(',').map(meaning => meaning.trim());
  // Remove empty strings
  return meanings.filter(meaning => meaning.length > 0);
}

export function loadConfig(): Config {
  const configPath = path.join(os.homedir(), '.config', 'anki-vocab', 'config.json');

  // Default configuration with environment variable support
  const defaultConfig: Config = {
    deck_name: process.env.DECK_NAME || 'English Vocabulary',
    model_name: process.env.MODEL_NAME || 'Basic (and reversed card)',
    openai_api_key: process.env.OPENAI_API_KEY || '',
    anki_host: process.env.ANKI_HOST || 'localhost',
    anki_port: parseInt(process.env.ANKI_PORT || '8765', 10)
  };

  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    // Load from config file and override with environment variables
    const fileConfigRaw = fs.readFileSync(configPath, 'utf8');
    const fileConfig = JSON.parse(fileConfigRaw) as Partial<Config>;

    // Environment variables take precedence
    const config: Config = { ...fileConfig } as Config;
    
    if (process.env.DECK_NAME) config.deck_name = process.env.DECK_NAME;
    if (process.env.MODEL_NAME) config.model_name = process.env.MODEL_NAME;
    if (process.env.OPENAI_API_KEY) config.openai_api_key = process.env.OPENAI_API_KEY;
    if (process.env.ANKI_HOST) config.anki_host = process.env.ANKI_HOST;
    if (process.env.ANKI_PORT) config.anki_port = parseInt(process.env.ANKI_PORT, 10);

    return config;
  } catch (error) {
    console.warn(`Warning: Could not load config file ${configPath}, using defaults`);
    return defaultConfig;
  }
}

export function createAnkiFields(
  expression: string,
  expressionInfo: ExpressionInfo,
  fieldNames: string[],
  audioFiles: AnkiAudioFile[] = []
): Record<string, string> {
  // Create safe filename (replace spaces and special chars)
  const safeExpression = expression.replace(/[ /\\]/g, '_');

  // Front field: Expression with pronunciation and audio
  // Find expression audio file
  let expressionAudioTag = '';
  if (audioFiles.length > 0) {
    const expressionAudioFile = audioFiles.find(af => af.filename.startsWith(`expression_${safeExpression}`));
    if (expressionAudioFile) {
      expressionAudioTag = ` [sound:${expressionAudioFile.filename}]`;
    }
  }

  const front = `
    <div style="font-size: 24px; font-weight: bold;">${expression}${expressionAudioTag}</div>
    <div style="font-size: 18px; color: #666;">${expressionInfo.ipa || ''}</div>
    `;

  // Handle English meanings (list or string)
  const englishContent = expressionInfo.english_meaning;
  let englishHtml: string;
  if (Array.isArray(englishContent)) {
    englishHtml = '<ul style="margin: 5px 0; padding-left: 20px;">' + 
      englishContent.map(meaning => `<li>${meaning}</li>`).join('') + 
      '</ul>';
  } else {
    englishHtml = englishContent;
  }

  // Back field: Meanings without expression audio
  let back = `
    <div style="margin-bottom: 15px;">
        <strong>English:</strong> ${englishHtml}
    </div>
    `;

  // Handle both string and list for example_sentence in HTML
  const exampleContent = expressionInfo.example_sentence;

  // Find example audio files
  const exampleAudioFiles = audioFiles
    .filter(af => af.filename.startsWith(`example_${safeExpression}_`))
    .sort((a, b) => a.filename.localeCompare(b.filename));

  let exampleHtml: string;
  if (Array.isArray(exampleContent)) {
    const exampleItems = exampleContent.map((example, i) => {
      // Add audio button if corresponding audio file exists
      let audioTag = '';
      if (i < exampleAudioFiles.length) {
        const audioFilename = exampleAudioFiles[i]?.filename;
        if (audioFilename) {
          audioTag = ` [sound:${audioFilename}]`;
        }
      }
      return `<li>${example}${audioTag}</li>`;
    });
    exampleHtml = '<ul style="margin: 5px 0; padding-left: 20px;">' + exampleItems.join('') + '</ul>';
  } else {
    // Single example sentence
    let audioTag = '';
    if (exampleAudioFiles.length > 0) {
      const audioFilename = exampleAudioFiles[0]?.filename;
      if (audioFilename) {
        audioTag = ` [sound:${audioFilename}]`;
      }
    }
    exampleHtml = `${exampleContent}${audioTag}`;
  }

  back += `
    <div style="margin-bottom: 15px; margin-top: 20px; padding: 10px; background-color: #f0f0f0; border-radius: 5px;">
        <strong>Example:</strong> ${exampleHtml}
    </div>
    `;

  // Divider between English and Japanese meanings
  back += `
    <hr style="margin: 20px 0; border: 1px solid #ccc;">
    `;

  // Handle Japanese meanings (list or string)
  const japaneseContent = expressionInfo.japanese_meaning;
  let japaneseHtml: string;
  if (Array.isArray(japaneseContent)) {
    japaneseHtml = '<ul style="margin: 5px 0; padding-left: 20px;">' + 
      japaneseContent.map(meaning => `<li>${meaning}</li>`).join('') + 
      '</ul>';
  } else {
    japaneseHtml = japaneseContent;
  }

  back += `
    <div style="margin-bottom: 15px;">
        <strong>Japanese:</strong> ${japaneseHtml}
    </div>
    `;

  // Handle idioms (list or string)
  if (expressionInfo.idiom && expressionInfo.idiom !== 'N/A') {
    const idiomContent = expressionInfo.idiom;
    let idiomHtml: string;
    
    if (Array.isArray(idiomContent)) {
      const idiomItems = idiomContent.map(idiom => {
        if (typeof idiom === 'object' && 'english' in idiom && 'japanese' in idiom) {
          const typedIdiom = idiom as WordIdiom;
          return `<li>${typedIdiom.english}<br><span style='color: #666; margin-left: 20px;'>→ ${typedIdiom.japanese}</span></li>`;
        } else {
          return `<li>${idiom}</li>`;
        }
      });
      idiomHtml = '<ul style="margin: 5px 0; padding-left: 20px;">' + idiomItems.join('') + '</ul>';
    } else {
      idiomHtml = idiomContent;
    }

    back += `
        <div style="margin-bottom: 15px;">
            <strong>Idiom/Phrase:</strong> ${idiomHtml}
        </div>
        `;
  }

  // Handle derivatives (list or string)
  if (expressionInfo.derivatives && expressionInfo.derivatives !== 'N/A') {
    const derivativeContent = expressionInfo.derivatives;
    let derivativeHtml: string;
    
    if (Array.isArray(derivativeContent)) {
      const derivativeItems = derivativeContent.map(derivative => {
        if (typeof derivative === 'object' && 'word' in derivative) {
          const typedDerivative = derivative as Derivative;
          const partOfSpeech = typedDerivative.part_of_speech || '';
          const meaning = typedDerivative.meaning || '';
          const japaneseMeaning = typedDerivative.japanese_meaning || '';
          return `<li><strong>${typedDerivative.word}</strong> [${partOfSpeech}]: ${meaning}<br>` +
                 `<span style='color: #666; margin-left: 20px;'>→ ${japaneseMeaning}</span></li>`;
        } else {
          return `<li>${derivative}</li>`;
        }
      });
      derivativeHtml = '<ul style="margin: 5px 0; padding-left: 20px;">' + derivativeItems.join('') + '</ul>';
    } else {
      derivativeHtml = derivativeContent;
    }

    back += `
        <div style="margin-bottom: 15px; margin-top: 20px; padding: 10px; background-color: #fff5f5; border-radius: 5px; border: 1px solid #ffe0e0;">
            <strong>Derivatives:</strong> ${derivativeHtml}
        </div>
        `;
  }

  // Handle similar expressions (list or string)
  if (expressionInfo.similar_expressions && expressionInfo.similar_expressions !== 'N/A') {
    const similarContent = expressionInfo.similar_expressions;
    let similarHtml: string;
    
    if (Array.isArray(similarContent)) {
      const similarItems = similarContent.map(similar => {
        if (typeof similar === 'object' && 'expression' in similar) {
          const typedSimilar = similar as SimilarExpression;
          const difference = typedSimilar.difference || '';
          const differenceJp = typedSimilar.difference_japanese || '';
          return `<li><strong>${typedSimilar.expression}</strong>: ${difference}<br>` +
                 `<span style='color: #666; margin-left: 20px;'>→ ${differenceJp}</span></li>`;
        } else {
          return `<li>${similar}</li>`;
        }
      });
      similarHtml = '<ul style="margin: 5px 0; padding-left: 20px;">' + similarItems.join('') + '</ul>';
    } else {
      similarHtml = similarContent;
    }

    back += `
        <div style="margin-bottom: 15px; margin-top: 20px; padding: 10px; background-color: #f9f9f9; border-radius: 5px; border: 1px solid #e0e0e0;">
            <strong>Similar Expressions & Differences:</strong> ${similarHtml}
        </div>
        `;
  }


  // Map to actual field names
  const fields: Record<string, string> = {};

  // Common field name patterns
  if (fieldNames.length >= 2) {
    // Try to identify front and back fields
    let frontField: string | undefined;
    let backField: string | undefined;

    for (const field of fieldNames) {
      const fieldLower = field.toLowerCase();
      if (['front', 'question', 'text1', 'expression', 'word'].some(x => fieldLower.includes(x))) {
        frontField = field;
      } else if (['back', 'answer', 'text2', 'meaning', 'definition'].some(x => fieldLower.includes(x))) {
        backField = field;
      }
    }

    // If not found by name, use first two fields
    if (!frontField) {
      frontField = fieldNames[0];
    }
    if (!backField) {
      backField = fieldNames.length > 1 ? fieldNames[1] : fieldNames[0];
    }

    if (frontField) {
      fields[frontField] = front;
    }
    if (backField && backField !== frontField) {
      fields[backField] = back;
    }
  } else {
    // Single field note type
    const fieldName = fieldNames[0];
    if (fieldName) {
      fields[fieldName] = front + '\n' + back;
    }
  }

  return fields;
}