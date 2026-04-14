import { Injectable } from '@nestjs/common';
import { JudgeService, JudgeResult } from './judge.service';
import { AgentResponse } from '../validation/agent-response.schema';

export interface EssayResult {
    pass: boolean;
    score: number;
    reason: string;
    judges: JudgeResult[];
}

@Injectable()
export class EssayEvaluator {
    constructor(private readonly judgeService: JudgeService) { }

    async evaluate(
        question: string,
        agentResponse: AgentResponse,
        rubric: string,
        judgeProviders: string[],
    ): Promise<EssayResult> {
        const results: JudgeResult[] = [];
        for (const provider of judgeProviders) {
            const result = await this.judgeService.judge(question, agentResponse.answer, rubric, provider);
            results.push(result);
        }

        const avgScore = results.reduce((sum, res) => sum + res.score, 0) / results.length;
        const reasons = results.map(r => `[${r.provider}]: ${r.reason}`).join('\n');

        return {
            pass: avgScore >= 0.5,
            score: avgScore,
            reason: reasons,
            judges: results,
        };
    }
}
