import OpenAI from 'openai';
import { ModelAdapter, ModelResponse } from './model.interface';

export class OpenAIAdapter implements ModelAdapter {
    private readonly client: OpenAI;

    constructor(
        private readonly modelName: string,
        apiKey: string,
    ) {
        this.client = new OpenAI({ apiKey });
    }

    async call(systemPrompt: string, userPrompt: string): Promise<ModelResponse> {
        const response = await this.client.chat.completions.create({
            model: this.modelName,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        });

        const text = response.choices[0]?.message?.content;
        if (!text) throw new Error('OpenAI returned empty content');

        const usage = response.usage;
        return {
            text,
            usage: {
                promptTokens: usage?.prompt_tokens ?? 0,
                completionTokens: usage?.completion_tokens ?? 0,
                totalTokens: usage?.total_tokens ?? 0,
            }
        };
    }
}
