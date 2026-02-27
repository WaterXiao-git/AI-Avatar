import { Navigate, Route, Routes } from "react-router-dom";
import CreatePage from "./pages/CreatePage";
import RigAssistPage from "./pages/RigAssistPage";
import InteractPage from "./pages/InteractPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/create" replace />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/rig-preview" element={<RigAssistPage />} />
      <Route path="/interact" element={<InteractPage />} />
    </Routes>
  );
}

export default App;
