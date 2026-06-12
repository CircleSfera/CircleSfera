interface AdvancedSettingsSubScreenProps {
  hideLikes: boolean;
  setHideLikes: (value: boolean) => void;
  turnOffComments: boolean;
  setTurnOffComments: (value: boolean) => void;
  onClose: () => void;
}

export default function AdvancedSettingsSubScreen({
  hideLikes,
  setHideLikes,
  turnOffComments,
  setTurnOffComments,
  onClose,
}: AdvancedSettingsSubScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-white/10 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-gray-300"
            aria-label="Go back"
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="font-bold text-lg">Advanced Settings</h2>
        </div>
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">
                Hide like and view counts
              </div>
              <div className="text-xs text-gray-400 mt-1 max-w-[280px]">
                Only you will see the total number of likes and views on this
                post.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hideLikes}
              onClick={() => setHideLikes(!hideLikes)}
              className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${hideLikes ? 'bg-blue-500' : 'bg-neutral-700'}`}
              aria-label="Toggle hide like counts"
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hideLikes ? 'left-7' : 'left-1'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">Turn off commenting</div>
              <div className="text-xs text-gray-400 mt-1 max-w-[280px]">
                You can change this later by going to the ... menu at the top of
                your post.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={turnOffComments}
              onClick={() => setTurnOffComments(!turnOffComments)}
              className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${turnOffComments ? 'bg-blue-500' : 'bg-neutral-700'}`}
              aria-label="Toggle commenting"
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${turnOffComments ? 'left-7' : 'left-1'}`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
