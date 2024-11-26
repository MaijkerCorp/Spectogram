console.clear();

let audioChunkQueue = []; // Queue to store audio chunks
let audioPlaying = false;
let audioContext = null; // Global audio context
let canvasInitialized = false;
let lastCaptureTime = Date.now();
let pixelsToCapture = 0;
const chunkDuration = 40; // 40ms chunks
let microphoneStream = null;

// Function to update display values
function updateDisplay(input, display) {
    display.textContent = input.value;
}

// Function to calculate spectrogram aspect ratio
function calculateSpectrogramAspectRatio() {
    const fftSize = parseInt(document.getElementById('fftSize').value);
    const maxFrequency = parseInt(document.getElementById('maxFrequency').value);
    const minFrequency = parseInt(document.getElementById('minFrequency').value);
    const audioDuration = audioChunkQueue.reduce((sum, buffer) => sum + buffer.duration, 0);

    const sampleRate = audioContext ? audioContext.sampleRate : 48000; // Default to 48000 Hz
    const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));
    const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
    const relevantBinCount = maxIndex - minIndex;

    const segments = Math.ceil(audioDuration / chunkDuration);
    const aspectRatio = segments / relevantBinCount;
    return aspectRatio;
}

// Function to update canvas dimensions dynamically
function updateCanvasSize() {
    const CVS = document.querySelector('canvas');
    const aspectRatio = calculateSpectrogramAspectRatio();
    CVS.width = CVS.clientWidth;
    CVS.height = CVS.clientWidth / aspectRatio;
}

// Initialize microphone input and process audio chunks
async function initializeMicrophone() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStream = audioContext.createMediaStreamSource(stream);

        processAudio(microphoneStream);
    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Microphone access is required for this feature.");
    }
}

function processAudio(microphoneStream) {
  const analyser = audioContext.createAnalyser();
  const fftSize = parseInt(document.getElementById('fftSize').value);
  analyser.fftSize = fftSize;

  microphoneStream.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  const maxFrequency = parseInt(document.getElementById('maxFrequency').value);
  const minFrequency = parseInt(document.getElementById('minFrequency').value);
  const maxIndex = Math.floor(maxFrequency / (audioContext.sampleRate / analyser.fftSize));
  const minIndex = Math.floor(minFrequency / (audioContext.sampleRate / analyser.fftSize));

  // Canvas Initialization
  if (!canvasInitialized) {
      const CVS = document.querySelector('canvas');
      const CTX = CVS.getContext('2d', { willReadFrequently: true });
      CVS.height = maxIndex - minIndex + 50; // Add space for labels
      CVS.width = 1000 + 50; // Add space for labels
      canvasInitialized = true;

      // Draw initial axes
      drawAxes(CTX, CVS, minFrequency, maxFrequency);
  }

  function drawAxes(ctx, cvs, minFreq, maxFreq) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      // Frequency Labels (Y-axis)
      ctx.font = '12px Arial';
      ctx.fillStyle = 'black';
      ctx.textAlign = 'right';

      const yStep = 50; // Step size for frequency labels
      const freqStep = (maxFreq - minFreq) / (cvs.height - 50); // Scale factor for frequency
      for (let y = 0; y <= cvs.height - 50; y += yStep) {
          const freq = Math.round(minFreq + (y * freqStep));
          ctx.fillText(`${freq} Hz`, 45, cvs.height - y - 50);
      }

      // Draw axes
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, 0); // Y-axis
      ctx.lineTo(50, cvs.height - 50);
      ctx.lineTo(cvs.width, cvs.height - 50); // X-axis
      ctx.stroke();
  }

  function drawTimeLabels(ctx, cvs, currentStartTime) {
      ctx.clearRect(51, cvs.height - 50, cvs.width - 51, 50); // Clear previous time labels
      ctx.font = '12px Arial';
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';

      const totalWidth = cvs.width - 51; // Exclude Y-axis
      const timeStep = totalWidth / 10; // Divide into 10 segments
      const timePerPixel = 40 / 1000; // 40ms per pixel, based on chunk duration

      for (let x = 51; x <= cvs.width; x += timeStep) {
          const offset = (x - 51) * timePerPixel; // Time offset for the current position
          const time = new Date(currentStartTime + offset * 1000);
          const timeString = time.toLocaleTimeString('en-US', { hour12: false });
          ctx.fillText(timeString, x, cvs.height - 10);
      }
  }

  let currentStartTime = Date.now(); // Start with the current time

  function draw() {
      const CVS = document.querySelector('canvas');
      const CTX = CVS.getContext('2d');

      // Shift the existing drawing to the left
      const imageData = CTX.getImageData(51, 0, CVS.width - 51, CVS.height - 50);
      CTX.clearRect(51, 0, CVS.width - 51, CVS.height - 50);
      CTX.putImageData(imageData, 50, 0);

      analyser.getByteFrequencyData(data);

      // Draw the new data on the right
      for (let j = minIndex; j < maxIndex; j++) {
          let ratio = data[j] / 255;
          if (ratio < 0.13) ratio = 0;

          const hue = Math.round((ratio * 120) + 280) % 360;
          const saturation = '100%';
          const lightness = 10 + (70 * ratio) + '%';
          CTX.fillStyle = `hsl(${hue}, ${saturation}, ${lightness})`;
          CTX.fillRect(CVS.width - 1, CVS.height - 50 - (j - minIndex), 1, 1);
      }

      // Update the time labels based on the current start time
      drawTimeLabels(CTX, CVS, currentStartTime);

      // Increment the start time for the next frame
      currentStartTime += chunkDuration;

      requestAnimationFrame(draw);
  }

  draw();
}


// Initialize spectrogram controls
window.initializeSpectrogramControls = () => {
    const fftSizeInput = document.getElementById('fftSize');
    const segmentDurationInput = document.getElementById('segmentDuration');
    const minFrequencyInput = document.getElementById('minFrequency');
    const maxFrequencyInput = document.getElementById('maxFrequency');
    const fftSizeDisplay = document.getElementById('fftSizeDisplay');
    const segmentDurationDisplay = document.getElementById('segmentDurationDisplay');
    const minFrequencyDisplay = document.getElementById('minFrequencyDisplay');
    const maxFrequencyDisplay = document.getElementById('maxFrequencyDisplay');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');

    updateCanvasSize();

    fftSizeInput.addEventListener('input', () => {
        updateDisplay(fftSizeInput, fftSizeDisplay);
        updateCanvasSize();
    });
    segmentDurationInput.addEventListener('input', () => {
        updateDisplay(segmentDurationInput, segmentDurationDisplay);
        updateCanvasSize();
    });
    minFrequencyInput.addEventListener('input', () => {
        updateDisplay(minFrequencyInput, minFrequencyDisplay);
        updateCanvasSize();
    });
    maxFrequencyInput.addEventListener('input', () => {
        updateDisplay(maxFrequencyInput, maxFrequencyDisplay);
        updateCanvasSize();
    });
    startButton.addEventListener('click', () => {
        startMicrophoneProcessing();
    });
    
    stopButton.addEventListener('click', () => {
        stopAudioPlayback();
    });
};

// Stop microphone input processing
function stopAudioPlayback() {
    if (microphoneStream) {
        microphoneStream.disconnect();
        microphoneStream = null;
        audioPlaying = false;
    }
}

window.startMicrophoneProcessing = initializeMicrophone;

initializeSpectrogramControls();

