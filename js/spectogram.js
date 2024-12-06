let audioContext = null; // Global audio context
let analyser = null;
let animationFrameId = null;
let isSpectrogramRunning = false;
const fftSize = 1024;
const minFrequency = 100;
const maxFrequency = 10000;
let source = null;
let chunkQueue = [];
let chunkDuration = 40;
let maxQueueDuration = 600000; // 10 minutes in ms
let spectogramQueue = [];
const spectrogramCanvas = document.getElementById("spectrogramCanvas");
const spectrogramContext = spectrogramCanvas.getContext("2d");
const outputCanvas = document.getElementById("outputCanvas");
const outputContext = outputCanvas.getContext("2d");
const seekBar = document.getElementById("seekBar");
let cancelVisualization = null
let currentAnimationFrame = null;
let currentX = 0;

spectrogramCanvas.width = window.innerWidth;
spectrogramCanvas.height = window.innerHeight / 2;

let videoStream = null;
let recorder = null;
let videoChunks = [];
let isRecording = false;

function addToAudioQueue(audioChunk, duration) {
    const sampleRate = audioChunk.sampleRate; 
    const totalSamples = audioChunk.length; 
    const numChunks = Math.ceil(duration / chunkDuration); 
    const chunkSize = Math.ceil(totalSamples / numChunks); 

    // let playOffset = 0;
    for (let i = 0; i < numChunks; i++) {
        const startSample = i * chunkSize;
        const endSample = Math.min(startSample + chunkSize, totalSamples); 

        const chunkBuffer = audioContext.createBuffer(
            audioChunk.numberOfChannels,
            endSample - startSample,
            sampleRate
        );

        for (let channel = 0; channel < audioChunk.numberOfChannels; channel++) {
            const sourceData = audioChunk.getChannelData(channel); 
            const chunkData = chunkBuffer.getChannelData(channel); 
            chunkData.set(sourceData.subarray(startSample, endSample)); 
        }

        const chunk = {
            audioChunk: chunkBuffer
        };

        // playChunk(chunkBuffer, playOffset);
        // playOffset += chunkBuffer.duration;
        // playOffset += 1;

        chunkQueue.push(chunk);
    }
}


function playChunk(audioBuffer, offset) {
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(audioContext.currentTime + offset); // Schedule playback
}

const startSpectrogram = () => {
  if (isSpectrogramRunning) return;
  isSpectrogramRunning = true;

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  fetchAndProcessAudio();
  setInterval(fetchAndProcessAudio, 10000);
};

const stopSpectrogram = () => {
  isSpectrogramRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (source) {
    source.disconnect();
    source = null;
  }

  spectrogramContext.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
};

const fetchAndProcessAudio = async () => {
  try {
    const response = await fetch("http://localhost:5000/newest-wav");
    if (response.ok) {
      const data = await response.json();

      const audioResponse = await fetch(`http://localhost:5000/path/${data.newest_file}`);
      const audioBuffer = await audioResponse.arrayBuffer();

      const decodedAudio = await audioContext.decodeAudioData(audioBuffer);

      if (cancelVisualization) {
        cancelVisualization(); // Call the cancellation callback to stop the old visualization
        cancelVisualization = null; // Clear the cancellation reference
      }
      addToAudioQueue(decodedAudio, 10000);
      
      //   playChunk(chunkQueue[12].audioChunk, 0);
      visualizeSpectrogramChunk(decodedAudio);
    
    } else {
      console.error("Failed to fetch WAV file metadata.");
    }
  } catch (error) {
    console.error("Error fetching or processing WAV file:", error);
  }
};

const visualizeSpectrogramChunk = (audio) => {

    if (currentAnimationFrame) {
        cancelAnimationFrame(currentAnimationFrame);
        currentAnimationFrame = null;
    }

    let isCancelled = false;
    cancelVisualization = () => {
        isCancelled = true; 
        if (source) {
            source.stop(); 
            source.disconnect(); 
            source = null;
        }
    };

    source = audioContext.createBufferSource();
    source.buffer = audio;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;

    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start();
    
    const data = new Uint8Array(analyser.frequencyBinCount);
    const sampleRate = audioContext.sampleRate;
    const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
    const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));

    const draw = () => {
        if (!isSpectrogramRunning) return;

        analyser.getByteFrequencyData(data);
        // Shift the canvas to the left
        const imageData = spectrogramContext.getImageData(1, 0, spectrogramCanvas.width - 1, spectrogramCanvas.height);
        spectrogramContext.putImageData(imageData, 0, 0);

        // Draw the new frequency data on the right
        for (let i = minIndex; i < maxIndex; i++) {
            const value = data[i] / 255;
            const hue = Math.round((value * 120) + 280) % 360;
            const saturation = '100%';
            const lightness = 10 + (70 * value) + '%';
            spectrogramContext.fillStyle = `hsl(${hue}, ${saturation}, ${lightness})`;

            const y = spectrogramCanvas.height - ((i - minIndex) / (maxIndex - minIndex)) * spectrogramCanvas.height;
            spectrogramContext.fillRect(spectrogramCanvas.width - 1, y, 1, 1);
        }

        currentX++;

        if (currentX >= spectrogramCanvas.width) {
            const imageData = spectrogramContext.getImageData(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
            spectogramQueue.push(imageData);
            updateSeekBar(); 
            console.log(spectogramQueue);
            currentX = 0; 
        }

        currentAnimationFrame = requestAnimationFrame(draw);
    };
    console.log("width: " + spectrogramCanvas.width);
    draw();

};

const visualizeSpectrogram = (audio) => {

    source = audioContext.createBufferSource();
    source.buffer = audio;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;

    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start();

    const data = new Uint8Array(analyser.frequencyBinCount);
    const sampleRate = audioContext.sampleRate;
    const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
    const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));
    console.log("minIndex: " + minIndex)
    console.log("maxindex: " + maxIndex)
    const draw = () => {
        if (!isSpectrogramRunning) return;

        analyser.getByteFrequencyData(data);
        // Shift the canvas to the left
        const imageData = canvasContext.getImageData(1, 0, canvas.width - 1, canvas.height);
        canvasContext.putImageData(imageData, 0, 0);

        // Draw the new frequency data on the right
        for (let i = minIndex; i < maxIndex; i++) {
            const value = data[i] / 255;
            const hue = Math.round((value * 120) + 280) % 360;
            const saturation = '100%';
            const lightness = 10 + (70 * value) + '%';
            canvasContext.fillStyle = `hsl(${hue}, ${saturation}, ${lightness})`;

            const y = canvas.height - ((i - minIndex) / (maxIndex - minIndex)) * canvas.height;
            canvasContext.fillRect(canvas.width - 1, y, 1, 1);
        }

        animationFrameId = requestAnimationFrame(draw);
    };

    draw();
};


// Event listeners for the start and stop buttons
document.getElementById("startButton").addEventListener("click", startSpectrogram);
document.getElementById("stopButton").addEventListener("click", stopSpectrogram);

// Resize canvas to fit the screen
window.addEventListener("resize", () => {
  spectrogramCanvas.width = window.innerWidth;
  spectrogramCanvas.height = window.innerHeight / 2; 
  outputCanvas.width = window.innerWidth;
  outputCanvas.height = window.innerHeight / 2;
});

function updateSeekBar() {
    seekBar.max = spectogramQueue.length - 1;
    seekBar.value = spectogramQueue.length - 1;
}

function drawFrame(frameIndex) {
    if (frameIndex >= 0 && frameIndex < spectogramQueue.length) {
        const frame = spectogramQueue[frameIndex];
        outputContext.putImageData(frame, 0, 0); // Display the frame on the output canvas
    }
}

seekBar.addEventListener("input", (event) => {
    const frameIndex = parseInt(event.target.value, 10); // Get the current frame index
    drawFrame(frameIndex); // Draw the selected frame
});

window.dispatchEvent(new Event("resize"));
