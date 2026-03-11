import { Injectable } from '@nestjs/common';
import { JudgeService } from './judge.service';
import { AgentResponse } from '../validation/agent-response.schema';

export interface EssayResult {
    pass: boolean;
    score: number;
    reason: string;
}

@Injectable()
export class EssayEvaluator {
    constructor(private readonly judgeService: JudgeService) { }

    async evaluate(
        question: string,
        agentResponse: AgentResponse,
        rubric: string,
        judgeProvider: string,
    ): Promise<EssayResult> {
        const judgeResult = await this.judgeService.judge(
            question,
            agentResponse.answer,
            rubric,
            judgeProvider,
        );

        return {
            pass: judgeResult.score >= 0.5,
            score: judgeResult.score,
            reason: judgeResult.reason,
        };
    }
}
