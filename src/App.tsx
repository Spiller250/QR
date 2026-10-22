import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoadingBlock } from './components/ui';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { ProductsPage } from './pages/Products';
import { ProductDetailPage } from './pages/ProductDetail';
import { QrCodesPage } from './pages/QrCodes';
import { LogsPage } from './pages/Logs';
import { LiveDemoPage } from './pages/LiveDemo';
import { SecurityPage } from './pages/Security';
import { SettingsPage } from './pages/Settings';
import { LegacyLabelPage } from './pages/LegacyLabel';
import { NotFoundPage } from './pages/NotFound';

function RequireOperator() {
  const { operator, checking } = useAuth();
  const location = useLocation();
  if (checking) return <LoadingBlock />;
  if (!operator) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Layout />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Retired URL-format labels (…/v/<token>) land here. Nothing is verified on this page. */}
      <Route path="/v/*" element={<LegacyLabelPage />} />
      <Route element={<RequireOperator />}>
        <Route index element={<OverviewPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="qr-codes" element={<QrCodesPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="demo" element={<LiveDemoPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
