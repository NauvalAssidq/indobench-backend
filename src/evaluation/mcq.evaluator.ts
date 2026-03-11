import { Injectable } from '@nestjs/common';
import { AgentResponse } from '../validation/agent-response.schema';

export interface McqResult {
    pass: boolean;
    score: number;
    choice: string | null;
    expectedAnswer: string;
    reason: string;
}

@Injectable()
export class McqEvaluator {
    /**
     * Deterministic rule-based evaluation. Never calls an LLM.
     */
    evaluate(agentResponse: AgentResponse, expectedAnswer: string): McqResult {
        const choice = agentResponse.choice;
        const pass = choice !== null && choice.toUpperCase() === expectedAnswer.toUpperCase();

        return {
            pass,
            score: pass ? 1 : 0,
            choice,
            expectedAnswer,
            reason: pass
                ? `Correct: agent chose "${choice}" which matches expected "${expectedAnswer}"`
                : `Wrong: agent chose "${choice ?? 'null'}", expected "${expectedAnswer}"`,
        };
    }
}
