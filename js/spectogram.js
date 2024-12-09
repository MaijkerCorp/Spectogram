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
let cancelVisualization = null
let currentAnimationFrame = null;
let currentX = 0;
let maxX = 0;
let dragOffset = 0;
let isPaused = false;
let isDragging = false;
let fetchAudioInterval = null;



spectrogramCanvas.width = window.innerWidth;
spectrogramCanvas.height = window.innerHeight / 2;

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

const pauseSpectrogram = () => {
    isPaused = true;

    if (currentAnimationFrame) {
        cancelAnimationFrame(currentAnimationFrame);
        currentAnimationFrame = null;
    }
};

const resumeSpectrogram = () => {
    isPaused = false;

    if (source) {
        visualizeSpectrogramChunk(source.buffer); 
    }
};

const startSpectrogram = () => {
  if (isSpectrogramRunning) return;
  isSpectrogramRunning = true;

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (!fetchAudioInterval) {
    fetchAudioInterval = setInterval(() => {
        if (!isPaused) { // Only fetch if not paused
            fetchAndProcessAudio();
        }
    }, 10000); // Fetch every 10 seconds
}
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

    if (fetchAudioInterval) {
        clearInterval(fetchAudioInterval);
        fetchAudioInterval = null;
    }
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

    source = audioContext.createBufferSource();
    source.buffer = audio;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;

    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start();

    const draw = () => {
        if (!isSpectrogramRunning) return;

        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        spectogramQueue.push(data);
        if (spectogramQueue.length > maxQueueDuration) {
            spectogramQueue.shift(); 
        }
        shiftLeft(data);
        currentX++;
        maxX++;
        updateProgressBar(); 
        currentAnimationFrame = requestAnimationFrame(draw);
    };
    draw();
};


const shiftLeft = (data) => {
    // console.log(data);
    // Shift the canvas to the left
    const imageData = spectrogramContext.getImageData(1, 0, spectrogramCanvas.width - 1, spectrogramCanvas.height);
    spectrogramContext.putImageData(imageData, 0, 0);

    // Draw new frequency data on the right
    const sampleRate = audioContext.sampleRate;
    const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
    const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));
    const renderX = spectrogramCanvas.width - 1;

    for (let i = minIndex; i < maxIndex; i++) {
        const value = data[i] / 255;
        const hue = Math.round((value * 120) + 280) % 360;
        const saturation = "100%";
        const lightness = `${10 + 70 * value}%`;
        spectrogramContext.fillStyle = `hsl(${hue}, ${saturation}, ${lightness})`;

        const y =
            spectrogramCanvas.height -
            ((i - minIndex) / (maxIndex - minIndex)) * spectrogramCanvas.height;
        spectrogramContext.fillRect(renderX, y, 1, 1);
    }
};

const shiftRight = (data) => {
    // Shift the canvas to the right
    const imageData = spectrogramContext.getImageData(0, 0, spectrogramCanvas.width - 1, spectrogramCanvas.height);
    spectrogramContext.putImageData(imageData, 1, 0);

    // Draw new frequency data on the left
    const sampleRate = audioContext.sampleRate;
    const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
    const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));
    const renderX = 0;

    for (let i = minIndex; i < maxIndex; i++) {
        const value = data[i] / 255;
        const hue = Math.round((value * 120) + 280) % 360;
        const saturation = "100%";
        const lightness = `${10 + 70 * value}%`;
        spectrogramContext.fillStyle = `hsl(${hue}, ${saturation}, ${lightness})`;

        const y =
            spectrogramCanvas.height -
            ((i - minIndex) / (maxIndex - minIndex)) * spectrogramCanvas.height;
        spectrogramContext.fillRect(renderX, y, 1, 1);
    }
};


const renderClipFromQueue = (offset) => {
    const newIndex = currentX - offset;

    if (newIndex - spectrogramCanvas.width < 0 || newIndex >= spectogramQueue.length) {
        return;
    }
    
    if (offset > 0) {
        for(let i = currentX - 1; i >= newIndex; i--) {
            const data = spectogramQueue[i - spectrogramCanvas.width];
    
            if (!data || !(data instanceof Uint8Array)) {
                console.error("Invalid data at index:", newIndex);
                return;
            }
            shiftRight(data);
        }
    } else if(offset < 0) {
        for(let i = currentX + 1; i <= newIndex; i++) {
            const data = spectogramQueue[newIndex];
    
            if (!data || !(data instanceof Uint8Array)) {
                console.error("Invalid data at index:", newIndex);
                return;
            }
            shiftLeft(data);
        }
    }

    currentX = newIndex;
    updateProgressBar(); 
};



const handleCanvasMouseDown = (event) => {
    console.log("clicked");
    if (isPaused) {
        isDragging = true;
        dragStartX = event.clientX;
        spectrogramCanvas.style.cursor = "grabbing"; 
    }
};

const handleCanvasMouseMove = (event) => {
    if (isDragging && isPaused) {
        const deltaX = event.clientX - dragStartX;

        const offset = Math.round(deltaX / 1); 

        renderClipFromQueue(offset);
        dragStartX = event.clientX; 
    }
};


const handleCanvasMouseUp = () => {
    console.log("released");
    if (isDragging) {
        isDragging = false;
        spectrogramCanvas.style.cursor = "default"; 
    }
};
  const attachCanvasDragging = () => {
    spectrogramCanvas.addEventListener("mousedown", handleCanvasMouseDown);
    spectrogramCanvas.addEventListener("mousemove", handleCanvasMouseMove);
    spectrogramCanvas.addEventListener("mouseup", handleCanvasMouseUp);
    spectrogramCanvas.addEventListener("mouseleave", handleCanvasMouseUp);
  };

const updateProgressBar = () => {
    const progressBar = document.getElementById("progressBar");
    let percentage = 0;
    if(maxX > spectrogramCanvas.width) {
        percentage = ((currentX - spectrogramCanvas.width) / (maxX - spectrogramCanvas.width)) * 100;
    } else {
        percentage = 100;
    }

    progressBar.style.width = `${percentage}%`;
};

// Call this function wherever `currentX` or `spectogramQueue` changes

  
  attachCanvasDragging();

document.getElementById("pauseButton").addEventListener("click", pauseSpectrogram);
document.getElementById("resumeButton").addEventListener("click", resumeSpectrogram);

document.getElementById("startButton").addEventListener("click", startSpectrogram);
document.getElementById("stopButton").addEventListener("click", stopSpectrogram);

window.addEventListener("resize", () => {
  spectrogramCanvas.width = window.innerWidth;
  spectrogramCanvas.height = window.innerHeight / 2;
});

window.dispatchEvent(new Event("resize"));
