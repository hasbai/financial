import React from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { config } from "./lib/config";
import { safeReturnPath } from "./lib/finance";
import { ApiProvider } from "./lib/api";
import App from "./App";
import "./style.css";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <Auth0Provider
        domain={config.domain}
        clientId={config.clientId}
        cacheLocation="memory"
        authorizationParams={{
          redirect_uri: window.location.origin + "/auth/callback",
          audience: config.audience,
          scope: "openid profile email",
          connection: "eastmoney-email",
        }}
        onRedirectCallback={(state) => {
          queryClient.clear();
          router.navigate(safeReturnPath(state?.returnTo), { replace: true });
        }}
      >
        <ApiProvider>
          <App />
        </ApiProvider>
      </Auth0Provider>
    ),
  },
]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
