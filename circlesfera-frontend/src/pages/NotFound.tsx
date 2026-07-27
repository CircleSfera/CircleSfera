import { Link } from 'react-router-dom';
import SEO from '../components/common/SEO';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <SEO
        title="Page not found"
        description="The page you are looking for does not exist."
        noIndex
      />
      <p className="text-6xl font-bold text-white/20 mb-4">404</p>
      <h1 className="text-2xl font-semibold text-white mb-2">Page not found</h1>
      <p className="text-zinc-400 mb-8 max-w-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="px-6 py-2.5 rounded-full bg-white/10 border border-white/10 text-white font-medium hover:bg-white/20 transition-colors"
      >
        Go home
      </Link>
    </div>
  );
}
