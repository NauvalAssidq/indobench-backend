import { Module } from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';
import { BenchmarkController } from './benchmark.controller';

@Module({
  providers: [BenchmarkService],
  controllers: [BenchmarkController]
})
export class BenchmarkModule {}
