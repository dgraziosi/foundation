import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthError, session } from "./api";
import { GraphPage } from "./pages/GraphPage";
import { HomePage } from "./pages/HomePage";
import { NodeDeepLinkPage } from "./pages/TypeViewPage";
import { RecentsPage } from "./pages/RecentsPage";
import { SearchPage } from "./pages/SearchPage";
import { TypeViewPage } from "./pages/TypeViewPage";
import { UnlockPage } from "./pages/UnlockPage";
import { Shell } from "./shell/Shell";
import { LoadError, Placeholders } from "./ui/States";
import { ThemeProvider } from "./theme";

function Gate() {
  const location = useLocation();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: session,
    retry: false,
  });
  if (query.isLoading) {
    return <Placeholders />;
  }
  if (query.error instanceof AuthError) {
    return <UnlockPage />;
  }
  if (query.isError) {
    return <LoadError onRetry={() => void query.refetch()} />;
  }
  return (
    <Routes location={location}>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/recents" element={<RecentsPage />} />
        <Route path="/types/:slug" element={<TypeViewPage />} />
        <Route path="/nodes/:id" element={<NodeDeepLinkPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } },
      }),
    [],
  );
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <BrowserRouter basename="/view">
          <Gate />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
