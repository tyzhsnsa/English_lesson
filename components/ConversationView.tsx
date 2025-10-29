import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage, Blob as GenaiBlob } from '@google/genai';
import type { LessonMaterial, TranscriptionEntry } from '../types';
import { encode, decode, decodeAudioData } from '../utils/audio';
import { MicrophoneIcon, StopIcon, BackIcon, LoaderIcon, LinkIcon } from './Icons';

interface LiveSession {
  close(): void;
  sendRealtimeInput(input: { media: GenaiBlob }): void;
}

interface ConversationViewProps {
  lessonMaterial: LessonMaterial;
  onEndLesson: (history: TranscriptionEntry[]) => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const PARTING_WORDS = ['goodbye', 'good bye', 'see you', 'lesson is over'];

const ConversationView: React.FC<ConversationViewProps> = ({ lessonMaterial, onEndLesson }) => {
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionEntry[]>([]);
  const [currentUserTranscript, setCurrentUserTranscript] = useState('');
  const [currentGeminiTranscript, setCurrentGeminiTranscript] = useState('');
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const latestTranscriptionHistory = useRef<TranscriptionEntry[]>([]);
  useEffect(() => {
    latestTranscriptionHistory.current = transcriptionHistory;
  }, [transcriptionHistory]);

  const sessionPromise = useRef<Promise<LiveSession> | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const inputAudioContext = useRef<AudioContext | null>(null);
  const scriptProcessor = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputAudioContext = useRef<AudioContext | null>(null);
  const audioSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTime = useRef(0);
  const reconnectAttempts = useRef(0);
  
  const currentUserTranscriptRef = useRef('');
  const currentGeminiTranscriptRef = useRef('');
  // FIX: Initialize useRef with `null` to satisfy the hook's argument requirement
  // and prevent a TypeScript error.
  const startConversationRef = useRef<(() => void) | null>(null);

  const baseSystemInstruction = `You are a friendly and encouraging English teacher named Gemini. Your student wants to practice a lesson based on the following material: "${lessonMaterial.content}". It is crucial that you strictly follow the lesson plan provided in this material. Guide the student through the lesson step-by-step, according to the provided content. Ask questions, provide gentle corrections, and help the student practice speaking based only on the lesson material. Keep your responses concise and conversational. When the lesson is complete, say "goodbye".`;

  const stopConversation = useCallback((isFinalCleanup = true) => {
    if (isFinalCleanup) {
      setConnectionState('idle');
    }

    if (sessionPromise.current) {
        sessionPromise.current.then(session => session.close()).catch(() => { /* Ignore errors on closing */ });
        sessionPromise.current = null;
    }

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }

    if (mediaStreamSource.current) {
        try { mediaStreamSource.current.disconnect(); } catch(e) { /* ignore */ }
        mediaStreamSource.current = null;
    }

    if (scriptProcessor.current) {
        try { scriptProcessor.current.disconnect(); } catch (e) { /* ignore */ }
        scriptProcessor.current = null;
    }


    if (inputAudioContext.current?.state !== 'closed') {
      inputAudioContext.current?.close().catch(() => {});
    }
    
    if (outputAudioContext.current?.state !== 'closed') {
        outputAudioContext.current?.close().catch(() => {});
    }
    
    audioSources.current.forEach(source => {
        try { source.stop(); } catch(e) { /* ignore */ }
    });
    audioSources.current.clear();
    nextStartTime.current = 0;
  }, []);

  const handleEndLesson = useCallback((finalHistory: TranscriptionEntry[]) => {
      onEndLesson(finalHistory);
  }, [onEndLesson]);
  
  const handleFailure = useCallback((error?: any) => {
    console.error('Connection failure:', error);
    stopConversation(false); // Synchronous cleanup

    if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++;
        setConnectionState('reconnecting');
        const delay = Math.pow(2, reconnectAttempts.current - 1) * 1000;
        setTimeout(() => startConversationRef.current?.(), delay);
    } else {
        setConnectionState('error');
        const errorMessage = error instanceof Error ? error.message : "Connection failed after multiple attempts.";
        setConnectionError(errorMessage);
    }
  }, [stopConversation]);

  const startConversation = useCallback(async () => {
    stopConversation(false);
    setConnectionError(null);
    setConnectionState(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');

    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({});
      outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      let finalSystemInstruction = baseSystemInstruction;
      if (reconnectAttempts.current > 0 && latestTranscriptionHistory.current.length > 0) {
        const historyText = latestTranscriptionHistory.current
          .map(entry => `${entry.speaker === 'user' ? 'Student' : 'Tutor'}: ${entry.text}`)
          .join('\n');
        
        finalSystemInstruction = `${baseSystemInstruction}\n\nA network disconnection occurred. We are now reconnecting and resuming the lesson. Here is the conversation history so far:\n---\n${historyText}\n---\nPlease continue the lesson naturally from where it left off.`;
      }

      sessionPromise.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: finalSystemInstruction,
        },
        callbacks: {
          onopen: () => {
            setConnectionState('connected');
            reconnectAttempts.current = 0;

            inputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            mediaStreamSource.current = inputAudioContext.current.createMediaStreamSource(mediaStream.current!);
            scriptProcessor.current = inputAudioContext.current.createScriptProcessor(4096, 1, 1);

            scriptProcessor.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: GenaiBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            mediaStreamSource.current.connect(scriptProcessor.current);
            scriptProcessor.current.connect(inputAudioContext.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            try {
              if (message.serverContent?.inputTranscription) {
                currentUserTranscriptRef.current = message.serverContent.inputTranscription.text;
                setCurrentUserTranscript(currentUserTranscriptRef.current);
              }
              if (message.serverContent?.outputTranscription) {
                currentGeminiTranscriptRef.current = message.serverContent.outputTranscription.text;
                setCurrentGeminiTranscript(currentGeminiTranscriptRef.current);
              }
              if (message.serverContent?.turnComplete) {
                const fullInput = currentUserTranscriptRef.current;
                const fullOutput = currentGeminiTranscriptRef.current;
                
                setTranscriptionHistory(prevHistory => {
                    const newHistory = [...prevHistory];
                    if (fullInput) newHistory.push({ id: `user-${Date.now()}`, speaker: 'user' as const, text: fullInput });
                    if (fullOutput) newHistory.push({ id: `gemini-${Date.now()}`, speaker: 'gemini' as const, text: fullOutput });
                    
                    if (PARTING_WORDS.some(word => fullOutput.toLowerCase().includes(word))) {
                      setTimeout(() => {
                        handleEndLesson(newHistory);
                      }, 2000);
                    }
                    return newHistory;
                });
                
                currentUserTranscriptRef.current = '';
                currentGeminiTranscriptRef.current = '';
                setCurrentUserTranscript('');
                setCurrentGeminiTranscript('');
              }
              const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              if (base64Audio && outputAudioContext.current) {
                const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext.current, 24000, 1);
                const source = outputAudioContext.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputAudioContext.current.destination);
                
                const currentTime = outputAudioContext.current.currentTime;
                const startTime = Math.max(currentTime, nextStartTime.current);

                source.start(startTime);
                nextStartTime.current = startTime + audioBuffer.duration;
                
                audioSources.current.add(source);
                source.onended = () => audioSources.current.delete(source);
              }
            } catch (error) {
                console.error("Error processing server message:", error);
                handleFailure(error);
            }
          },
          onerror: (e) => {
            handleFailure(e);
          },
          onclose: (e) => {
            if (!e.wasClean) {
              handleFailure(e);
            }
          }
        }
      });
      await sessionPromise.current;

    } catch (error) {
      handleFailure(error);
    }
  }, [baseSystemInstruction, stopConversation, handleEndLesson, handleFailure]);

  useEffect(() => {
    startConversationRef.current = startConversation;
    startConversation();
    return () => {
        stopConversation(true);
    };
  }, [startConversation, stopConversation]);
  
  const prepareFinalHistoryAndEnd = useCallback(() => {
    const finalHistory = [
      ...latestTranscriptionHistory.current,
      ...(currentUserTranscriptRef.current ? [{ id: 'current-user', speaker: 'user' as const, text: currentUserTranscriptRef.current }] : []),
    ];
    handleEndLesson(finalHistory);
  }, [handleEndLesson]);

  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcriptionHistory, currentUserTranscript, currentGeminiTranscript]);

  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 relative flex flex-col">
        <button onClick={() => prepareFinalHistoryAndEnd()} className="absolute top-4 left-4 text-slate-400 hover:text-sky-400 transition-colors z-10" aria-label="Go back and end lesson">
            <BackIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-slate-100">Lesson in Progress</h2>
        
        {lessonMaterial.type === 'url' && lessonMaterial.sourceUrl && (
            <a href={lessonMaterial.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex self-center items-center gap-2 text-sm text-sky-400 hover:text-sky-300 transition-colors">
                <LinkIcon className="w-4 h-4" />
                <span>View Lesson Material</span>
            </a>
        )}

        <div ref={transcriptContainerRef} className="h-80 bg-slate-900/50 rounded-lg p-4 overflow-y-auto flex flex-col space-y-4 flex-grow">
            {transcriptionHistory.map((entry) => (
              <div key={entry.id} className={`flex w-full ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 ${entry.speaker === 'user' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                      <p className="text-sm text-left">{entry.text}</p>
                  </div>
              </div>
            ))}
            {currentGeminiTranscript && (
                 <div className="flex w-full justify-start">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-slate-700/50 text-slate-400 italic">
                        <p className="text-sm text-left">{currentGeminiTranscript}</p>
                    </div>
                </div>
            )}
            {currentUserTranscript && (
                <div className="flex w-full justify-end">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-sky-600/50 text-slate-300 italic">
                        <p className="text-sm text-left">{currentUserTranscript}</p>
                    </div>
                </div>
            )}
        </div>

        <div className="h-10 flex items-center justify-center flex-shrink-0">
            {connectionState === 'connecting' && <div className="flex items-center gap-2 text-slate-400"><LoaderIcon className="w-5 h-5 animate-spin" /><span>Connecting...</span></div>}
            {connectionState === 'reconnecting' && <div className="flex items-center gap-2 text-slate-400"><LoaderIcon className="w-5 h-5 animate-spin" /><span>Reconnecting... (attempt {reconnectAttempts.current}/{MAX_RECONNECT_ATTEMPTS})</span></div>}
            {connectionState === 'error' && <p className="text-red-400 text-sm">Connection failed: {connectionError}</p>}
            {connectionState === 'connected' && (
                <div className="flex items-center gap-3 text-green-400">
                    <div className="relative flex items-center justify-center">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <MicrophoneIcon className="w-6 h-6 relative" />
                    </div>
                    <span>Connected & Listening</span>
                </div>
            )}
        </div>
        
        <button
          onClick={() => prepareFinalHistoryAndEnd()}
          className="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-500 transition-colors flex items-center justify-center gap-2 flex-shrink-0"
        >
          <StopIcon className="w-5 h-5" />
          End Lesson
        </button>
      </div>
    </div>
  );
};

export default ConversationView;