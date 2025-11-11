import { GoogleGenAI, Modality } from "@google/genai";
import { AspectRatio } from "../types";

// This file assumes that process.env.API_KEY is set in the environment.

const getAiClient = () => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateVideo = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
    // A new instance is created here to ensure the latest key from the dialog is used.
    const ai = getAiClient();
    
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio
        }
    });

    // Poll for completion
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation completed, but no download link was found.");
    }

    return `${downloadLink}&key=${process.env.API_KEY}`;
};


export const analyzeVideoFrames = async (frames: string[], prompt: string): Promise<string> => {
    const ai = getAiClient();
    const imageParts = frames.map(frame => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: frame,
        },
    }));

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: [{ text: prompt }, ...imageParts] },
    });
    
    return response.text;
};

export const generateVoiceOver = async (text: string, voiceStyle: string, duration?: string): Promise<string> => {
    const ai = getAiClient();

    const durationNum = duration ? parseInt(duration, 10) : 0;
    let prompt;

    if (durationNum > 0) {
        prompt = `Say with ${voiceStyle} and finish within ${durationNum} seconds: ${text}`;
    } else {
        prompt = `Say with ${voiceStyle}: ${text}`;
    }

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data received from TTS API.");
    }
    return base64Audio;
};

export const generateScriptSuggestion = async (prompt: string): Promise<string> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text.replace(/["*]/g, ''); // Clean up markdown-like characters
};