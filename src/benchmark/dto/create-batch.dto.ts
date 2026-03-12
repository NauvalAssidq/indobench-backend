import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TestCaseDto {
  @IsString()
  id: string;

  @IsString()
  type: 'mcq' | 'essay';

  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  expectedAnswer?: string;

  @IsOptional()
  @IsString()
  rubric?: string;

  @IsOptional()
  choices?: Record<string, string>; // e.g. { A: "Bandung", B: "Jakarta" }
}

export class ProviderPriceDto {
  @IsOptional()
  inputPerMTok?: number;

  @IsOptional()
  outputPerMTok?: number;
}

export class CreateBatchDto {
  @IsString()
  batchName: string;

  @IsArray()
  @IsString({ each: true })
  providers: string[];

  @IsOptional()
  judgeProvider?: string | string[];

  @IsOptional()
  providerPrices?: Record<string, ProviderPriceDto>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  tests: TestCaseDto[];
}