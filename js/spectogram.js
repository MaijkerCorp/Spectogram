let audioContext = null; // Global audio context
let analyser = null;
let animationFrameId = null;
let isSpectrogramRunning = false;
const fftSize = 1024;
const minFrequency = 100;
const maxFrequency = 10000;
let source = null;
let chunkQueue = [];
let buffered = 0;
let chunkDuration = 40;
let maxQueueDuration = 600000; // 10 minutes in ms
let spectogramQueue = [];
const spectrogramCanvas = document.getElementById("spectrogramCanvas");
const spectrogramContext = spectrogramCanvas.getContext("2d");
const progressBar = document.getElementById("progressBar");
let cancelVisualization = null
let currentAnimationFrame = null;
let currentX = 0;
let maxX = 0;
let dragOffset = 0;
let isPaused = false;
let isDragging = false;
let isRendering = false;
let fetchAudioInterval = null;
let currentlyPlaying = 0;
let list = [];

let realTimeCounterInterval = null; 
let playbackStartTime = 0;
let totalElapsedTime = 0;

spectrogramCanvas.width = Math.floor(window.innerWidth / 4) * 4;
progressBar.width = spectrogramCanvas.width
spectrogramCanvas.height = window.innerHeight / 2;

const updateTimeCounters = () => {
    const bufferDurationElement = document.getElementById("bufferDuration");
    const currentTimeElement = document.getElementById("currentTime");

    // Calculate total duration in buffer
    const totalSecondsInBuffer = (spectogramQueue.length * chunkDuration) / 1000;

    // Calculate current playback time
    const currentTime = (currentX * chunkDuration)/ 4 / 1000;

    bufferDurationElement.textContent = `Buffer: ${totalSecondsInBuffer.toFixed(1)}s`;
    currentTimeElement.textContent = `Current Time: ${currentTime.toFixed(1)}s`;
};

const startRealTimeCounter = () => {
    if (realTimeCounterInterval) {
        clearInterval(realTimeCounterInterval);
    }

    realTimeCounterInterval = setInterval(() => {
        const elapsedRealTime = totalElapsedTime + (audioContext.currentTime - playbackStartTime); 
        const realTimeElement = document.getElementById("realTime");
        realTimeElement.textContent = `Real-Time Playback: ${elapsedRealTime.toFixed(1)}s`;
    }, 100);
};

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
    source.start(audioContext.currentTime + offset); 
}

const pauseSpectrogram = () => {
    isPaused = true;
    updateTimeCounters();

    if (currentAnimationFrame) {
        cancelAnimationFrame(currentAnimationFrame);
        currentAnimationFrame = null;
    }

    if (realTimeCounterInterval) {
        clearInterval(realTimeCounterInterval);
        realTimeCounterInterval = null;
    }

    totalElapsedTime += audioContext.currentTime - playbackStartTime;
};

const resumeSpectrogram = () => {
    isPaused = false;
    updateTimeCounters();

    if (source) {
        startRealTimeCounter();
        renderClipFromQueue(currentX - maxX);
        visualizeSpectrogramChunk(source.buffer); 
    }
};

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
  
  playbackStartTime = audioContext.currentTime;
  startRealTimeCounter();
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

    if (realTimeCounterInterval) {
        clearInterval(realTimeCounterInterval);
        realTimeCounterInterval = null;
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
        cancelVisualization(); 
        cancelVisualization = null; 
      }
      addToAudioQueue(decodedAudio, 10000);
      
      //   playChunk(chunkQueue[12].audioChunk, 0);
    
    } else {
      console.error("Failed to fetch WAV file metadata.");
    }
  } catch (error) {
    console.error("Error fetching or processing WAV file:", error);
  }
};

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
        if (currentlyPlaying < chunkQueue.length - 1) {
            chunkQueue[currentlyPlaying] = {
                audioChunk : chunkQueue[currentlyPlaying].audioChunk,
                spectogram : spectogramQueue
            };
            spectogramQueue = [];
            currentlyPlaying++;
            buffered++; 
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
        currentX++;
        maxX++;
        updateProgressBar(); 
        updateTimeCounters();
        currentAnimationFrame = requestAnimationFrame(draw);
    };
    draw();
};

function visualizeFromQueue(endIndex) {
    if(buffered == 0){
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
    let numOfClips = width / 4;

    let startIndex = endIndex - numOfClips;
    if(startIndex < 0) {
        startIndex = 0;
        endIndex = numOfClips;
    }
    currentlyPlaying = endIndex;
    console.log("startIndex:" + startIndex)
    console.log("endIndex:" + endIndex)
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
    
    isRendering = false;
}

const shiftLeft = (data) => {
    // console.log(data);
    // Shift the canvas to the left
    const imageData = spectrogramContext.getImageData(1, 0, spectrogramCanvas.width - 1, spectrogramCanvas.height);
    spectrogramContext.putImageData(imageData, 0, 0);

    // Draw new frequency data on the right
    const sampleRate = 48000;
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

const renderClipFromQueue = (offset) => {
    // console.log("offset:"+offset)
    // if(isRendering){
    //     console.log("already Rendering")
    //     return;
    // }
    // isRendering = true;
    console.log("offset:" +offset)
    const adjustedOffset = Math.floor(offset / 4) * 4;
    console.log("adjustedOffset:"+ adjustedOffset)
    visualizeFromQueue(currentlyPlaying - adjustedOffset);
};

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

  const attachCanvasDragging = () => {
    spectrogramCanvas.addEventListener("mousedown", handleCanvasMouseDown);
    spectrogramCanvas.addEventListener("mousemove", handleCanvasMouseMove);
    spectrogramCanvas.addEventListener("mouseup", handleCanvasMouseUp);
    spectrogramCanvas.addEventListener("mouseleave", handleCanvasMouseUp);
  };

const updateProgressBar = () => {
    let percentage = 0;
    if(maxX > spectrogramCanvas.width) {
        percentage = ((currentX - spectrogramCanvas.width) / (maxX - spectrogramCanvas.width)) * 100;
    } else {
        percentage = 100;
    }

    progressBar.style.width = `${percentage}%`;
};

function calculateSpectrogramAspectRatio() {
    // maxFrequency = parseInt(document.getElementById('maxFrequency').value);
    // minFrequency = parseInt(document.getElementById('minFrequency').value);
    // const segmentDuration = parseFloat(document.getElementById('segmentDuration').value);
    // const audioDuration = audioChunkQueue.reduce((sum, buffer) => sum + buffer.duration, 0); // Calculate total duration from the queue

    const sampleRate = 48000; // Default to 48000 Hz
    const maxIndex = Math.floor(maxFrequency / (sampleRate / fftSize));
    const minIndex = Math.floor(minFrequency / (sampleRate / fftSize));
    const relevantBinCount = maxIndex - minIndex;

    const segments = 256;
    const aspectRatio = segments / relevantBinCount;
    return aspectRatio;
} 

attachCanvasDragging();

document.getElementById("pauseButton").addEventListener("click", pauseSpectrogram);
document.getElementById("resumeButton").addEventListener("click", resumeSpectrogram);

document.getElementById("startButton").addEventListener("click", startSpectrogram);
document.getElementById("stopButton").addEventListener("click", stopSpectrogram);

window.addEventListener("resize", () => {
  const adjustedWidth = Math.floor(window.innerWidth / 4) * 4;
  spectrogramCanvas.width = adjustedWidth;
  progressBar.width = adjustedWidth;
  const aspectRatio = calculateSpectrogramAspectRatio();  
  spectrogramCanvas.height = 256;
  visualizeFromQueue(currentlyPlaying);
});

window.dispatchEvent(new Event("resize"));
