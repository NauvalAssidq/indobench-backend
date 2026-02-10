import { Controller, Post, Body } from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';
import { CreateBatchDto } from './dto/create-batch.dto';

@Controller('benchmark')
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Post('run')
  async runBatch(@Body() createBatchDto: CreateBatchDto) {
    return await this.benchmarkService.runBatch(createBatchDto);
  }
}