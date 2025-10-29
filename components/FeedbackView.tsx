
import React, { useState, useEffect } from 'react';
import type { TranscriptionEntry } from '../types';
import { generateFeedback } from '../services/geminiService';
import { LoaderIcon } from './Icons';

interface FeedbackViewProps {
  history: TranscriptionEntry[];
  onRestart: () => void;
}

const FeedbackView: React.FC<FeedbackViewProps> = ({ history, onRestart }) => {
  const [feedback, setFeedback] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getFeedback = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await generateFeedback(history);
        setFeedback(result);
      } catch (err) {
        setError("Couldn't generate feedback. Please try again.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    getFeedback();
  }, [history]);

  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center">
      <div className="w-full max-w-3xl bg-slate-800 rounded-2xl shadow-2xl p-8 space-y-6">
        <h2 className="text-3xl font-bold text-slate-100">Lesson Feedback</h2>
        <div className="text-left bg-slate-900/50 rounded-lg p-6 h-96 overflow-y-auto whitespace-pre-wrap text-slate-300 ring-1 ring-slate-700">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
              <LoaderIcon className="w-10 h-10 animate-spin text-sky-400" />
              <p>Analyzing your performance...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
                <p className="text-red-400">{error}</p>
            </div>
          ) : (
            <p>{feedback}</p>
          )}
        </div>
        <button
          onClick={onRestart}
          className="w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:opacity-50 transition-colors"
          disabled={isLoading}
        >
          Start a New Lesson
        </button>
      </div>
    </div>
  );
};

export default FeedbackView;
