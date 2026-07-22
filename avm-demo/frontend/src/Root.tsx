/**
 * Root - 路由根 (V1.10 加 React.lazy code splitting)
 *
 * 优化点：
 * - 首屏关键页面（Login / Workbench / WorkItems / Dashboard）保持直接 import
 * - 其他页面用 React.lazy 懒加载 + Suspense fallback
 * - Vite 自动 code split，每个页面独立 chunk
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import App from './App';
import { LoginPage } from './pages/LoginPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import { WorkItemsPage } from './pages/WorkItemsPage';
import { WorkItemDetailPage } from './pages/WorkItemDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { useAuth } from './AuthContext';

// 懒加载低频页面（首屏之外用到的才加载）
const FlowsPage = lazy(() => import('./pages/FlowsPage').then(m => ({ default: m.FlowsPage })));
const FlowEditorPage = lazy(() => import('./pages/FlowEditorPage').then(m => ({ default: m.FlowEditorPage })));
const ReviewsPage = lazy(() => import('./pages/ReviewsPage').then(m => ({ default: m.ReviewsPage })));
const ReviewDetailPage = lazy(() => import('./pages/ReviewDetailPage').then(m => ({ default: m.ReviewDetailPage })));
const DashboardsPage = lazy(() => import('./pages/DashboardsPage').then(m => ({ default: m.DashboardsPage })));
const DashboardDetailPage = lazy(() => import('./pages/DashboardDetailPage').then(m => ({ default: m.DashboardDetailPage })));
const ChartEditorPage = lazy(() => import('./pages/ChartEditorPage').then(m => ({ default: m.ChartEditorPage })));
const AIPage = lazy(() => import('./pages/AIPage').then(m => ({ default: m.AIPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage').then(m => ({ default: m.ResourcesPage })));
const TreeViewPage = lazy(() => import('./pages/TreeViewPage').then(m => ({ default: m.TreeViewPage })));
const FieldsPage = lazy(() => import('./pages/FieldsPage').then(m => ({ default: m.FieldsPage })));
const AutomationPage = lazy(() => import('./pages/AutomationPage').then(m => ({ default: m.AutomationPage })));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const BaselinePage = lazy(() => import('./pages/BaselinePage').then(m => ({ default: m.BaselinePage })));
const MCPPage = lazy(() => import('./pages/MCPPage').then(m => ({ default: m.MCPPage })));
const TestPage = lazy(() => import('./pages/TestPage').then(m => ({ default: m.TestPage })));
const TenantPage = lazy(() => import('./pages/TenantPage').then(m => ({ default: m.TenantPage })));
const LLMSettingsPage = lazy(() => import('./pages/LLMSettingsPage').then(m => ({ default: m.LLMSettingsPage })));
const CustomerPage = lazy(() => import('./pages/CustomerPage').then(m => ({ default: m.CustomerPage })));
const CarModelPage = lazy(() => import('./pages/CarModelPage').then(m => ({ default: m.CarModelPage })));
const ProjectPage = lazy(() => import('./pages/ProjectPage').then(m => ({ default: m.ProjectPage })));
const DependenciesPage = lazy(() => import('./pages/DependenciesPage').then(m => ({ default: m.DependenciesPage })));
const GanttPage = lazy(() => import('./pages/GanttPage').then(m => ({ default: m.GanttPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })));
const ImportWizardPage = lazy(() => import('./pages/ImportWizardPage').then(m => ({ default: m.ImportWizardPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

// 懒加载 fallback（防止切换路由白屏）
function PageLoader() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: 'calc(100vh - 64px)', color: '#999', fontSize: 14,
    }}>
      <div>加载中...</div>
    </div>
  );
}

export default function Root() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/workbench" replace />} />
            <Route path="workbench" element={<WorkbenchPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="work-items/:type" element={<WorkItemsPage />} />
            <Route path="work-items/:type/:id" element={<WorkItemDetailPage />} />
            <Route path="flows" element={<FlowsPage />} />
            <Route path="flows/:id" element={<FlowEditorPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="reviews/:id" element={<ReviewDetailPage />} />
            <Route path="dashboards" element={<DashboardsPage />} />
            <Route path="dashboards/:id" element={<DashboardDetailPage />} />
            <Route path="charts/new" element={<ChartEditorPage />} />
            <Route path="charts/:id" element={<ChartEditorPage />} />
            <Route path="ai" element={<AIPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="tree" element={<TreeViewPage />} />
            <Route path="tree/:type" element={<TreeViewPage />} />
            <Route path="fields" element={<FieldsPage />} />
            <Route path="automation" element={<AutomationPage />} />
            <Route path="analysis" element={<AnalysisPage />} />
            <Route path="baselines" element={<BaselinePage />} />
            <Route path="mcp" element={<MCPPage />} />
            <Route path="tests" element={<TestPage />} />
            <Route path="tenants" element={<TenantPage />} />
            <Route path="llm-settings" element={<LLMSettingsPage />} />
            <Route path="customers" element={<CustomerPage />} />
            <Route path="car-models" element={<CarModelPage />} />
            <Route path="projects" element={<ProjectPage />} />
            <Route path="dependencies" element={<DependenciesPage />} />
            <Route path="gantt" element={<GanttPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="audit-logs" element={<AuditLogsPage />} />
            <Route path="imports" element={<ImportWizardPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
