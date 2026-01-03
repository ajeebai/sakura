

/* 
  Synthetic Audio Service 
  Generates UI sounds and Atmospheric loops using Web Audio API.
*/

let audioCtx: AudioContext | null = null;
let atmosphereNode: AudioNode | null = null;
let atmosphereGain: GainNode | null = null;

const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
};

// --- SFX ---

export const playHoverSfx = () => {
    try {
        const ctx = initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0.015, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    } catch (e) {}
};

export const playClickSfx = () => {
    try {
        const ctx = initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
};

export const playPageTurnSfx = () => {
    try {
        const ctx = initAudio();
        const bufferSize = ctx.sampleRate * 0.3; // 300ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        
        // Pink Noise approximation
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; 
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        
        // Lowpass filter to sound like paper
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, ctx.currentTime);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        noise.start();
    } catch (e) {}
};

// New: Heavy Thud for the Hanko Stamp
export const playThumpSfx = () => {
    try {
        const ctx = initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.3);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, ctx.currentTime);

        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
};

// --- Atmospheres ---

const stopAtmosphere = () => {
    if (atmosphereGain) {
        // Fade out
        try {
            atmosphereGain.gain.exponentialRampToValueAtTime(0.001, audioCtx!.currentTime + 1);
        } catch(e){}
    }
    setTimeout(() => {
        if (atmosphereNode) {
            try { (atmosphereNode as any).stop(); } catch(e) {}
            atmosphereNode.disconnect();
            atmosphereNode = null;
        }
        if (atmosphereGain) {
            atmosphereGain.disconnect();
            atmosphereGain = null;
        }
    }, 1000);
};

const createBrownNoise = (ctx: AudioContext) => {
    const bufferSize = ctx.sampleRate * 2; // 2s loop
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; 
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    return noise;
};

const createVinylCrackles = (ctx: AudioContext) => {
    const bufferSize = ctx.sampleRate * 4; 
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Sparse impulses
    for (let i = 0; i < bufferSize; i++) {
        if (Math.random() > 0.9995) {
             data[i] = (Math.random() * 2 - 1) * 0.5;
        } else {
             data[i] = 0;
        }
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    return noise;
};

export const setAtmosphere = (type: 'none' | 'rain' | 'vinyl') => {
    const ctx = initAudio();
    stopAtmosphere();
    
    if (type === 'none') return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(type === 'rain' ? 0.08 : 0.05, ctx.currentTime + 2);
    
    let source: AudioBufferSourceNode | null = null;
    
    if (type === 'rain') {
        source = createBrownNoise(ctx);
        // Filter to make it sound like rain outside
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        source.connect(filter);
        filter.connect(gain);
    } else if (type === 'vinyl') {
        // Mix pink noise (hiss) + impulses (crackle)
        source = createVinylCrackles(ctx);
        const hiss = createBrownNoise(ctx);
        const hissGain = ctx.createGain();
        hissGain.gain.value = 0.05;
        hiss.connect(hissGain);
        hissGain.connect(gain);
        hiss.start();
        
        source.connect(gain);
    }

    if (source) {
        gain.connect(ctx.destination);
        source.start();
        atmosphereNode = source;
        atmosphereGain = gain;
    }
};