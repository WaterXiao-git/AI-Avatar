import { Navigate, Route, Routes } from "react-router-dom";
import CreatePage from "./pages/CreatePage";
import RigAssistPage from "./pages/RigAssistPage";
import InteractPage from "./pages/InteractPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import IntroPage from "./pages/IntroPage";
import ScenePreviewPage from "./pages/ScenePreviewPage";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/intro" replace />} />
      <Route path="/intro" element={<IntroPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/create"
        element={
          <ProtectedRoute>
            <CreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rig-preview"
        element={
          <ProtectedRoute>
            <RigAssistPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scene-preview"
        element={
          <ProtectedRoute>
            <ScenePreviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/interact"
        element={
          <ProtectedRoute>
            <InteractPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
