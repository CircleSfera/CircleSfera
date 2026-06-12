import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import StoryViewer from '../components/StoryViewer';
import { highlightsApi } from '../services';

export default function HighlightViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: highlight, isLoading } = useQuery({
    queryKey: ['highlight', id],
    queryFn: () => highlightsApi.getOne(id!).then((res) => res.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!highlight?.stories) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Highlight not found</h2>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-white text-black rounded-full font-bold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Map highlight stories to the format StoryViewer expects
  const stories = highlight.stories.map((hs: any) => hs.story);

  return (
    <StoryViewer
      stories={stories}
      initialIndex={0}
      onClose={() => navigate(-1)}
    />
  );
}
