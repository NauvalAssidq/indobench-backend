import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelAdapter } from './model.interface';
import { OpenAIAdapter } from './openai.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GeminiAdapter } from './gemini.adapter';

/**
 * Resolves a provider string like "openai:gpt-4o-mini" into the correct
 * ModelAdapter instance. Throws immediately if unknown — no silent fallthrough.
 */
@Injectable()
export class ModelFactory {
    constructor(private readonly config: ConfigService) { }

    resolve(providerString: string): ModelAdapter {
        const [vendor, ...rest] = providerString.split(':');
        const modelName = rest.join(':');

        if (!modelName) {
            throw new Error(`Invalid provider format "${providerString}". Use "vendor:model-name".`);
        }

        switch (vendor.toLowerCase()) {
            case 'openai': {
                const apiKey = this.config.get<string>('OPENAI_API_KEY');
                if (!apiKey) throw new Error('OPENAI_API_KEY is not set in environment');
                return new OpenAIAdapter(modelName, apiKey);
            }
            case 'anthropic': {
                const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
                if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in environment');
                return new AnthropicAdapter(modelName, apiKey);
            }
            case 'google': {
                const apiKey = this.config.get<string>('GOOGLE_API_KEY');
                if (!apiKey) throw new Error('GOOGLE_API_KEY is not set in environment');
                return new GeminiAdapter(modelName, apiKey);
            }
            default:
                throw new Error(
                    `Unknown provider vendor "${vendor}". Supported: openai, anthropic, google`,
                );
        }
    }
}
