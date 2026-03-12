import { GoogleGenAI } from '@google/genai';
import { ModelAdapter, ModelResponse } from './model.interface';

export class GeminiAdapter implements ModelAdapter {
    private readonly client: GoogleGenAI;

    constructor(
        private readonly modelName: string,
        apiKey: string,
    ) {
        this.client = new GoogleGenAI({ apiKey });
    }

    async call(systemPrompt: string, userPrompt: string): Promise<ModelResponse> {
        const response = await this.client.models.generateContent({
            model: this.modelName,
            contents: userPrompt,
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
            },
        });

        const text = response.text;
        if (!text) throw new Error('Gemini returned empty content');

        const usage = response.usageMetadata;
        return {
            text,
            usage: {
                promptTokens: usage?.promptTokenCount ?? 0,
                completionTokens: usage?.candidatesTokenCount ?? 0,
                totalTokens: usage?.totalTokenCount ?? 0,
            }
        };
    }
}
