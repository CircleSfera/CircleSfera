import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateReportDto } from './create-report.dto.js';

const check = async (body: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(CreateReportDto, {
        targetType: 'POST',
        targetId: 'p-1',
        ...body,
      }),
    )
  ).map((e) => e.property);

describe('CreateReportDto: intellectual property', () => {
  it('asks who holds the right and the work concerned', async () => {
    expect(await check({ reason: 'INTELLECTUAL_PROPERTY' })).toEqual([
      'rightsHolder',
      'workConcerned',
    ]);
    expect(
      await check({
        reason: 'INTELLECTUAL_PROPERTY',
        rightsHolder: '   ',
        workConcerned: 'My photo',
      }),
    ).toEqual(['rightsHolder']);
    expect(
      await check({
        reason: 'INTELLECTUAL_PROPERTY',
        rightsHolder: 'Ana Ruiz',
        workConcerned: 'My photo',
      }),
    ).toEqual([]);
  });

  it('keeps each within its length', async () => {
    expect(
      await check({
        reason: 'INTELLECTUAL_PROPERTY',
        rightsHolder: 'a'.repeat(201),
        workConcerned: 'w'.repeat(501),
      }),
    ).toEqual(['rightsHolder', 'workConcerned']);
  });

  it('other reasons need neither', async () => {
    expect(await check({ reason: 'SELF_HARM' })).toEqual([]);
  });
});
