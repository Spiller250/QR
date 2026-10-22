import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon={Compass} title="Page not found" action={<Link className="btn" to="/">Back to overview</Link>}>
        The page you are looking for does not exist.
      </EmptyState>
    </div>
  );
}
