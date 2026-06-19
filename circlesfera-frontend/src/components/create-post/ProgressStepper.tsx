import { motion } from 'framer-motion';
import { Send, Sparkles, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Step = 'upload' | 'edit' | 'caption';

interface ProgressStepperProps {
  currentStep: Step;
  mode: 'POST' | 'STORY' | 'FRAME';
}

const STEPS: { key: Step; label: string; icon: typeof Upload }[] = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'edit', label: 'Edit', icon: Sparkles },
  { key: 'caption', label: 'Share', icon: Send },
];

function getStepIndex(step: Step) {
  return STEPS.findIndex((s) => s.key === step);
}

export default function ProgressStepper({
  currentStep,
  mode,
}: ProgressStepperProps) {
  const { t } = useTranslation();
  const currentIndex = getStepIndex(currentStep);
  const isStory = mode === 'STORY';

  // Stories skip caption step → only 2 steps
  const visibleSteps = isStory
    ? STEPS.filter((s) => s.key !== 'caption')
    : STEPS;
  const progress = isStory
    ? currentIndex === 0
      ? 0
      : 1
    : currentIndex / (STEPS.length - 1);

  return (
    <div className="flex items-center gap-0 px-6 py-2.5 relative">
      {/* Progress Line Background */}
      <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[2px] bg-white/6 rounded-full z-0" />

      {/* Progress Line Fill */}
      <motion.div
        className="absolute left-6 top-1/2 -translate-y-1/2 h-[2px] rounded-full z-1"
        style={{
          background:
            'linear-gradient(90deg, var(--brand-primary), var(--brand-blue))',
        }}
        initial={{ width: '0%' }}
        animate={{
          width: `${progress * 100}%`,
        }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      />

      {/* Step Dots */}
      {visibleSteps.map((step) => {
        const stepIndex = getStepIndex(step.key);
        const isCompleted = currentIndex > stepIndex;
        const isCurrent = currentIndex === stepIndex;
        const Icon = step.icon;

        return (
          <div
            key={step.key}
            className="flex-1 flex flex-col items-center relative z-10"
          >
            <motion.div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                ${
                  isCurrent
                    ? 'bg-linear-to-tr from-brand-primary to-brand-blue shadow-lg shadow-brand-primary/30'
                    : isCompleted
                      ? 'bg-white/15 border border-white/20'
                      : 'bg-white/4 border border-white/8'
                }
              `}
              animate={{
                scale: isCurrent ? 1 : 0.85,
              }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <Icon
                size={14}
                className={`
                  transition-colors duration-300
                  ${isCurrent ? 'text-white' : isCompleted ? 'text-white/70' : 'text-white/20'}
                `}
                strokeWidth={2.5}
              />
            </motion.div>
            <span
              className={`
                text-xs font-bold uppercase tracking-[0.12em] mt-1.5 transition-colors duration-300
                ${isCurrent ? 'text-white' : isCompleted ? 'text-white/40' : 'text-white/15'}
              `}
            >
              {t(`createPost.stepper.${step.key}`)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
