export const TEST_SAMPLES = {
  sample01: {
    name: 'German Bachelor Test 01',
    audio: '/assets/audio/German-Test.wav',
    visemes: '/assets/visemes/German-Test.json',
  },
  englishTest: {
    name: 'English Test (listener discretion advised)',
    audio: '/assets/audio/listener-discretion-advised.wav',
    visemes: '/assets/visemes/listener-discretion-advised.json',
  },
};

export const DEFAULT_TEST_SAMPLE_ID = 'sample01';

// max allowed difference between WAV and Rhubarb duration in seconds
export const SAMPLE_DURATION_TOLERANCE = 0.1;
