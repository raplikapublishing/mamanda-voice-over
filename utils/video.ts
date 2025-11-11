
export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // remove the data url prefix
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const extractFramesFromVideo = (videoFile: File, numFrames: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const frames: string[] = [];

        video.onloadeddata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const duration = video.duration;
            const interval = duration / numFrames;

            let framesExtracted = 0;

            const extractFrame = (time: number) => {
                video.currentTime = time;
            };

            video.onseeked = () => {
                if (framesExtracted < numFrames && context) {
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    frames.push(dataUrl.split(',')[1]); // Push only base64 data
                    framesExtracted++;

                    if (framesExtracted < numFrames) {
                        extractFrame(framesExtracted * interval);
                    } else {
                        URL.revokeObjectURL(video.src);
                        resolve(frames);
                    }
                }
            };
            
            // Start the process
            extractFrame(0);
        };

        video.onerror = (e) => {
            reject(e);
        };
    });
};
