import { IsString, IsArray, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class TestCaseDto {
  @IsString()
  id: string;

  @IsString()
  type: 'mcq' | 'essay' | 'code';

  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  expectedAnswer?: string;

  @IsOptional()
  @IsString()
  rubric?: string;
}

export class CreateBatchDto {
  @IsString()
  batchName: string;

  @IsArray()
  @IsString({ each: true })
  providers: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  judgeProviders?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  tests: TestCaseDto[];
}