// Facade state hook for useCreatePost
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CropData, VideoData } from '../components/PhotoEditor';
import type { Audio as AudioTrack, StoryElement } from '../types';

export type CreateMode = 'POST' | 'STORY' | 'FRAME';
export type Step = 'upload' | 'edit' | 'caption';
export type SubScreen =
  | 'none'
  | 'location'
  | 'accessibility'
  | 'advanced'
  | 'tags'
  | 'monetization'
  | 'interactive'
  | 'music'
  | 'close_friends';

export type InteractiveDraft =
  | { kind: 'poll'; question: string; options: [string, string] }
  | { kind: 'qna'; prompt: string }
  | null;

export interface PostTagData {
  profileId: string;
  username: string;
  x: number;
  y: number;
}

export interface MediaFile {
  file: File;
  url: string; // Blob URL
  type: 'image' | 'video';
  filter?: string;
  cropData?: CropData;
  overlayDataUrl?: string;
  videoData?: VideoData;
  remoteUrl?: string;
}

export function useCreatePostState() {
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const initialMode =
    modeParam === 'story' || modeParam === 'circle'
      ? 'STORY'
      : modeParam === 'frame'
        ? 'FRAME'
        : 'POST';

  const [mode, setMode] = useState<CreateMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const [step, setStep] = useState<Step>('upload');
  const [subScreen, setSubScreen] = useState<SubScreen>('none');

  const [showFrameTrim, setShowFrameTrim] = useState(false);
  const [frameSourceDurationSec, setFrameSourceDurationSec] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<{
    mapboxId: string;
    name: string;
    fullName?: string;
    latitude: number;
    longitude: number;
    country?: string;
    region?: string;
    locality?: string;
  } | null>(null);

  const [hideLikes, setHideLikes] = useState(false);
  const [turnOffComments, setTurnOffComments] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<AudioTrack | null>(null);
  const [audioStartMs, setAudioStartMs] = useState(0);
  const [isCloseFriendsOnly, setIsCloseFriendsOnly] = useState(
    modeParam === 'circle' || searchParams.get('circle') === '1',
  );

  useEffect(() => {
    if (modeParam === 'circle' || searchParams.get('circle') === '1') {
      setIsCloseFriendsOnly(true);
    }
  }, [modeParam, searchParams]);

  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState<number>(0);
  const [scheduledAt, setScheduledAt] = useState('');
  const [interactiveDraft, setInteractiveDraft] =
    useState<InteractiveDraft>(null);

  const [storyElements, setStoryElements] = useState<StoryElement[]>([]);
  const [storyBgStyle, setStoryBgStyle] = useState<string>('');
  const [isComposed, setIsComposed] = useState(false);
  const [originalStoryMedia, setOriginalStoryMedia] = useState<{
    file: File;
    url: string;
    type: 'image' | 'video';
  } | null>(null);

  return {
    mode,
    setMode,
    step,
    setStep,
    subScreen,
    setSubScreen,
    showFrameTrim,
    setShowFrameTrim,
    frameSourceDurationSec,
    setFrameSourceDurationSec,
    showDiscardConfirm,
    setShowDiscardConfirm,
    caption,
    setCaption,
    location,
    setLocation,
    selectedPlace,
    setSelectedPlace,
    hideLikes,
    setHideLikes,
    turnOffComments,
    setTurnOffComments,
    isSensitive,
    setIsSensitive,
    selectedAudio,
    setSelectedAudio,
    audioStartMs,
    setAudioStartMs,
    isCloseFriendsOnly,
    setIsCloseFriendsOnly,
    isPremium,
    setIsPremium,
    price,
    setPrice,
    scheduledAt,
    setScheduledAt,
    interactiveDraft,
    setInteractiveDraft,
    storyElements,
    setStoryElements,
    storyBgStyle,
    setStoryBgStyle,
    isComposed,
    setIsComposed,
    originalStoryMedia,
    setOriginalStoryMedia,
  };
}
