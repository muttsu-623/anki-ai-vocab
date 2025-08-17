import {
  Engine,
  OutputFormat,
  PollyClient,
  SynthesizeSpeechCommand,
  VoiceId,
} from "@aws-sdk/client-polly";
import OpenAI from "openai";
import {
  AudioGenerationOptions,
  AudioGenerationResult,
  ExampleAudio,
  OpenAIError,
  PollyError,
  ExpressionInfo,
} from "../types";

export class VocabularyFetcher {
  private openaiClient: OpenAI;
  private pollyClient: PollyClient;

  constructor(apiKey: string) {
    this.openaiClient = new OpenAI({ apiKey });

    this.pollyClient = new PollyClient({
      region: process.env.AWS_DEFAULT_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  async getExpressionInfo(expression: string): Promise<ExpressionInfo> {
    const prompt = `
        Please provide the following information for the English expression "${expression}":
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
        6. Similar expressions and their differences (類似表現とその違い)
           Provide 2-3 expressions that are similar in meaning but have nuanced differences.
           Format as an array of objects with "expression", "difference" (in English), and "difference_japanese" keys.
           Example: [{"expression": "big", "difference": "more general term for large size", "difference_japanese": "サイズが大きいことを表す一般的な言葉"}]
           If no similar expressions exist, write "N/A"

        Format the response as JSON with these exact keys:
        - japanese_meaning (array of strings)
        - english_meaning (array of strings, EACH MUST START WITH [part of speech])
        - ipa (string)
        - idiom (array of objects with "english" and "japanese" keys, or "N/A" if none)
        - example_sentence (array of strings)
        - similar_expressions (array of objects with "expression", "difference", and "difference_japanese" keys, or "N/A" if none)

        Remember: Every item in english_meaning MUST begin with [noun], [verb], [adjective], [adverb], etc.
        `;

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful language teacher providing vocabulary information in JSON format. Always include parts of speech in square brackets [noun], [verb], [adjective], etc. at the beginning of each English definition.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new OpenAIError("No content received from OpenAI");
      }

      const data = JSON.parse(content) as ExpressionInfo;

      // Ensure english_meaning entries have parts of speech
      if (data.english_meaning && Array.isArray(data.english_meaning)) {
        data.english_meaning = this.processEnglishMeanings(
          data.english_meaning
        );
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new OpenAIError(
          `Error fetching expression information from OpenAI: ${error.message}`
        );
      }
      throw new OpenAIError(
        "Unknown error occurred while fetching expression information"
      );
    }
  }

  async getExpressionInfoWithSpecificMeanings(
    expression: string,
    japaneseMeanings: string[]
  ): Promise<ExpressionInfo> {
    const japaneseMeaningsStr = japaneseMeanings.join(", ");

    const prompt = `
        Please provide the following information for the English expression "${expression}" ONLY for these specific Japanese meanings: ${japaneseMeaningsStr}

        IMPORTANT CONSTRAINTS:
        1. Japanese meaning: Use ONLY the provided meanings: ${japaneseMeaningsStr}
        2. English definition: Provide ONLY English definitions that correspond to the specified Japanese meanings
           CRITICAL: Each English definition MUST start with the part of speech in square brackets.
           Format: "[part of speech] definition"
        3. IPA pronunciation (same as usual)
        4. Idioms: Skip idioms completely (return "N/A")
        5. Example sentences: Provide ONLY example sentences that use the expression in the context of the specified Japanese meanings
        6. Similar expressions: Provide ONLY expressions that are similar when used in the context of the specified Japanese meanings
           Format as an array of objects with "expression", "difference" (in English), and "difference_japanese" keys.

        Format the response as JSON with these exact keys:
        - japanese_meaning (array of strings - use ONLY the provided meanings)
        - english_meaning (array of strings, EACH MUST START WITH [part of speech])
        - ipa (string)
        - idiom (always "N/A")
        - example_sentence (array of strings - only for the specified meanings)
        - similar_expressions (array of objects with "expression", "difference", and "difference_japanese" keys, or "N/A" if none)

        Remember:
        - Every item in english_meaning MUST begin with [noun], [verb], [adjective], [adverb], etc.
        - Only include content relevant to the specified Japanese meanings: ${japaneseMeaningsStr}
        `;

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful language teacher providing vocabulary information in JSON format for specific meanings only. Always include parts of speech in square brackets [noun], [verb], [adjective], etc. at the beginning of each English definition. Only provide information relevant to the specified Japanese meanings.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new OpenAIError("No content received from OpenAI");
      }

      const data = JSON.parse(content) as ExpressionInfo;

      // Ensure japanese_meaning uses only the specified meanings
      data.japanese_meaning = japaneseMeanings;

      // Ensure english_meaning entries have parts of speech
      if (data.english_meaning && Array.isArray(data.english_meaning)) {
        data.english_meaning = this.processEnglishMeanings(
          data.english_meaning
        );
      }

      // Ensure idiom is always "N/A"
      data.idiom = "N/A";

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new OpenAIError(
          `Error fetching expression information with specific meanings from OpenAI: ${error.message}`
        );
      }
      throw new OpenAIError(
        "Unknown error occurred while fetching expression information"
      );
    }
  }

  private processEnglishMeanings(meanings: string[]): string[] {
    return meanings.map((meaning) => {
      // Check if it already has a part of speech tag
      if (meaning.startsWith("[")) {
        return meaning;
      }

      // Try to infer part of speech from the definition
      const meaningLower = meaning.toLowerCase();

      if (meaningLower.startsWith("to ") || meaningLower.startsWith("to be ")) {
        return `[verb] ${meaning}`;
      } else if (
        meaningLower.startsWith("a ") ||
        meaningLower.startsWith("an ") ||
        meaningLower.startsWith("the ")
      ) {
        return `[noun] ${meaning}`;
      } else if (
        [
          "having ",
          "being ",
          "showing ",
          "causing ",
          "pleasing ",
          "making ",
        ].some((w) => meaningLower.startsWith(w))
      ) {
        return `[adjective] ${meaning}`;
      } else if (
        [" act of ", " process of ", " state of ", " quality of "].some((w) =>
          meaningLower.includes(w)
        )
      ) {
        return `[noun] ${meaning}`;
      } else if (meaningLower.split(" ").pop()?.endsWith("ly")) {
        return `[adverb] ${meaning}`;
      } else {
        // For single expression, it's often an adjective
        if (
          meaning.split(" ").length <= 5 &&
          !meaning.includes(".") &&
          !meaning.includes(",") &&
          !meaning.includes(":") &&
          !meaning.includes(";")
        ) {
          return `[adjective] ${meaning}`;
        } else {
          return `[definition] ${meaning}`;
        }
      }
    });
  }

  async generateAudio(
    text: string,
    options: AudioGenerationOptions = {}
  ): Promise<Buffer> {
    const { voice = "Matthew", speed = 1.0 } = options;

    try {
      // Map speed to Polly's rate parameter (percentage)
      // OpenAI: 0.25-4.0, Polly: 20%-200%
      const pollyRate = Math.round(speed * 100);

      // Wrap text in SSML for speed control
      const ssmlText = `<speak><prosody rate="${pollyRate}%">${text}</prosody></speak>`;

      const command = new SynthesizeSpeechCommand({
        Text: ssmlText,
        TextType: "ssml",
        OutputFormat: OutputFormat.MP3,
        VoiceId: voice as VoiceId,
        Engine: Engine.NEURAL,
      });

      const response = await this.pollyClient.send(command);

      if (!response.AudioStream) {
        throw new PollyError("No audio stream received from Polly");
      }

      // Convert stream to buffer for Node.js environment
      const chunks: Buffer[] = [];
      const stream = response.AudioStream as NodeJS.ReadableStream;

      return new Promise<Buffer>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on("end", () => {
          resolve(Buffer.concat(chunks));
        });

        stream.on("error", (error) => {
          reject(error);
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new PollyError(
          `Error generating audio with Polly: ${error.message}`
        );
      }
      throw new PollyError("Unknown error occurred while generating audio");
    }
  }

  async generateAudioFiles(
    expression: string,
    exampleSentences: string | string[],
    voice: string = "Matthew"
  ): Promise<AudioGenerationResult> {
    try {
      // Generate audio for the expression (slower speed for clarity)
      const expressionAudioBuffer = await this.generateAudio(expression, {
        voice,
        speed: 0.9,
      });
      const expressionAudio = expressionAudioBuffer.toString("base64");

      // Generate audio for each example sentence separately
      const exampleAudios: ExampleAudio[] = [];

      // Handle both string and list input
      let sentences: string[] = [];
      if (typeof exampleSentences === "string") {
        if (exampleSentences.trim() && exampleSentences.trim() !== "N/A") {
          sentences = [exampleSentences.trim()];
        }
      } else if (Array.isArray(exampleSentences)) {
        sentences = exampleSentences.filter(
          (s) => s.trim() && s.trim() !== "N/A"
        );
      }

      // Generate audio for each sentence
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if (sentence) {
          const exampleAudioBuffer = await this.generateAudio(sentence, {
            voice,
            speed: 0.9,
          });
          const exampleAudio = exampleAudioBuffer.toString("base64");
          exampleAudios.push({
            index: i,
            sentence,
            audio: exampleAudio,
          });
        }
      }

      return {
        expressionAudio,
        exampleAudios,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new PollyError(`Error generating audio files: ${error.message}`);
      }
      throw new PollyError(
        "Unknown error occurred while generating audio files"
      );
    }
  }
}
