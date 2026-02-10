import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { BenchmarkService } from './../src/benchmark/benchmark.service';

describe('BenchmarkController (e2e)', () => {
    let app: INestApplication;
    let benchmarkService = { runBatch: jest.fn() };

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(BenchmarkService)
            .useValue(benchmarkService)
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
    });

    it('/benchmark/run (POST) - validation error (missing expectedAnswer for MCQ)', async () => {
        // Re-implement the original service method for this test to trigger the internal validation logic 
        // or we use the real service but mock the promptfoo call?
        // Actually, simpler to test validation pipe here for DTO, and simple service logic unit test for the runtime checks.
        // But user asked for "check the code". E2E is good for DTO validation check.

        // Let's test DTO validation first.
        return request(app.getHttpServer())
            .post('/benchmark/run')
            .send({
                batchName: 'Test Batch',
                providers: ['openai:gpt-4o'],
                tests: [
                    {
                        id: 'test-1',
                        type: 'mcq',
                        // question missing
                    }
                ]
            })
            .expect(400);
    });

    it('/benchmark/run (POST) - success multi-judge', async () => {
        benchmarkService.runBatch.mockResolvedValue({});

        return request(app.getHttpServer())
            .post('/benchmark/run')
            .send({
                batchName: 'Thesis Final Run - Multi-Judge',
                providers: ['google:gemini-3-flash-preview', 'openai:gpt-4o'],
                judgeProviders: ['google:gemini-1.5-flash-latest', 'openai:gpt-4o'],
                tests: [
                    {
                        id: 'e1',
                        type: 'essay',
                        question: 'Jelaskan strategi marketing untuk Gen Z.',
                        rubric: 'Harus menyebutkan TikTok dan autentisitas.'
                    }
                ]
            })
            .expect(201);
    });
});
