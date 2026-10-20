const WEBM_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

// Only the canvas is captured, so HTML overlays never appear in the video.
export function recordPlayback({ canvas, audio, fps, videoBitsPerSecond, tailMs }) {
  const mimeType = WEBM_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));

  if (!mimeType) {
    return Promise.reject(new Error('This browser cannot record WebM video.'));
  }

  const captureAudio = audio.captureStream ?? audio.mozCaptureStream;

  if (!captureAudio) {
    return Promise.reject(new Error('This browser cannot capture the audio element.'));
  }

  const videoStream = canvas.captureStream(fps);
  const audioStream = captureAudio.call(audio);
  const stream = new MediaStream([...videoStream.getVideoTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks = [];

  const addAudioTracks = () => {
    for (const track of audioStream.getAudioTracks()) {
      if (!stream.getTrackById(track.id)) {
        stream.addTrack(track);
      }
    }
  };

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      for (const track of videoStream.getTracks()) {
        track.stop();
      }
    };

    const onEnded = () => {
      window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), tailMs);
    };

    const onError = () => {
      cleanup();
      if (recorder.state !== 'inactive') recorder.stop();
      reject(new Error('Audio playback failed during recording.'));
    };

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      cleanup();
      resolve(new Blob(chunks, { type: 'video/webm' }));
    });

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // MediaRecorder cannot add tracks after start(), so the audio track goes in first.
    addAudioTracks();

    if (stream.getAudioTracks().length === 0) {
      cleanup();
      reject(new Error('The audio element has no capturable audio track.'));
      return;
    }

    recorder.start();
    audio.play().catch((error) => {
      cleanup();
      recorder.stop();
      reject(new Error(`Audio could not start (${error.message}).`));
    });
  });
}
