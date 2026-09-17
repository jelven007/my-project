import { useState } from "react";
import { MapPin, Menu, UserRound, X } from "lucide-react";
import { Link, Route, Routes } from "react-router-dom";

import { useAuth } from "./context/auth-context.js";
import { AccountPage } from "./pages/account-page.js";
import { CarDetailPage } from "./pages/car-detail-page.js";
import { HomePage } from "./pages/home-page.js";
import { InventoryPage } from "./pages/inventory-page.js";
import { LoginPage } from "./pages/login-page.js";
import { RegisterPage } from "./pages/register-page.js";
import { TestDrivePage } from "./pages/test-drive-page.js";
import { ProtectedRoute } from "./routes/protected-route.js";

function SiteHeader() {
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <Link className="brand" to="/" onClick={() => setMenuOpen(false)}>
        XIAOMI EV
      </Link>
      <nav aria-label="主导航" className={menuOpen ? "open" : ""}>
        <Link to="/cars/su7" onClick={() => setMenuOpen(false)}>
          SU7
        </Link>
        <Link to="/cars/yu7" onClick={() => setMenuOpen(false)}>
          YU7
        </Link>
        <Link to="/cars/su7-ultra" onClick={() => setMenuOpen(false)}>
          SU7 Ultra
        </Link>
        <Link to="/inventory" onClick={() => setMenuOpen(false)}>
          <MapPin size={16} /> 经销商库存
        </Link>
        <Link to="/test-drive" onClick={() => setMenuOpen(false)}>
          预约试驾
        </Link>
      </nav>
      <div className="header-tools">
        <Link aria-label={isAuthenticated ? "个人中心" : "登录"} to={isAuthenticated ? "/account" : "/login"}>
          <UserRound size={20} />
        </Link>
        <button
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          aria-expanded={menuOpen}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </header>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/cars/:slug" element={<CarDetailPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/test-drive" element={<TestDrivePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}
