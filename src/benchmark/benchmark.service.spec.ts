import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkService } from './benchmark.service';

describe('BenchmarkService', () => {
  let service: BenchmarkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BenchmarkService],
    }).compile();

    service = module.get<BenchmarkService>(BenchmarkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
