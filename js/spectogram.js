// Global Variables
let audioContext = null;
let analyser = null;
let source = null;
let chunkQueue = [];
let spectogramQueue = [];
let animationFrameId = null;
let fetchAudioInterval = null;
let isSpectrogramRunning = false;
let isPaused = false;
let isDragging = false;
let isRendering = false;
let buffered = 0;
let currentlyPlaying = 0;
let numOfClips = 0;
let cancelVisualization = null;
let currentAnimationFrame = null;

// Constants
const chunkDuration = 40; // ms
const pixelsPerChunk = 4; // numbers of pixels drawn for each chunk of audio
let sampleRate = 48000;
let fftSize = 1024;
let minFrequency = 100;
let maxFrequency = 10000;
let fftSizeInput = document.getElementById('fftSize');
let minFrequencyInput = document.getElementById('minFreq');
let maxFrequencyInput = document.getElementById('maxFreq');
let sampleRateInput = document.getElementById('sampleRate');
const spectrogramCanvas = document.getElementById("spectrogramCanvas");
const spectrogramContext = spectrogramCanvas.getContext("2d");
const progressBar = document.getElementById("progressBar");
spectrogramCanvas.width = Math.floor(window.innerWidth / pixelsPerChunk) * pixelsPerChunk;
spectrogramCanvas.height = Math.floor(maxFrequency / (sampleRate / fftSize)) - Math.floor(minFrequency / (sampleRate / fftSize));
numOfClips = spectrogramCanvas.width / pixelsPerChunk;
progressBar.width = spectrogramCanvas.width;

// Utility Functions
const updateTimeCounters = () => {
    const bufferDurationElement = document.getElementById("bufferDuration");
    const currentTimeElement = document.getElementById("currentTime");

    const totalSecondsInBuffer = buffered * chunkDuration;
    const currentTime = chunkDuration * currentlyPlaying;

    bufferDurationElement.textContent = `Buffer: ${totalSecondsInBuffer.toFixed(1)}s`;
    currentTimeElement.textContent = `Current Time: ${currentTime.toFixed(1)}s`;
};

const updateProgressBar = () => {
    let percentage = buffered > spectrogramCanvas.width / pixelsPerChunk
        ? ((currentlyPlaying - numOfClips) / (buffered - numOfClips)) * 100
        : 100;

    progressBar.style.width = `${percentage}%`;
};

// Audio Processing Functions
function addToAudioQueue(audioChunk, duration) {
    const sampleRate = audioChunk.sampleRate; 
    const totalSamples = audioChunk.length; 
    const numChunks = Math.ceil(duration / chunkDuration); 
    const chunkSize = Math.ceil(totalSamples / numChunks); 

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
        chunkQueue.push(chunk);
    }
}

const fetchAndProcessAudio = async () => {
    try {
      const response = await fetch("http://localhost:5000/newest-wav");
      if (response.ok) {
        const data = await response.json();
        const audioResponse = await fetch(`http://localhost:5000/path/${data.newest_file}`);
        const audioBuffer = await audioResponse.arrayBuffer();
        const decodedAudio = await audioContext.decodeAudioData(audioBuffer);
        if (cancelVisualization) {
          cancelVisualization(); 
          cancelVisualization = null; 
        }
        addToAudioQueue(decodedAudio, 10000);    
      } else {
        console.error("Failed to fetch WAV file metadata.");
      }
    } catch (error) {
      console.error("Error fetching or processing WAV file:", error);
    }
};

// Spectrogram Visualization
const visualizeSpectrogramChunk = (audio) => {
    if(audio == null || isPaused) return
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

    source.onended = () => {
        if (currentlyPlaying < chunkQueue.length - 1 && currentlyPlaying == buffered) {
            chunkQueue[currentlyPlaying] = {
                audioChunk : chunkQueue[currentlyPlaying].audioChunk,
                spectogram : spectogramQueue
            };
            spectogramQueue = [];
            currentlyPlaying++;
            buffered++; 
            visualizeSpectrogramChunk(chunkQueue[currentlyPlaying].audioChunk); 
        } else if(currentlyPlaying < chunkQueue.length - 1 && currentlyPlaying < buffered) {
            currentlyPlaying++;
            visualizeSpectrogramChunk(chunkQueue[currentlyPlaying].audioChunk); 
        } else {
            console.log("Playback finished for all chunks");
            isSpectrogramRunning = false; 
        }
    };

    const draw = () => {
        if (!isSpectrogramRunning) return;

        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        var dataContainer = {
            data:data
        }
        spectogramQueue.push(dataContainer);

        shiftLeft(data);
        updateProgressBar(); 
        updateTimeCounters();
        currentAnimationFrame = requestAnimationFrame(draw);
    };
    draw();
};

const shiftLeft = (data) => {
    const imageData = spectrogramContext.getImageData(1, 0, spectrogramCanvas.width - 1, spectrogramCanvas.height);
    spectrogramContext.putImageData(imageData, 0, 0);

    const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
    const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));
    const renderX = spectrogramCanvas.width - 1;
    
    for (let i = minIndex; i < maxIndex; i++) {
        const value = data[i] / 255;

        if (value > 0) {
            const hue = Math.round(60 - (value * 60)); 
            const saturation = "100%"; 
            const lightness = `${30 + value * 50}%`;

            spectrogramContext.fillStyle = `hsl(${hue}, ${saturation}, ${lightness})`;
        } else {
            spectrogramContext.fillStyle = "rgb(20, 0, 40)"; 
        }

        spectrogramContext.fillRect(renderX, spectrogramCanvas.height - (i - minIndex), 1, 1);
    }
};

const visualizeFromQueue = (endIndex) => {
    if(buffered == 0 || buffered <= numOfClips) {
        return;
    }
    if(isRendering){
        console.log("rendering already")
        return
    }
    if(endIndex > buffered){
        endIndex = buffered;
    }
    isRendering = true;
    let width = spectrogramCanvas.width;

    let startIndex = endIndex - numOfClips;
    if(startIndex < 0) {
        startIndex = 0;
        endIndex = numOfClips;
    }
    currentlyPlaying = endIndex;
    spectrogramContext.clearRect(0,0,width, spectrogramCanvas.height);
    let curPixel = 0;
    for(let i = startIndex; i < endIndex; i++) {
        let toDraw = chunkQueue[i].spectogram;
        for(let j = 0; j < toDraw.length; j++){
            let data = toDraw[j].data;
            const sampleRate = audioContext.sampleRate;
            const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
            const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));

            for (let k = minIndex; k < maxIndex; k++) {
                const value = data[k] / 255;
        
                if (value > 0) {
                    const hue = Math.round(60 - (value * 60)); 
                    const saturation = "100%"; 
                    const lightness = `${30 + value * 50}%`;
        
                    spectrogramContext.fillStyle = `hsl(${hue}, ${saturation}, ${lightness})`;
                } else {
                    spectrogramContext.fillStyle = "rgb(20, 0, 40)"; 
                }

                spectrogramContext.fillRect(curPixel, spectrogramCanvas.height - (k - minIndex), 1, 1);
            }
            curPixel++;
        }
    }
    updateProgressBar();
    updateTimeCounters();
    isRendering = false;
}

// Spectrogram Controls
const startSpectrogram = async () => {
    if (isSpectrogramRunning) return;
    isSpectrogramRunning = true;
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    await fetchAndProcessAudio();
    if (!fetchAudioInterval) {
      fetchAudioInterval = setInterval(() => {
          if (!isPaused) { 
              fetchAndProcessAudio();
          }
      }, 10000); // Fetch every 10 seconds
    }
    resize();
    visualizeSpectrogramChunk(chunkQueue[currentlyPlaying].audioChunk);
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

const pauseSpectrogram = () => {
    isPaused = true;
    updateTimeCounters();

    if (currentAnimationFrame) {
        cancelAnimationFrame(currentAnimationFrame);
        currentAnimationFrame = null;
    }
};

const resumeSpectrogram = () => {
    isPaused = false;
    updateTimeCounters();

    if (source) {
        visualizeSpectrogramChunk(chunkQueue[currentlyPlaying].audioChunk); 
    }
};

const renderClipFromQueue = (offset) => {
    const adjustedOffset = Math.floor(offset / 4) * 4;
    visualizeFromQueue(currentlyPlaying - adjustedOffset);
};

// Canvas Dragging Controls
const handleCanvasMouseDown = (event) => {
    if (!isPaused) {
        pauseSpectrogram();
    }
    
    isDragging = true;
    dragStartX = event.clientX;
    spectrogramCanvas.style.cursor = "grabbing";
};

const handleCanvasMouseMove = (event) => {
    if (isDragging && isPaused && !isRendering) {
        const deltaX = event.clientX - dragStartX;

        const offset = Math.round(deltaX / 1); 

        renderClipFromQueue(offset);
        dragStartX = event.clientX; 
    } else {
        return;
    }
};

const handleCanvasMouseUp = () => {
    if (isDragging) {
        isDragging = false;
        spectrogramCanvas.style.cursor = "default";
    }
};

function resize(){
    fftSize = parseInt(fftSizeInput.value); // Update fftSize dynamically
    sampleRate = parseInt(sampleRateInput.value);
    minFrequency = parseInt(minFrequencyInput.value);
    maxFrequency = parseInt(maxFrequencyInput.value);
    const adjustedWidth = Math.floor(window.innerWidth / pixelsPerChunk) * pixelsPerChunk;
    spectrogramCanvas.width = adjustedWidth;
    progressBar.width = adjustedWidth;
    spectrogramCanvas.height = Math.floor(maxFrequency / (sampleRate / fftSize)) - Math.floor(minFrequency / (sampleRate / fftSize));
    numOfClips = spectrogramCanvas.width / pixelsPerChunk;
    visualizeFromQueue(currentlyPlaying);
}

spectrogramCanvas.addEventListener("mousedown", handleCanvasMouseDown);
spectrogramCanvas.addEventListener("mousemove", handleCanvasMouseMove);
spectrogramCanvas.addEventListener("mouseup", handleCanvasMouseUp);

// Event Listeners
document.getElementById("startButton").addEventListener("click", startSpectrogram);
document.getElementById("pauseButton").addEventListener("click", pauseSpectrogram);
document.getElementById("resumeButton").addEventListener("click", resumeSpectrogram);

fftSizeInput.addEventListener('change', () => {
    resize()
});
minFrequencyInput.addEventListener('change', () =>  {
    resize()
});
maxFrequencyInput.addEventListener('change', () =>  {
    resize()
});
sampleRateInput.addEventListener('change', () => {
    resize()
})

window.addEventListener("resize", () => {
    resize()
});
