
import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { CreateBatchDto } from './dto/create-batch.dto';

@Injectable()
export class BenchmarkService {

    async runBatch(dto: CreateBatchDto) {
        try {
            const { default: promptfoo } = await import('promptfoo');
            console.log(`Starting Batch: ${dto.batchName}...`);

            const judges = (dto.judgeProviders && dto.judgeProviders.length > 0)
                ? dto.judgeProviders
                : ['google:gemini-1.5-flash-latest'];

            const promptfooTests = dto.tests.map((test) => {
                const assertions: any[] = [];

                let instruction = '';

                if (test.type === 'mcq') {
                    if (!test.expectedAnswer) throw new BadRequestException(`Test ${test.id} missing expectedAnswer`);
                    instruction = 'You are taking a multiple choice test. Answer directly with only the option letter (A, B, C, or D). Do not explain.';
                    assertions.push({
                        type: 'icontains',
                        value: test.expectedAnswer,
                    });
                } else {
                    instruction = 'Answer the following question clearly and accurately.';
                    judges.forEach(judge => {
                        assertions.push({
                            type: 'llm-rubric',
                            value: test.rubric || 'Ensure the answer is accurate.',
                            provider: judge
                        });
                    });
                }

                return {
                    vars: { question: test.question, id: test.id, type: test.type, instruction },
                    assert: assertions,
                };
            });

            const results = await promptfoo.evaluate({
                prompts: [`{{instruction}}\n\n{{question}}`],
                providers: dto.providers,
                tests: promptfooTests,
            }, {
                maxConcurrency: 1, // Reduced concurrency to diagnose potential race conditions
                cache: false
            });

            return this.cleanResults(results, dto);

        } catch (error) {
            console.error('CRITICAL BENCHMARK ERROR:', error);
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException('Failed to run benchmark');
        }
    }

    private cleanResults(raw: any, dto: CreateBatchDto) {
        if (!raw || !raw.results) return { status: "FAILED", error: "No results" };

        const rows = raw.results.map((r: any, index: number) => {
            const providerCount = dto.providers.length;
            const testIndex = Math.floor(index / providerCount);
            const originalTest = dto.tests[testIndex] || dto.tests.find(t => t.id === r.vars?.id);

            const tokens = r.response?.tokenUsage?.total || 0;
            const promptTokens = r.response?.tokenUsage?.prompt || 0;
            const completionTokens = r.response?.tokenUsage?.completion || 0;
            let cost = r.response?.cost || 0;

            if (cost === 0 && tokens > 0) {
                cost = (promptTokens * 0.00000015) + (completionTokens * 0.0000006);
            }

            const errorMsg = r.error ? r.error.message : (r.response?.error || null);

            return {
                testId: originalTest ? originalTest.id : 'unknown',
                question: originalTest ? originalTest.question : 'unknown',
                type: originalTest ? originalTest.type : 'unknown',
                provider: r.provider ? r.provider.id : 'unknown',
                output: errorMsg ? `ERROR: ${errorMsg}` : (r.response?.output || "No Output"),

                pass: r.success,
                score: r.score || 0,
                scorePercentage: ((r.score || 0) * 100).toFixed(1) + '%',

                metrics: {
                    cost: parseFloat(cost.toFixed(8)),
                    latencyMs: r.latencyMs || r.response?.latencyMs || 0,
                    tokens: tokens
                },
                gradingLog: errorMsg || r.gradingResult?.reason || 'Done'
            };
        });

        const summary = this.calculateStats(rows);

        return {
            batchName: dto.batchName,
            timestamp: new Date().toISOString(),
            summary: summary,
            results: rows
        };
    }

    private calculateStats(rows: any[]) {
        const statsByProvider: any = {};

        rows.forEach(row => {
            const p = row.provider;
            if (!statsByProvider[p]) {
                statsByProvider[p] = { totalCost: 0, totalLatency: 0, totalScore: 0, count: 0, passCount: 0 };
            }
            statsByProvider[p].totalCost += row.metrics.cost;
            statsByProvider[p].totalLatency += row.metrics.latencyMs;
            statsByProvider[p].totalScore += row.score;
            statsByProvider[p].count += 1;
            if (row.pass) statsByProvider[p].passCount += 1;
        });

        let cheapest = { provider: 'None', cost: Infinity };
        let fastest = { provider: 'None', latency: Infinity };
        let smartest = { provider: 'None', score: -1 };

        const providerStats = Object.keys(statsByProvider).map(key => {
            const data = statsByProvider[key];
            const avgLatency = data.totalLatency / data.count;
            const avgScore = data.totalScore / data.count;

            if (data.totalCost < cheapest.cost) cheapest = { provider: key, cost: data.totalCost };
            if (avgLatency < fastest.latency) fastest = { provider: key, latency: avgLatency };
            if (avgScore > smartest.score) smartest = { provider: key, score: avgScore };

            return {
                provider: key,
                totalCost: parseFloat(data.totalCost.toFixed(8)),
                avgLatencyMs: Math.round(avgLatency),
                avgScorePct: (avgScore * 100).toFixed(1) + '%',
                passRate: ((data.passCount / data.count) * 100).toFixed(1) + '%'
            };
        });

        return {
            totalTests: rows.length,
            providerStats: providerStats,
            winners: {
                mostEfficient: cheapest.provider,
                fastest: fastest.provider,
                highestQuality: smartest.provider
            }
        };
    }
}