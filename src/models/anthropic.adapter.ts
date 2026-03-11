import Anthropic from '@anthropic-ai/sdk';
import { ModelAdapter } from './model.interface';

export class AnthropicAdapter implements ModelAdapter {
    private readonly client: Anthropic;

    constructor(
        private readonly modelName: string,
        apiKey: string,
    ) {
        this.client = new Anthropic({ apiKey });
    }

    async call(systemPrompt: string, userPrompt: string): Promise<string> {
        const response = await this.client.messages.create({
            model: this.modelName,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        });

        const block = response.content[0];
        if (!block || block.type !== 'text') throw new Error('Anthropic returned no text block');
        return block.text;
    }
}
