import { Navigate, useParams } from 'react-router-dom';

// Old addresses that still arrive from shared links. Each one carries its
// own id to the current address of the same thing.

export function LegacyPostRedirect() {
  const { id = '' } = useParams<{ id: string }>();
  return <Navigate to={`/p/${encodeURIComponent(id)}`} replace />;
}

export function LegacyTagRedirect() {
  const { tag = '' } = useParams<{ tag: string }>();
  return <Navigate to={`/explore/tags/${encodeURIComponent(tag)}`} replace />;
}
