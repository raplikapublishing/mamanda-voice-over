import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateVideo, analyzeVideoFrames, generateVoiceOver, generateScriptSuggestion } from './services/geminiService';
import { fileToBase64, extractFramesFromVideo } from './utils/video';
import { decode, decodeAudioData } from './utils/audio';
import { AspectRatio } from './types';
import { FilmIcon, SparklesIcon, UploadIcon, Wand2Icon, MicIcon, PlayIcon, BrainCircuitIcon, MusicIcon, DownloadIcon } from './components/icons';
import { Loader } from './components/Loader';

// Fix: Moved the AIStudio interface inside `declare global` to resolve a TypeScript type conflict.
// Extend the Window interface to include aistudio
declare global {
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }

    interface Window {
        aistudio?: AIStudio;
        webkitAudioContext: typeof AudioContext;
    }
    interface HTMLVideoElement {
      captureStream(frameRate?: number): MediaStream;
    }
}

const musicTracks = [
    { name: 'None', url: '' },
    { name: 'Uplifting Ambient', url: 'https://cdn.pixabay.com/download/audio/2023/02/20/audio_c369075a32.mp3' },
    { name: 'Cinematic Drama', url: 'https://cdn.pixabay.com/download/audio/2024/05/14/audio_1489e2c65f.mp3' },
    { name: 'Relaxing Moment', url: 'https://cdn.pixabay.com/download/audio/2022/08/02/audio_82c76941a8.mp3' },
];

const App: React.FC = () => {
    const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);

    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [voiceOverAudioUrl, setVoiceOverAudioUrl] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [script, setScript] = useState<string>('A vibrant, futuristic city with flying vehicles and holographic advertisements.');
    const [voiceStyle, setVoiceStyle] = useState<string>('a clear, professional voice');
    const [voiceOverDuration, setVoiceOverDuration] = useState<string>('');
    const [backgroundMusic, setBackgroundMusic] = useState<string>('');
    
    const [veoPrompt, setVeoPrompt] = useState<string>('A cinematic shot of a futuristic cityscape at sunset, with flying cars weaving between sleek skyscrapers.');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');

    const [isLoading, setIsLoading] = useState({
        veo: false,
        analysis: false,
        tts: false,
        script: false,
        apiKeyCheck: true,
        mixing: false,
    });
    const [loadingMessage, setLoadingMessage] = useState('');

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const checkApiKey = useCallback(async () => {
        setIsLoading(prev => ({ ...prev, apiKeyCheck: true }));
        if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
            setApiKeySelected(true);
        } else {
            setApiKeySelected(false);
        }
        setIsLoading(prev => ({ ...prev, apiKeyCheck: false }));
    }, []);

    useEffect(() => {
        checkApiKey();
    }, [checkApiKey]);

    const handleSelectApiKey = async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            // Optimistically set to true to avoid race conditions
            setApiKeySelected(true);
        }
    };

    const handleVideoGeneration = async () => {
        if (!veoPrompt) {
            alert('Please enter a prompt for video generation.');
            return;
        }
        setIsLoading(prev => ({ ...prev, veo: true }));
        setLoadingMessage('Generating video with Veo... This can take a few minutes. 🎥');
        setVideoSrc(null);
        setVideoFile(null);
        setAnalysisResult('');
        setVoiceOverAudioUrl(null);

        try {
            const videoUrl = await generateVideo(veoPrompt, aspectRatio);
            setVideoSrc(videoUrl);
            const response = await fetch(videoUrl);
            const blob = await response.blob();
            const file = new File([blob], "generated_video.mp4", { type: "video/mp4" });
            setVideoFile(file);
        } catch (error: any) {
            console.error('Video generation failed:', error);
            alert(`Video generation failed: ${error.message}`);
            if (error.message.includes("Requested entity was not found")) {
                setApiKeySelected(false);
            }
        } finally {
            setIsLoading(prev => ({ ...prev, veo: false }));
            setLoadingMessage('');
        }
    };

    const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setVideoFile(file);
            setVideoSrc(URL.createObjectURL(file));
            setAnalysisResult('');
            setVoiceOverAudioUrl(null);
        }
    };

    const handleVideoAnalysis = async () => {
        if (!videoFile) {
            alert('Please upload or generate a video first.');
            return;
        }
        setIsLoading(prev => ({ ...prev, analysis: true }));
        setLoadingMessage('Analyzing video frames... 🧠');
        setAnalysisResult('');
        try {
            const frames = await extractFramesFromVideo(videoFile, 10);
            const result = await analyzeVideoFrames(frames, "Describe the key information, scenes, objects, and overall mood of these video frames.");
            setAnalysisResult(result);
        } catch (error) {
            console.error('Video analysis failed:', error);
            alert('Failed to analyze video.');
        } finally {
            setIsLoading(prev => ({ ...prev, analysis: false }));
            setLoadingMessage('');
        }
    };

    const handleTTSGeneration = async () => {
        if (!script) {
            alert('Please enter a script for the voice-over.');
            return;
        }
        setIsLoading(prev => ({ ...prev, tts: true }));
        setLoadingMessage('Generating AI voice-over... 🎙️');
        try {
            const audioBase64 = await generateVoiceOver(script, voiceStyle, voiceOverDuration);
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            const decodedData = decode(audioBase64);
            const audioBuffer = await decodeAudioData(decodedData, audioContext, 24000, 1);
            
            const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
            const audioUrl = URL.createObjectURL(wavBlob);
            setVoiceOverAudioUrl(audioUrl);

        } catch (error) {
            console.error('TTS generation failed:', error);
            alert('Failed to generate voice-over.');
        } finally {
            setIsLoading(prev => ({ ...prev, tts: false }));
            setLoadingMessage('');
        }
    };

     const bufferToWave = (abuffer: AudioBuffer, len: number) => {
        let numOfChan = abuffer.numberOfChannels,
            length = len * numOfChan * 2 + 44,
            buffer = new ArrayBuffer(length),
            view = new DataView(buffer),
            channels = [], i, sample,
            offset = 0,
            pos = 0;

        setUint32(0x46464952);                         // "RIFF"
        setUint32(length - 8);                         // file length - 8
        setUint32(0x45564157);                         // "WAVE"

        setUint32(0x20746d66);                         // "fmt " chunk
        setUint32(16);                                 // length = 16
        setUint16(1);                                  // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2);                      // block-align
        setUint16(16);                                 // 16-bit
        
        setUint32(0x61746164);                         // "data" - chunk
        setUint32(length - pos - 4);                   // chunk length

        for(i = 0; i < abuffer.numberOfChannels; i++)
            channels.push(abuffer.getChannelData(i));

        while(pos < length) {
            for(i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++
        }

        return new Blob([buffer], {type: "audio/wav"});

        function setUint16(data: number) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data: number) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    }


    const handlePlayWithVoiceOver = () => {
        if (videoRef.current && audioRef.current) {
            videoRef.current.currentTime = 0;
            audioRef.current.currentTime = 0;
            videoRef.current.play();
            audioRef.current.play();
        }
    };

    const handleGenerateScript = async () => {
        if (!videoFile) {
            alert("Please generate or upload a video first to get script ideas.");
            return;
        }
        setIsLoading(prev => ({ ...prev, script: true }));
        try {
            const suggestion = await generateScriptSuggestion("Based on the topic of a video, suggest a short, engaging voice-over script of about 30-50 words.");
            setScript(suggestion);
        } catch (error) {
            console.error('Script suggestion failed:', error);
            alert('Failed to generate script suggestion.');
        } finally {
            setIsLoading(prev => ({ ...prev, script: false }));
        }
    };
    
    const handleDownload = async () => {
        if (!videoRef.current || !voiceOverAudioUrl) {
            alert('Please generate a video and a voice-over first.');
            return;
        }
    
        setIsLoading(prev => ({ ...prev, mixing: true }));
        setLoadingMessage('Mixing audio and video... Please wait. 🎧');
    
        let audioCtx: AudioContext | null = null;
    
        try {
            const videoEl = videoRef.current;
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
            // 1. Voice-over source
            const voiceOverResponse = await fetch(voiceOverAudioUrl);
            const voiceOverArrayBuffer = await voiceOverResponse.arrayBuffer();
            const voiceOverAudioBuffer = await audioCtx.decodeAudioData(voiceOverArrayBuffer);
            const voiceOverSource = audioCtx.createBufferSource();
            voiceOverSource.buffer = voiceOverAudioBuffer;
    
            // 2. Music source (if selected) - using MediaElement to avoid CORS issues
            let musicElement: HTMLAudioElement | null = null;
            let musicSource: MediaElementAudioSourceNode | null = null;
            let musicGain: GainNode | null = null;
            
            if (backgroundMusic) {
                musicElement = new Audio();
                musicElement.crossOrigin = "anonymous";
                musicElement.src = backgroundMusic;
                musicElement.loop = true;
    
                // Wait for the music file to be ready to play
                await new Promise<void>((resolve, reject) => {
                    musicElement!.oncanplaythrough = () => resolve();
                    musicElement!.onerror = () => reject(new Error("Failed to load background music. This might be a network or CORS issue."));
                });
                
                musicSource = audioCtx.createMediaElementSource(musicElement);
                musicGain = audioCtx.createGain();
                musicGain.gain.value = 0.3; // Lower music volume
            }
            
            // 3. Destination Stream for all audio
            const destination = audioCtx.createMediaStreamDestination();
            voiceOverSource.connect(destination);
            if (musicSource && musicGain) {
                musicSource.connect(musicGain).connect(destination);
            }
    
            // 4. Video Stream
            const videoStream = videoEl.captureStream();
    
            // 5. Combined Stream
            const combinedStream = new MediaStream([
                videoStream.getVideoTracks()[0],
                destination.stream.getAudioTracks()[0]
            ]);
    
            // 6. Media Recorder
            const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
            const fileExtension = mimeType.split('/')[1];
    
            const recorder = new MediaRecorder(combinedStream, { mimeType });
            const chunks: Blob[] = [];
    
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };
    
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ai-video-suite-export.${fileExtension}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                if (audioCtx && audioCtx.state !== 'closed') {
                    audioCtx.close();
                }
            };
            
            // 7. Start recording & playback
            videoEl.currentTime = 0;
            videoEl.muted = true; // Mute original video audio
            
            recorder.start();
            voiceOverSource.start();
            if (musicElement) {
                musicElement.play();
            }
            await videoEl.play();
    
            // 8. Stop recording when video ends
            videoEl.onended = () => {
                if (recorder.state === 'recording') {
                    recorder.stop();
                }
                if (musicElement) {
                    musicElement.pause();
                }
                videoEl.muted = false;
            };
    
        } catch (error: any) {
            console.error('Failed to mix and download video:', error);
            alert(`An error occurred during the mixing process. Check console for details. Error: ${error.message}`);
             if (audioCtx && audioCtx.state !== 'closed') {
                audioCtx.close();
            }
        } finally {
            setIsLoading(prev => ({ ...prev, mixing: false }));
            setLoadingMessage('');
        }
    };


    const isAnyLoading = Object.values(isLoading).some(Boolean);

    if (isLoading.apiKeyCheck) {
        return <div className="h-screen w-full flex items-center justify-center bg-gray-900"><Loader /></div>;
    }
    
    if (!apiKeySelected) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-900 p-8 text-center">
                <div className="max-w-2xl bg-gray-800 p-10 rounded-2xl shadow-2xl border border-gray-700">
                    <Wand2Icon className="w-16 h-16 mx-auto text-purple-400 mb-6" />
                    <h1 className="text-4xl font-bold mb-4 text-white">Welcome to the AI Video Suite</h1>
                    <p className="text-gray-300 mb-6">
                        This application uses the powerful Veo model for video generation. To proceed, you need to select an API key.
                    </p>
                    <p className="text-sm text-gray-400 mb-8">
                        For more information on billing, please visit the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">official documentation</a>.
                    </p>
                    <button
                        onClick={handleSelectApiKey}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg flex items-center justify-center mx-auto"
                    >
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        Select API Key
                    </button>
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 sticky top-0 z-10">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <FilmIcon className="w-8 h-8 text-purple-400"/>
                        <h1 className="text-2xl font-bold tracking-tight">AI Video Suite</h1>
                    </div>
                </div>
            </header>

            {isAnyLoading && (
                <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center">
                    <Loader />
                    <p className="mt-4 text-lg font-medium animate-pulse">{loadingMessage}</p>
                </div>
            )}
            
            <main className="container mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Controls */}
                <div className="lg:col-span-4 bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl space-y-8">
                    {/* VEO Generation */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold flex items-center"><Wand2Icon className="w-6 h-6 mr-2 text-purple-400"/>Generate Video with VEO</h2>
                        <textarea
                            value={veoPrompt}
                            onChange={(e) => setVeoPrompt(e.target.value)}
                            placeholder="e.g., A robot holding a red skateboard."
                            className="w-full h-24 p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                        />
                        <div className="flex items-center space-x-4">
                            <label className="font-medium">Aspect Ratio:</label>
                            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="bg-gray-700 border border-gray-600 rounded-lg p-2">
                                <option value="16:9">16:9 (Landscape)</option>
                                <option value="9:16">9:16 (Portrait)</option>
                            </select>
                        </div>
                         <button onClick={handleVideoGeneration} disabled={isAnyLoading} className="w-full flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:bg-gray-500">
                            <SparklesIcon className="w-5 h-5 mr-2"/>
                            Generate
                        </button>
                    </div>

                     <div className="border-t border-gray-700"></div>

                    {/* Video Upload */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold flex items-center"><UploadIcon className="w-6 h-6 mr-2 text-purple-400"/>Or Upload Your Video</h2>
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleVideoUpload}
                            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                        />
                    </div>
                </div>

                {/* Middle Column: Video Player */}
                <div className="lg:col-span-5 bg-gray-800 rounded-2xl p-2 md:p-4 border border-gray-700 shadow-xl flex flex-col items-center justify-center">
                    {videoSrc ? (
                        <div className="w-full space-y-4">
                             <video ref={videoRef} src={videoSrc} controls className="w-full rounded-lg aspect-video" crossOrigin="anonymous"></video>
                             {voiceOverAudioUrl && (
                                <>
                                    <audio ref={audioRef} src={voiceOverAudioUrl} className="hidden"></audio>
                                    <button onClick={handlePlayWithVoiceOver} className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition">
                                       <PlayIcon className="w-5 h-5 mr-2"/> Preview with Voice-Over
                                    </button>
                                </>
                             )}
                        </div>
                    ) : (
                        <div className="w-full aspect-video flex flex-col items-center justify-center bg-gray-900 rounded-lg text-gray-500">
                            <FilmIcon className="w-16 h-16 mb-4"/>
                            <p>Your video will appear here</p>
                        </div>
                    )}
                </div>

                {/* Right Column: AI Tools */}
                <div className="lg:col-span-3 bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl space-y-6">
                    <h2 className="text-xl font-semibold flex items-center"><SparklesIcon className="w-6 h-6 mr-2 text-purple-400"/>AI Toolkit</h2>
                    
                    {/* Analysis */}
                    <div className="space-y-3">
                         <h3 className="text-lg font-medium flex items-center"><BrainCircuitIcon className="w-5 h-5 mr-2"/>Video Analysis</h3>
                         <button onClick={handleVideoAnalysis} disabled={!videoFile || isAnyLoading} className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:bg-gray-500">
                            Analyze Video
                         </button>
                         {analysisResult && (
                             <div className="mt-4 p-3 bg-gray-700/50 rounded-lg max-h-40 overflow-y-auto text-sm">
                                 <p className="whitespace-pre-wrap">{analysisResult}</p>
                             </div>
                         )}
                    </div>

                    {/* TTS */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-medium flex items-center"><MicIcon className="w-5 h-5 mr-2"/>AI Voice-Over</h3>
                        <div>
                             <label htmlFor="voiceStyle" className="block text-sm font-medium text-gray-300 mb-1">Voice Style</label>
                             <input
                                id="voiceStyle"
                                type="text"
                                value={voiceStyle}
                                onChange={(e) => setVoiceStyle(e.target.value)}
                                placeholder="e.g., cheerful, excited"
                                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                             />
                        </div>
                         <div>
                             <label htmlFor="voiceDuration" className="block text-sm font-medium text-gray-300 mb-1">Durasi Voice Over (detik)</label>
                             <input
                                id="voiceDuration"
                                type="number"
                                value={voiceOverDuration}
                                onChange={(e) => setVoiceOverDuration(e.target.value)}
                                placeholder="e.g., 15"
                                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                             />
                        </div>
                        <div className="flex items-center space-x-2">
                             <button onClick={handleGenerateScript} disabled={!videoFile || isAnyLoading} className="p-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition disabled:bg-gray-500" title="Generate Script Idea">
                                <Wand2Icon className="w-5 h-5"/>
                             </button>
                             <textarea
                                value={script}
                                onChange={(e) => setScript(e.target.value)}
                                placeholder="Enter script for voice-over..."
                                className="w-full h-32 p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                            />
                        </div>
                        <button onClick={handleTTSGeneration} disabled={!script || isAnyLoading} className="w-full flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:bg-gray-500">
                            Generate Voice-Over
                        </button>
                         {voiceOverAudioUrl && <p className="text-sm text-green-400 text-center">Voice-over ready! Click preview below video.</p>}
                    </div>

                    {/* Mix & Download */}
                    {videoSrc && voiceOverAudioUrl && (
                        <div className="space-y-3 pt-4 border-t border-gray-600">
                            <h3 className="text-lg font-medium flex items-center"><MusicIcon className="w-5 h-5 mr-2"/>Mix & Download</h3>
                             <div>
                                <label htmlFor="music" className="block text-sm font-medium text-gray-300 mb-1">Background Music</label>
                                <select 
                                    id="music" 
                                    value={backgroundMusic} 
                                    onChange={e => setBackgroundMusic(e.target.value)}
                                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                                >
                                    {musicTracks.map(track => <option key={track.name} value={track.url}>{track.name}</option>)}
                                </select>
                            </div>
                            <button onClick={handleDownload} disabled={isAnyLoading} className="w-full flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:bg-gray-500">
                                <DownloadIcon className="w-5 h-5 mr-2"/>
                                Download Video
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;