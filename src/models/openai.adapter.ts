import OpenAI from 'openai';
import { ModelAdapter } from './model.interface';

export class OpenAIAdapter implements ModelAdapter {
    private readonly client: OpenAI;

    constructor(
        private readonly modelName: string,
        apiKey: string,
    ) {
        this.client = new OpenAI({ apiKey });
    }

    async call(systemPrompt: string, userPrompt: string): Promise<string> {
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
        return text;
    }
}
