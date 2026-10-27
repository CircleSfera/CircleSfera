import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { LiveRecordingModule } from './live-recording.module.js';
import { LiveRecordingService } from './live-recording.service.js';
import { LiveRecordingsController } from './live-recordings.controller.js';
import { LiveRecordingsService } from './live-recordings.service.js';

describe('LiveRecordingModule', () => {
  it('serves the recordings and lends the recorder to the live and staff modules', () => {
    expect(Reflect.getMetadata('controllers', LiveRecordingModule)).toEqual([
      LiveRecordingsController,
    ]);
    expect(Reflect.getMetadata('providers', LiveRecordingModule)).toEqual([
      LiveRecordingService,
      LiveRecordingsService,
    ]);
    expect(Reflect.getMetadata('exports', LiveRecordingModule)).toEqual([
      LiveRecordingService,
    ]);
  });
});
