
import React, { useState } from 'react';
import WelcomeScreen from './components/WelcomeScreen';
import ConversationView from './components/ConversationView';
import FeedbackView from './components/FeedbackView';
import type { LessonMaterial, TranscriptionEntry } from './types';
import { GithubIcon } from './components/Icons';

const App: React.FC = () => {
  const [appState, setAppState] = useState<'welcome' | 'conversation' | 'feedback'>('welcome');
  const [lessonMaterial, setLessonMaterial] = useState<LessonMaterial | null>(null);
  const [finalTranscript, setFinalTranscript] = useState<TranscriptionEntry[]>([]);

  const startLesson = (material: LessonMaterial) => {
    setLessonMaterial(material);
    setFinalTranscript([]);
    setAppState('conversation');
  };

  const finishLesson = (history: TranscriptionEntry[]) => {
    setFinalTranscript(history);
    setAppState('feedback');
  };

  const restart = () => {
    setLessonMaterial(null);
    setFinalTranscript([]);
    setAppState('welcome');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="w-full p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/80 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">
          Gemini English Tutor
        </h1>
        <a 
          href="https://github.com/google/gemini-api-cookbook" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-sky-400 transition-colors"
        >
          <GithubIcon className="w-6 h-6" />
        </a>
      </header>
      <main className="flex-grow container mx-auto p-4 md:p-6 flex flex-col">
        {appState === 'welcome' && <WelcomeScreen onStartLesson={startLesson} />}
        {appState === 'conversation' && lessonMaterial && (
          <ConversationView lessonMaterial={lessonMaterial} onEndLesson={finishLesson} />
        )}
        {appState === 'feedback' && (
           <FeedbackView history={finalTranscript} onRestart={restart} />
        )}
      </main>
    </div>
  );
};

export default App;
