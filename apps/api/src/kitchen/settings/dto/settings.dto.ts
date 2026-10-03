import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_CUTOFF_WORKING_DAYS,
  MIN_CUTOFF_WORKING_DAYS,
} from '../../cutoff/cutoff-calculator.js';
import { WEEKDAYS, type Weekday } from '../../time/weekday.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateSettingsDto {
  @ApiProperty({ example: '16:00', description: 'Local cutoff time (HH:mm)' })
  @Matches(TIME_PATTERN, { message: 'cutoffTime must be in HH:mm format' })
  cutoffTime!: string;

  @ApiProperty({
    example: 2,
    minimum: MIN_CUTOFF_WORKING_DAYS,
    maximum: MAX_CUTOFF_WORKING_DAYS,
  })
  @IsInt()
  @Min(MIN_CUTOFF_WORKING_DAYS)
  @Max(MAX_CUTOFF_WORKING_DAYS)
  cutoffWorkingDays!: number;

  @ApiProperty({ enum: WEEKDAYS, isArray: true })
  @IsArray()
  @ArrayNotEmpty({ message: 'the kitchen must work at least one weekday' })
  @IsIn(WEEKDAYS, { each: true })
  workingDays!: Weekday[];
}

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-12-25' })
  @Matches(DATE_PATTERN, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;

  @ApiPropertyOptional({ example: 'Christmas' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class SettingsResponse {
  @ApiProperty({ example: '16:00' })
  cutoffTime!: string;

  @ApiProperty({ example: 2 })
  cutoffWorkingDays!: number;

  @ApiProperty({ enum: WEEKDAYS, isArray: true })
  workingDays!: Weekday[];

  @ApiProperty({ example: 'Asia/Kolkata' })
  timeZone!: string;

  @ApiProperty({ example: 14 })
  maxCutoffWorkingDays!: number;

  @ApiProperty()
  updatedAt!: Date;
}

export class HolidayResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '2026-12-25' })
  date!: string;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;
}
