import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ModelFactory } from '../models/model.factory';
import { McqEvaluator } from '../evaluation/mcq.evaluator';
import { EssayEvaluator } from '../evaluation/essay.evaluator';
import { callWithRetry } from '../utils/retry';
import { parseAgentResponse } from '../validation/agent-response.schema';
import { Logger } from '../utils/logger';
import { CreateBatchDto, TestCaseDto } from './dto/create-batch.dto';
import pLimit from 'p-limit';

const MCQ_SYSTEM_PROMPT = `You are a professional exam-taker for Indonesian subjects.
TASK: Analyze the question and select the most accurate option.

OUTPUT FORMAT:
You must return a JSON object ONLY. No prose, no conversational filler.
JSON Schema:
{
    "thinking": "Your step-by-step reasoning or derivations (optional but recommended for math)",
    "answer": "A very brief explanation of why the choice is correct",
    "choice": "A/B/C/D/E"
}

CONSTRAINTS:
1. The "choice" field must be a single uppercase letter.
2. Put all reasoning inside the "thinking" field, not outside the JSON.
3. Your response MUST start EXACTLY with the '{' character. No pretext, no markdown code blocks, no explanations outside the JSON.
4. Shortest answer possible.`;

const ESSAY_SYSTEM_PROMPT = `You are answering an Indonesian language comprehension question.
You MUST respond with ONLY a valid JSON object in this exact format:
{"thinking": "Your step-by-step reasoning or derivations (optional)", "answer": "<your full answer in Indonesian>", "choice": null}

CONSTRAINTS:
1. Keep the "answer" concise (maximum 3 paragraphs).
2. Put all reasoning inside the "thinking" field, not outside the JSON.
3. Ensure the JSON string is properly closed.
4. The "choice" field MUST be null.
5. Your response MUST start EXACTLY with the '{' character. No pretext, no markdown code blocks, no text outside the JSON.`;

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger('BenchmarkService');

  constructor(
    private readonly modelFactory: ModelFactory,
    private readonly mcqEvaluator: McqEvaluator,
    private readonly essayEvaluator: EssayEvaluator,
  ) { }

  async runBatch(dto: CreateBatchDto) {
    if (!dto.tests || dto.tests.length === 0) {
      throw new BadRequestException('tests array must not be empty');
    }

    this.logger.info('Starting batch', {
      batchName: dto.batchName,
      providers: dto.providers,
      testCount: dto.tests.length,
    });

    let judgeProviders: string[] = ['google:gemini-1.5-flash-latest'];
    if (dto.judgeProvider) {
      judgeProviders = Array.isArray(dto.judgeProvider) ? dto.judgeProvider : [dto.judgeProvider];
    }


    const tasks: Array<{ testId: string; provider: string; promise: Promise<any> }> = [];

    const limit = pLimit(1);

    for (const test of dto.tests) {
      for (const provider of dto.providers) {
        tasks.push({
          testId: test.id,
          provider,
          promise: limit(() => this.runSingleEval(test, provider, judgeProviders, dto.providerPrices)),
        });
      }
    }

    const settled = await Promise.allSettled(tasks.map((t) => t.promise));

    const flatRows = settled.map((result, i) => {
      const { testId, provider } = tasks[i];
      if (result.status === 'fulfilled') return result.value;

      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      this.logger.error('Eval cell failed', { testId, provider, error: errorMsg });

      return {
        testId,
        provider,
        output: null,
        score: 0,
        pass: false,
        detail: { reason: errorMsg, choice: null, error: errorMsg },
        metrics: { cost: 0, latencyMs: 0, tokens: { total: 0, prompt: 0, completion: 0 } },
      };
    });

    const summary = this.calculateStats(flatRows);

    const nestedResults = dto.tests.map((test) => {
      const testResults = flatRows
        .filter(r => r.testId === test.id)
        .map(r => ({
          providerName: r.provider,
          output: r.output,
          score: r.score,
          pass: r.pass ?? false,
          choice: r.detail?.choice ?? null,
          reason: r.detail?.gradingReason ?? r.detail?.reason ?? null,
          error: r.detail?.error ?? null,
          metrics: r.metrics
        }));

      return {
        testId: test.id,
        type: test.type,
        question: test.question,
        expectedAnswer: test.expectedAnswer ?? null,
        rubric: test.rubric ?? null,
        providers: testResults
      };
    });

    return {
      batchName: dto.batchName,
      timestamp: new Date().toISOString(),
      summary,
      results: nestedResults,
    };
  }

  private async runSingleEval(
    test: TestCaseDto,
    providerString: string,
    judgeProviders: string[],
    providerPrices?: Record<string, { inputPerMTok?: number; outputPerMTok?: number }>,
  ): Promise<any> {
    const start = Date.now();

    const adapter = this.modelFactory.resolve(providerString);
    const systemPrompt = test.type === 'mcq' ? MCQ_SYSTEM_PROMPT : ESSAY_SYSTEM_PROMPT;

    const rawOutput = await callWithRetry(
      () => adapter.call(systemPrompt, test.question),
      `Agent:${providerString}:${test.id}`,
    );

    const latencyMs = Date.now() - start;

    const parsed = parseAgentResponse(rawOutput.text);
    if (!parsed.success) {
      this.logger.error(`Validation failed. Raw text:\n${rawOutput.text}`);
      throw new Error(`SCHEMA_VALIDATION_FAILED: ${parsed.error} | raw: ${rawOutput.text.slice(0, 500)}...`);
    }

    const agentResponse = parsed.data;

    let evalResult: { pass: boolean; score: number; reason: string; choice?: string | null; judges?: any[] };

    if (test.type === 'mcq') {
      if (!test.expectedAnswer) {
        throw new BadRequestException(`MCQ test "${test.id}" is missing expectedAnswer`);
      }
      const mcq = this.mcqEvaluator.evaluate(agentResponse, test.expectedAnswer);
      evalResult = { pass: mcq.pass, score: mcq.score, reason: mcq.reason, choice: mcq.choice };
    } else {
      const rubric = test.rubric ?? 'Score 0-1. Does the answer correctly address the question in Indonesian?';
      const essay = await this.essayEvaluator.evaluate(test.question, agentResponse, rubric, judgeProviders);
      evalResult = { pass: essay.pass, score: essay.score, reason: essay.reason, choice: null, judges: essay.judges };
    }

    // Cost Calculation Logic
    let cost = 0;
    const usage = rawOutput.usage;
    const pricing = providerPrices?.[providerString];

    let totalPromptTokens = usage.promptTokens;
    let totalCompletionTokens = usage.completionTokens;
    let totalTokens = usage.totalTokens;

    if (pricing) {
      const inputCost = (usage.promptTokens / 1_000_000) * (pricing.inputPerMTok ?? 0);
      const outputCost = (usage.completionTokens / 1_000_000) * (pricing.outputPerMTok ?? 0);
      cost += inputCost + outputCost;
    }

    if (test.type === 'essay' && evalResult.judges) {
      for (const judge of evalResult.judges) {
        const judgePricing = providerPrices?.[judge.provider];
        if (judgePricing) {
          const jInputCost = (judge.usage.promptTokens / 1_000_000) * (judgePricing.inputPerMTok ?? 0);
          const jOutputCost = (judge.usage.completionTokens / 1_000_000) * (judgePricing.outputPerMTok ?? 0);
          cost += jInputCost + jOutputCost;
        }
        totalPromptTokens += judge.usage.promptTokens;
        totalCompletionTokens += judge.usage.completionTokens;
        totalTokens += judge.usage.totalTokens;
      }
    }

    return {
      testId: test.id,
      provider: providerString,
      output: agentResponse.answer,
      score: evalResult.score,
      pass: evalResult.pass,
      detail: {
        gradingReason: evalResult.reason,
        choice: evalResult.choice ?? null,
        error: null,
      },
      metrics: {
        cost,
        latencyMs,
        tokens: {
          total: totalTokens,
          prompt: totalPromptTokens,
          completion: totalCompletionTokens
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Stats aggregation
  // ---------------------------------------------------------------------------

  private calculateStats(rows: any[]) {
    type ProviderStat = {
      totalCost: number;
      totalLatency: number;
      totalScore: number;
      count: number;
      passCount: number;
      errorCount: number;
    };

    const statsByProvider: Record<string, ProviderStat> = {};

    for (const row of rows) {
      const p = row.provider;
      if (!statsByProvider[p]) {
        statsByProvider[p] = { totalCost: 0, totalLatency: 0, totalScore: 0, count: 0, passCount: 0, errorCount: 0 };
      }
      statsByProvider[p].totalCost += row.metrics.cost;
      statsByProvider[p].totalLatency += row.metrics.latencyMs;
      statsByProvider[p].totalScore += row.score;
      statsByProvider[p].count += 1;
      if (row.pass) statsByProvider[p].passCount += 1;
      if (row.detail.error) statsByProvider[p].errorCount += 1;
    }

    let cheapest = { provider: 'None', cost: Infinity };
    let fastest = { provider: 'None', latency: Infinity };
    let smartest = { provider: 'None', score: -1 };

    const providerStats = Object.keys(statsByProvider).map((key) => {
      const d = statsByProvider[key];
      const avgLatency = d.count > 0 ? d.totalLatency / d.count : 0;
      const avgScore = d.count > 0 ? d.totalScore / d.count : 0;

      if (d.totalCost < cheapest.cost) cheapest = { provider: key, cost: d.totalCost };
      if (avgLatency < fastest.latency) fastest = { provider: key, latency: avgLatency };
      if (avgScore > smartest.score) smartest = { provider: key, score: avgScore };

      return {
        provider: key,
        totalTests: d.count,
        passCount: d.passCount,
        errorCount: d.errorCount,
        passRate: ((d.passCount / d.count) * 100).toFixed(1) + '%',
        errorRate: ((d.errorCount / d.count) * 100).toFixed(1) + '%',
        avgScore: (avgScore * 100).toFixed(1) + '%',
        totalCost: parseFloat(d.totalCost.toFixed(8)),
        avgLatencyMs: Math.round(avgLatency),
      };
    });

    return {
      totalTests: rows.length,
      providerStats,
      winners: {
        mostEfficient: cheapest.provider,
        cheapest: cheapest.provider,
        fastest: fastest.provider,
        highestQuality: smartest.provider,
      },
    };
  }
}