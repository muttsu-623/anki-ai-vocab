// Configuration types
export interface Config {
  deck_name: string;
  model_name: string;
  openai_api_key: string;
  anki_host: string;
  anki_port: number;
}

// AnkiConnect API types
export interface AnkiConnectRequest {
  action: string;
  params: Record<string, unknown>;
  version: number;
}

export interface AnkiConnectResponse<T = unknown> {
  result: T;
  error: string | null;
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  options?: {
    allowDuplicate?: boolean;
    duplicateScope?: string;
  };
  tags?: string[];
  audio?: AnkiAudioFile[];
}

export interface AnkiAudioFile {
  filename: string;
  data: string; // base64 encoded
  fields: string[];
}

export interface AnkiNoteInfo {
  noteId: number;
  fields: Record<string, { value: string }>;
  modelName: string;
  tags: string[];
}

// Word information types
export interface WordIdiom {
  english: string;
  japanese: string;
}

export interface SimilarExpression {
  expression: string;
  difference: string;
  difference_japanese: string;
}

export interface Derivative {
  word: string;
  part_of_speech: string;
  meaning: string;
  japanese_meaning: string;
}

export interface ExpressionInfo {
  japanese_meaning: string[];
  english_meaning: string[];
  ipa: string;
  idiom: WordIdiom[] | "N/A";
  example_sentence: string[];
  similar_expressions: SimilarExpression[] | "N/A";
  derivatives: Derivative[] | "N/A";
}

// Audio generation types
export interface AudioGenerationOptions {
  voice?: string;
  speed?: number;
}

export interface ExampleAudio {
  index: number;
  sentence: string;
  audio: string; // base64 encoded
}

export interface AudioGenerationResult {
  expressionAudio: string; // base64 encoded
  exampleAudios: ExampleAudio[];
}

// CLI types
export interface CliOptions {
  expression?: string;
  deck?: string;
  model?: string;
  noAudio?: boolean;
  voice?: string;
  japaneseMeaning?: string;
  delete?: boolean;
  config?: boolean;
  interactive?: boolean;
}

// Error types
export class AnkiConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnkiConnectionError';
  }
}

export class OpenAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIError';
  }
}

export class PollyError extends Error {
  constructor(message: string) {
    super(message);
  }
}