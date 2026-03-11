import { Module } from '@nestjs/common';
import { BenchmarkController } from './benchmark.controller';
import { BenchmarkService } from './benchmark.service';
import { ModelFactory } from '../models/model.factory';
import { McqEvaluator } from '../evaluation/mcq.evaluator';
import { EssayEvaluator } from '../evaluation/essay.evaluator';
import { JudgeService } from '../evaluation/judge.service';

@Module({
  controllers: [BenchmarkController],
  providers: [
    BenchmarkService,
    ModelFactory,
    McqEvaluator,
    EssayEvaluator,
    JudgeService,
  ],
})
export class BenchmarkModule { }
