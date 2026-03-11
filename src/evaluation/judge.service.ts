import { Injectable } from '@nestjs/common';
import { ModelFactory } from '../models/model.factory';
import { callWithRetry } from '../utils/retry';
import { parseJudgeResponse, JudgeResponse } from '../validation/judge-response.schema';
import { Logger } from '../utils/logger';

export interface JudgeResult {
    score: number;
    reason: string;
}

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator assessing Indonesian language comprehension.
Respond ONLY with a valid JSON object in this exact format:
{"score": <number between 0 and 1>, "reason": "<brief explanation in English>"}
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

        const parsed = parseJudgeResponse(rawResponse);
        if (!parsed.success) {
            this.logger.error('Judge response validation failed', {
                judgeProvider,
                error: parsed.error,
                rawResponse,
            });
            throw new Error(`Judge validation failed: ${parsed.error}`);
        }

        return parsed.data;
    }
}
