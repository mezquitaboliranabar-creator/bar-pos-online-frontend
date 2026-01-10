import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import InventoryPage from "./pages/InventoryPage";
import UsersPage from "./pages/UsersPage";
import RecipesPage from "./pages/RecipesPage";
import SalesPage from "./pages/SalesPage";
import SalesTabsPage from "./pages/SalesTabsPage";
import SalesListPage from "./pages/SalesListPage";
import SalesReportsPage from "./pages/SalesReportsPage";
import ExpensesPage from "./pages/ExpensesPage";

/* Componente principal de la app */
export default function App() {
  // Define rutas principales de la aplicación
  return (
    <BrowserRouter>
      <Routes>
        {/* Raíz y /login apuntan al login */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Dashboard principal */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Módulos principales */}
        <Route path="/productos" element={<ProductsPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/usuarios" element={<UsersPage />} />
        <Route path="/recetas" element={<RecipesPage />} />
        <Route path="/ventas" element={<SalesPage />} />
        <Route path="/ventas/lista" element={<SalesListPage />} />
        <Route path="/ventas/reportes" element={<SalesReportsPage />} />

        {/* Gastos */}
        <Route path="/gastos" element={<ExpensesPage />} />

        {/* Mesas / Tabs */}
        <Route path="/mesas" element={<SalesTabsPage />} />
        <Route path="/tabs" element={<SalesTabsPage />} />

        {/* Módulo de registro solo para primer usuario administrador */}
        <Route path="/register" element={<RegisterPage />} />

        {/* Cualquier otra ruta redirige al login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
