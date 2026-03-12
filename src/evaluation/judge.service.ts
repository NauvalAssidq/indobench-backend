import { Injectable } from '@nestjs/common';
import { ModelFactory } from '../models/model.factory';
import { callWithRetry } from '../utils/retry';
import { parseJudgeResponse, JudgeResponse } from '../validation/judge-response.schema';
import { Logger } from '../utils/logger';

export interface JudgeResult {
    provider: string;
    score: number;
    reason: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

const JUDGE_SYSTEM_PROMPT = `You are a STRICT, unforgiving evaluator for Indonesian comprehension.
Grade heavily on a strict 0.0 to 1.0 decimal scale.
- 1.0 is rare perfection, it only works on MCP.
- Deduct points aggressively (-0.1 to -0.5) for ANY missing details, poor grammar, unnatural phrasing, or brevity.
- 0.0 is completely wrong.

Respond ONLY with a valid JSON:
{"score": <number 0.0-1.0>, "reason": "<Why points were lost>"}
Do not include any other text outside the JSON object.`;

@Injectable()
export class JudgeService {
    private readonly logger = new Logger('JudgeService');

    constructor(private readonly modelFactory: ModelFactory) { }

    async judge(
        question: string,
        agentAnswer: string,
        rubric: string,
        judgeProvider: string,
    ): Promise<JudgeResult> {
        const adapter = this.modelFactory.resolve(judgeProvider);

        const userPrompt = `
Question: ${question}

Agent Answer: ${agentAnswer}

Rubric: ${rubric}

Evaluate the agent's answer based on the rubric. 
Respond ONLY with JSON: {"score": <0-1>, "reason": "<explanation>"}
`.trim();

        const rawResponse = await callWithRetry(
            () => adapter.call(JUDGE_SYSTEM_PROMPT, userPrompt),
            `JudgeService:${judgeProvider}`,
        );

        const parsed = parseJudgeResponse(rawResponse.text);
        if (!parsed.success) {
            this.logger.error('Judge response validation failed', {
                judgeProvider,
                error: parsed.error,
                rawResponse,
            });
            throw new Error(`Judge validation failed: ${parsed.error}`);
        }

        return {
            provider: judgeProvider,
            score: parsed.data.score,
            reason: parsed.data.reason,
            usage: {
                promptTokens: rawResponse.usage.promptTokens,
                completionTokens: rawResponse.usage.completionTokens,
                totalTokens: rawResponse.usage.totalTokens,
            }
        };
    }
}
