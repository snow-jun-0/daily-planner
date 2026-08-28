import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyDarkMode, getDarkMode } from "./lib";

// 저장된 다크 모드 설정을 첫 렌더 전에 적용 (새로고침해도 유지)
applyDarkMode(getDarkMode());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
