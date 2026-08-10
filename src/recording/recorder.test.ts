/**
 * Tests the cold-start robustness of ChunkedRecorder.start(): the real bug was
 * that a failed first attempt left a native recorder holding the mic, so the
 * retry failed too and the very first visit never recorded. We mock expo-audio
 * to simulate a mic that fails the first prepare, and assert we release the dead
 * recorder before retrying and ultimately succeed.
 */
const mockState = {
  prepFailsRemaining: 0,
  created: 0,
  released: 0,
  prepared: 0,
  recorded: 0,
};

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => {}),
  AudioModule: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AudioRecorder: jest.fn().mockImplementation(function (this: any) {
      mockState.created++;
      this.prepareToRecordAsync = async () => {
        mockState.prepared++;
        if (mockState.prepFailsRemaining > 0) {
          mockState.prepFailsRemaining--;
          throw new Error('mic busy');
        }
      };
      this.record = () => {
        mockState.recorded++;
      };
      this.getCurrentInput = async () => ({ type: 'builtin', name: 'phone mic' });
      this.release = () => {
        mockState.released++;
      };
      this.stop = async () => {};
      this.uri = 'file:///rec.m4a';
    }),
  },
}));

import { ChunkedRecorder } from './recorder';

const dir = {} as never; // unused by the recorder (records to document dir)
const cb = { onChunkClosed: () => {}, onMicSource: () => {}, onInterrupted: () => {} };

beforeEach(() => {
  Object.assign(mockState, { prepFailsRemaining: 0, created: 0, released: 0, prepared: 0, recorded: 0 });
});

test('happy path: records on the first attempt', async () => {
  const r = new ChunkedRecorder(dir, cb);
  await r.start();
  expect(mockState.created).toBe(1);
  expect(mockState.recorded).toBe(1);
  expect(mockState.released).toBe(0);
});

test('cold start: first prepare fails → dead recorder released, retry succeeds', async () => {
  mockState.prepFailsRemaining = 1; // first visit, mic not ready yet
  const r = new ChunkedRecorder(dir, cb);
  await r.start();
  expect(mockState.created).toBe(2); // one dead + one good
  expect(mockState.released).toBe(1); // the dead one was freed BEFORE the retry
  expect(mockState.recorded).toBe(1); // recording ultimately started
});

test('total failure: releases what it grabbed and throws', async () => {
  mockState.prepFailsRemaining = 99;
  const r = new ChunkedRecorder(dir, cb);
  await expect(r.start()).rejects.toThrow();
  expect(mockState.recorded).toBe(0);
  expect(mockState.released).toBeGreaterThanOrEqual(1); // mic not left held
}, 10000);
