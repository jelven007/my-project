import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app.js";
import { AdminAuthProvider } from "./context/admin-auth-context.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{ token: { borderRadius: 6, colorPrimary: "#ff6900" } }}
    >
      <AntdApp>
        <BrowserRouter>
          <AdminAuthProvider>
            <App />
          </AdminAuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
