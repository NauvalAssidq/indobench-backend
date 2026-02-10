import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BenchmarkModule } from './benchmark/benchmark.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env',
    }),
    BenchmarkModule,
  ],
})
export class AppModule {}