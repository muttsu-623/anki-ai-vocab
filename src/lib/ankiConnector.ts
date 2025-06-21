import axios, { AxiosResponse } from 'axios';
import {
  AnkiConnectRequest,
  AnkiConnectResponse,
  AnkiNote,
  AnkiNoteInfo,
  AnkiAudioFile,
  AnkiConnectionError
} from '../types';

export class AnkiConnector {
  private url: string;

  constructor(host: string = 'localhost', port: number = 8765) {
    this.url = `http://${host}:${port}`;
  }

  private createRequest(action: string, params: Record<string, unknown> = {}): AnkiConnectRequest {
    return {
      action,
      params,
      version: 6
    };
  }

  private async invoke<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const request = this.createRequest(action, params);

    try {
      const response: AxiosResponse<AnkiConnectResponse<T>> = await axios.post(this.url, request);
      const data = response.data;

      if (!data || typeof data !== 'object') {
        throw new AnkiConnectionError('Response has an unexpected format');
      }

      if (!('error' in data)) {
        throw new AnkiConnectionError('Response is missing required error field');
      }

      if (!('result' in data)) {
        throw new AnkiConnectionError('Response is missing required result field');
      }

      if (data.error !== null) {
        throw new AnkiConnectionError(data.error);
      }

      return data.result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new AnkiConnectionError(
          `Cannot connect to Anki. Make sure Anki is running with AnkiConnect installed. Error: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getModelNames(): Promise<string[]> {
    return this.invoke<string[]>('modelNames');
  }

  async getModelFieldNames(modelName: string): Promise<string[]> {
    return this.invoke<string[]>('modelFieldNames', { modelName });
  }

  async getDeckNames(): Promise<string[]> {
    return this.invoke<string[]>('deckNames');
  }

  async createDeck(deckName: string): Promise<number> {
    return this.invoke<number>('createDeck', { deck: deckName });
  }

  async findNotes(query: string): Promise<number[]> {
    return this.invoke<number[]>('findNotes', { query });
  }

  async notesInfo(noteIds: number[]): Promise<AnkiNoteInfo[]> {
    return this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: noteIds });
  }

  async deleteNotes(noteIds: number[]): Promise<void> {
    await this.invoke<void>('deleteNotes', { notes: noteIds });
  }

  async addNote(
    deckName: string,
    modelName: string,
    fields: Record<string, string>,
    tags: string[] = [],
    audio: AnkiAudioFile[] = []
  ): Promise<number> {
    // Check if deck exists and create if needed
    const existingDecks = await this.getDeckNames();
    if (!existingDecks.includes(deckName)) {
      console.log(`Creating new deck: ${deckName}`);
      await this.createDeck(deckName);
    }

    const note: AnkiNote = {
      deckName,
      modelName,
      fields,
      options: {
        allowDuplicate: false,
        duplicateScope: 'deck'
      }
    };

    if (tags.length > 0) {
      note.tags = tags;
    }

    if (audio.length > 0) {
      note.audio = audio;
      console.log(`  Attaching ${audio.length} audio files to note`);
    }

    return this.invoke<number>('addNote', { note });
  }
}