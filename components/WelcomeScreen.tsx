import React, { useState, useCallback } from 'react';
import type { LessonMaterial } from '../types';
import { analyzeLessonImage, analyzeUrlForLesson } from '../services/geminiService';
import { UploadIcon, TextIcon, LoaderIcon, LinkIcon } from './Icons';

interface WelcomeScreenProps {
  onStartLesson: (material: LessonMaterial) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStartLesson }) => {
  const [inputType, setInputType] = useState<'image' | 'text' | 'url'>('image');
  const [textContent, setTextContent] = useState('');
  const [urlContent, setUrlContent] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStart = useCallback(async () => {
    setError(null);
    if (inputType === 'text' && textContent.trim()) {
      onStartLesson({ type: 'text', content: textContent });
    } else if (inputType === 'image' && imageFile && imagePreview) {
      setIsLoading(true);
      try {
        const base64String = imagePreview.split(',')[1];
        const analyzedText = await analyzeLessonImage(base64String, imageFile.type);
        onStartLesson({ type: 'image', content: analyzedText });
      } catch (err) {
        setError('Failed to analyze the image. Please try again.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    } else if (inputType === 'url' && urlContent.trim()) {
        setIsLoading(true);
        try {
          const analyzedText = await analyzeUrlForLesson(urlContent);
          onStartLesson({ type: 'url', content: analyzedText, sourceUrl: urlContent });
        } catch (err) {
          setError('Failed to analyze the URL. Please check it and try again.');
          console.error(err);
        } finally {
          setIsLoading(false);
        }
    }
  }, [inputType, textContent, imageFile, imagePreview, urlContent, onStartLesson]);

  const isStartDisabled = isLoading || (inputType === 'text' && !textContent.trim()) || (inputType === 'image' && !imageFile) || (inputType === 'url' && !urlContent.trim());

  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl shadow-2xl p-8 space-y-6">
        <h2 className="text-3xl font-bold text-slate-100">Prepare Your Lesson</h2>
        <p className="text-slate-400">Upload an image, paste text, or provide a URL to begin.</p>
        
        <div className="flex justify-center bg-slate-700/50 p-1 rounded-lg">
          <button onClick={() => setInputType('image')} className={`px-4 py-2 w-1/3 rounded-md transition-colors text-sm font-medium flex items-center justify-center gap-2 ${inputType === 'image' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-600/50'}`}>
            <UploadIcon className="w-5 h-5" />
            Image
          </button>
          <button onClick={() => setInputType('text')} className={`px-4 py-2 w-1/3 rounded-md transition-colors text-sm font-medium flex items-center justify-center gap-2 ${inputType === 'text' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-600/50'}`}>
            <TextIcon className="w-5 h-5" />
            Text
          </button>
          <button onClick={() => setInputType('url')} className={`px-4 py-2 w-1/3 rounded-md transition-colors text-sm font-medium flex items-center justify-center gap-2 ${inputType === 'url' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-600/50'}`}>
            <LinkIcon className="w-5 h-5" />
            URL
          </button>
        </div>

        {inputType === 'image' ? (
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 cursor-pointer hover:border-sky-500 hover:bg-slate-700/50 transition-colors" onClick={() => document.getElementById('image-upload')?.click()}>
            <input type="file" id="image-upload" className="hidden" accept="image/*" onChange={handleImageChange} />
            {imagePreview ? (
              <img src={imagePreview} alt="Lesson material preview" className="max-h-48 w-auto mx-auto rounded-md object-contain" />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 space-y-2">
                <UploadIcon className="w-10 h-10" />
                <span>Click to upload an image</span>
                <span className="text-xs">PNG, JPG, or WEBP</span>
              </div>
            )}
          </div>
        ) : inputType === 'text' ? (
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Paste your lesson text here..."
            className="w-full h-48 bg-slate-700/50 border border-slate-600 rounded-lg p-4 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors resize-none"
          />
        ) : (
            <input
                type="url"
                value={urlContent}
                onChange={(e) => setUrlContent(e.target.value)}
                placeholder="https://example.com/english-lesson"
                className="w-full h-48 bg-slate-700/50 border border-slate-600 rounded-lg p-4 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors resize-none text-center"
            />
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        
        <button
          onClick={handleStart}
          disabled={isStartDisabled}
          className="w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <LoaderIcon className="w-5 h-5 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Start Lesson'
          )}
        </button>
      </div>
    </div>
  );
};

export default WelcomeScreen;
