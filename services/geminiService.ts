
import { GoogleGenAI } from "@google/genai";
import type { TranscriptionEntry } from "../types";

export const analyzeLessonImage = async (base64Image: string, mimeType: string): Promise<string> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType: mimeType,
            },
        };
        const textPart = {
            text: "You are an assistant for an English learning app. Analyze this image of a textbook page or a list of words. Extract the key vocabulary, phrases, and topics for a conversation lesson. Present this information clearly and concisely as a plain text list. This will be used to guide an AI English tutor.",
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        return response.text;
    } catch (error) {
        console.error("Error analyzing image with Gemini:", error);
        return "I was unable to analyze the image. Let's just have a general conversation instead. What would you like to talk about?";
    }
};

export const analyzeUrlForLesson = async (url: string): Promise<string> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const textPart = {
            text: `You are an assistant for an English learning app. A user has provided this URL for an English lesson: ${url}. 
            Your task is to analyze the content of this URL and create a structured lesson plan. Understand the flow of the material, from introduction to key points, exercises, and conclusion. 
            This plan should guide you, as the AI English tutor, to lead a natural, flowing conversation based on the provided material.
            If you cannot directly access the URL, analyze the URL itself to infer the topic and generate a logical lesson structure.
            Present the resulting lesson plan as clear, concise text.`,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: { parts: [textPart] },
            config: {
                thinkingConfig: { thinkingBudget: 32768 }
            }
        });

        return response.text;
    } catch (error) {
        console.error("Error analyzing URL with Gemini:", error);
        return `I was unable to analyze the content from the URL. Let's have a conversation based on the topic it might be about, or you can tell me what you'd like to talk about. The URL was: ${url}`;
    }
};


export const generateFeedback = async (history: TranscriptionEntry[]): Promise<string> => {
    if (history.length === 0) {
        return "There was no conversation to analyze. Let's try another lesson!";
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const transcript = history
            .map(entry => `${entry.speaker === 'user' ? 'Student' : 'Tutor'}: ${entry.text}`)
            .join('\n');

        const prompt = `You are an expert English teacher reviewing a lesson transcript. The lesson was between an AI Tutor (you) and a Student. 
Based on the following transcript, provide detailed, constructive feedback for the Student.

Transcript:
---
${transcript}
---

Your feedback should be encouraging and focus on these areas:
1.  **Grammar and Sentence Structure:** Point out any recurring mistakes and provide correct examples.
2.  **Vocabulary Usage:** Comment on the student's word choice. Suggest more appropriate or advanced vocabulary where applicable.
3.  **Fluency and Coherence:** Assess how well the student expressed their ideas.
4.  **Overall Progress:** Give a summary of what the student did well and suggest one or two key areas to focus on for the next lesson.

Format your response as clear, easy-to-read text. Use headings for each section. Do not use Markdown formatting.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 32768 }
            }
        });

        return response.text;
    } catch (error) {
        console.error("Error generating feedback with Gemini:", error);
        return "Sorry, I was unable to generate feedback for this session. Please try again next time.";
    }
};
