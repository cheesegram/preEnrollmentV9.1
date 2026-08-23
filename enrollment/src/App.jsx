import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import AppLayout from "./layouts/AppLayout";
import AdminRoute from "./components/AdminRoute";
import LoadingState from "./components/ui/LoadingState";
//whaaaa 
const Login = lazy(() => import("./pages/Login.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const StudentList = lazy(() => import("./pages/StudentList.jsx"));
const Curriculum = lazy(() => import("./pages/Curriculum.jsx"));
const SectionList = lazy(() => import("./pages/SectionList.jsx"));
const Schedules = lazy(() => import("./pages/Schedules.jsx"));


function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 lg:p-8">
      <LoadingState label="Loading page..." />
    </div>
  );
}

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 12px 35px rgba(15, 23, 42, 0.12)",
          },
        }}
      />

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public administrator login page */}
          <Route path="/login" element={<Login />} />

          {/* Administrator-only pages */}
          <Route element={<AdminRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="students" element={<StudentList />} />
              <Route path="section" element={<SectionList />} />
              <Route path="curriculum" element={<Curriculum />} />
              <Route path="schedules" element={<Schedules />} />
            </Route>
          </Route>

          {/* Unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;