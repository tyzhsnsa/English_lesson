
export type LessonMaterial = {
    type: 'text' | 'image' | 'url';
    content: string; // This will always be the processed text for the system prompt
    sourceUrl?: string; // This will hold the original URL if provided
};

export type TranscriptionEntry = {
    id: string;
    speaker: 'user' | 'gemini';
    text: string;
};
