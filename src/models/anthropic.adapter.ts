import Anthropic from '@anthropic-ai/sdk';
import { ModelAdapter, ModelResponse } from './model.interface';

export class AnthropicAdapter implements ModelAdapter {
    private readonly client: Anthropic;

    constructor(
        private readonly modelName: string,
        apiKey: string,
    ) {
        this.client = new Anthropic({ apiKey });
    }

    async call(systemPrompt: string, userPrompt: string): Promise<ModelResponse> {
        const response = await this.client.messages.create({
            model: this.modelName,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        });

        const block = response.content[0];
        if (!block || block.type !== 'text') throw new Error('Anthropic returned no text block');

        const usage = response.usage;
        return {
            text: block.text,
            usage: {
                promptTokens: usage?.input_tokens ?? 0,
                completionTokens: usage?.output_tokens ?? 0,
                totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
            }
        };
    }
}
