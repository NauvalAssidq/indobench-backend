import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ModelFactory } from '../models/model.factory';
import { McqEvaluator } from '../evaluation/mcq.evaluator';
import { EssayEvaluator } from '../evaluation/essay.evaluator';
import { callWithRetry } from '../utils/retry';
import { parseAgentResponse } from '../validation/agent-response.schema';
import { Logger } from '../utils/logger';
import { CreateBatchDto, TestCaseDto } from './dto/create-batch.dto';
import pLimit from 'p-limit';

const MCQ_SYSTEM_PROMPT = `You are taking a multiple choice test in Indonesian.
You MUST respond with ONLY a valid JSON object in this exact format:
{"answer": "<your explanation or the letter>", "choice": "<A, B, C, or D>"}
The "choice" field MUST be exactly one of: A, B, C, D.
Do not include any text outside the JSON object.`;

const ESSAY_SYSTEM_PROMPT = `You are answering an Indonesian language comprehension question.
You MUST respond with ONLY a valid JSON object in this exact format:
{"answer": "<your full answer in Indonesian>", "choice": null}
The "choice" field MUST be null for essay questions.
Do not include any text outside the JSON object.`;

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

    const judgeProvider = dto.judgeProvider ?? 'google:gemini-1.5-flash-latest';


    const tasks: Array<{ testId: string; provider: string; promise: Promise<any> }> = [];

    // Limit concurrent requests to avoid instantly hitting free-tier RPM/TPM limits
    const limit = pLimit(2);

    for (const test of dto.tests) {
      for (const provider of dto.providers) {
        tasks.push({
          testId: test.id,
          provider,
          promise: limit(() => this.runSingleEval(test, provider, judgeProvider)),
        });
      }
    }

    const settled = await Promise.allSettled(tasks.map((t) => t.promise));

    const rows = settled.map((result, i) => {
      const { testId, provider } = tasks[i];
      const test = dto.tests.find((t) => t.id === testId)!;

      if (result.status === 'fulfilled') {
        return result.value;
      }

      // Hard failure — surface the error explicitly, never silently zero
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      this.logger.error('Eval cell failed', { testId, provider, error: errorMsg });

      return {
        testId,
        question: test.question,
        type: test.type,
        expectedAnswer: test.expectedAnswer ?? null,
        provider,
        output: null,
        pass: false,
        score: 0,
        scorePercentage: '0.0%',
        detail: {
          gradingReason: errorMsg,
          choice: null,
          error: errorMsg,
        },
        metrics: { cost: 0, latencyMs: 0, tokens: { total: 0, prompt: 0, completion: 0 } },
      };
    });

    const summary = this.calculateStats(rows);
    const matrix = this.buildMatrix(rows, dto);

    return {
      batchName: dto.batchName,
      timestamp: new Date().toISOString(),
      summary,
      matrix,
      results: rows,
    };
  }

  private async runSingleEval(
    test: TestCaseDto,
    providerString: string,
    judgeProvider: string,
  ): Promise<any> {
    const start = Date.now();

    const adapter = this.modelFactory.resolve(providerString);
    const systemPrompt = test.type === 'mcq' ? MCQ_SYSTEM_PROMPT : ESSAY_SYSTEM_PROMPT;

    const rawOutput = await callWithRetry(
      () => adapter.call(systemPrompt, test.question),
      `Agent:${providerString}:${test.id}`,
    );

    const latencyMs = Date.now() - start;

    const parsed = parseAgentResponse(rawOutput);
    if (!parsed.success) {
      throw new Error(`SCHEMA_VALIDATION_FAILED: ${parsed.error} | raw: ${rawOutput.slice(0, 200)}`);
    }

    const agentResponse = parsed.data;

    let evalResult: { pass: boolean; score: number; reason: string; choice?: string | null };

    if (test.type === 'mcq') {
      if (!test.expectedAnswer) {
        throw new BadRequestException(`MCQ test "${test.id}" is missing expectedAnswer`);
      }
      const mcq = this.mcqEvaluator.evaluate(agentResponse, test.expectedAnswer);
      evalResult = { pass: mcq.pass, score: mcq.score, reason: mcq.reason, choice: mcq.choice };
    } else {
      const rubric = test.rubric ?? 'Score 0-1. Does the answer correctly address the question in Indonesian?';
      const essay = await this.essayEvaluator.evaluate(test.question, agentResponse, rubric, judgeProvider);
      evalResult = { pass: essay.pass, score: essay.score, reason: essay.reason, choice: null };
    }

    return {
      testId: test.id,
      question: test.question,
      type: test.type,
      expectedAnswer: test.expectedAnswer ?? null,
      provider: providerString,
      output: agentResponse.answer,
      pass: evalResult.pass,
      score: evalResult.score,
      scorePercentage: (evalResult.score * 100).toFixed(1) + '%',
      detail: {
        gradingReason: evalResult.reason,
        choice: evalResult.choice ?? null,
        error: null,
      },
      metrics: {
        cost: 0,
        latencyMs,
        tokens: { total: 0, prompt: 0, completion: 0 },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Matrix: tests (rows) × providers (columns)
  // ---------------------------------------------------------------------------

  private buildMatrix(rows: any[], dto: CreateBatchDto) {
    const providers = [...dto.providers];

    const cellMap: Record<string, Record<string, any>> = {};
    for (const row of rows) {
      if (!cellMap[row.testId]) cellMap[row.testId] = {};
      cellMap[row.testId][row.provider] = {
        pass: row.pass,
        score: row.score,
        scorePercentage: row.scorePercentage,
        output: row.output,
        choice: row.detail.choice,
        latencyMs: row.metrics.latencyMs,
        error: row.detail.error,
      };
    }

    const matrixRows = dto.tests.map((test) => {
      const providerCells: Record<string, any> = {};
      for (const provider of providers) {
        providerCells[provider] = cellMap[test.id]?.[provider] ?? {
          pass: null,
          score: null,
          scorePercentage: null,
          output: null,
          choice: null,
          latencyMs: null,
          error: 'Result missing',
        };
      }
      return {
        testId: test.id,
        type: test.type,
        question: test.question,
        expectedAnswer: test.expectedAnswer ?? null,
        providers: providerCells,
      };
    });

    return { providers, rows: matrixRows };
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
        fastest: fastest.provider,
        highestQuality: smartest.provider,
      },
    };
  }
}