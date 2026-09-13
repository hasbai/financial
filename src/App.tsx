import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  AccountBalanceWalletOutlined,
  Add,
  DarkModeOutlined,
  LightModeOutlined,
  Logout,
  ReceiptLongOutlined,
  SpaceDashboardOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  CssBaseline,
  Fab,
  IconButton,
  Stack,
  ThemeProvider,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { makeTheme } from "./theme";
import { useApi, errorMessage } from "./lib/api";
import { Loading, Failure, Empty } from "./components/State";
const OverviewPage = lazy(() => import("./pages/Overview"));
const TransactionsPage = lazy(() => import("./pages/Transactions"));
const AccountsPage = lazy(() => import("./pages/Accounts"));
const Editor = lazy(() => import("./pages/Editor"));
import { config } from "./lib/config";
export default function App() {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [dark, setDark] = useState<boolean | null>(null);
  const theme = useMemo(
    () => makeTheme(dark ?? systemDark),
    [dark, systemDark],
  );
  const [hidden, setHidden] = useState(
    () => localStorage.getItem("financial.hideAmounts") === "true",
  );
  const auth = useAuth0();
  const api = useApi();
  const cache = useQueryClient();
  const location = useLocation();
  const nav = useNavigate();
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (!auth.isAuthenticated) cache.clear();
  }, [auth.isAuthenticated, cache]);
  const login = () =>
    auth
      .loginWithRedirect({
        appState: { returnTo: location.pathname + location.search },
      })
      .catch((e) => setLoginError(errorMessage(e)));
  const authorized = auth.user?.sub === config.ownerSubject;
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!auth.isAuthenticated ? (
        <Container
          maxWidth="sm"
          sx={{
            minHeight: "100dvh",
            display: "grid",
            alignItems: "center",
            py: 4,
          }}
        >
          <Card>
            <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
              <Avatar
                sx={{ width: 64, height: 64, bgcolor: "primary.main", mb: 4 }}
              >
                <AccountBalanceWalletOutlined fontSize="large" />
              </Avatar>
              <Typography color="primary" gutterBottom sx={{ fontWeight: 700 }}>
                北极账本
              </Typography>
              <Typography variant="h4" sx={{ mb: 2 }}>
                每一笔，都心中有数。
              </Typography>
              <Typography
                color="text.secondary"
                sx={{ mb: 4, lineHeight: 1.9 }}
              >
                看清资产与负债，梳理现金收支。把零散的流水，整理成清晰的生活记录。
              </Typography>
              {auth.error || loginError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {loginError || errorMessage(auth.error)}
                </Alert>
              ) : null}
              <Button
                variant="contained"
                fullWidth
                onClick={login}
                loading={auth.isLoading}
              >
                使用北极小站登录
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                仅本人账号可访问。使用 Auth0 安全登录。
              </Typography>
            </CardContent>
          </Card>
        </Container>
      ) : (
        <>
          <Box
            component="aside"
            sx={{
              display: { xs: "none", md: "flex" },
              position: "fixed",
              width: 216,
              inset: "0 auto 0 0",
              borderRight: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
              p: 3,
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", mb: 5, mt: 1 }}
            >
              <AccountBalanceWalletOutlined color="primary" />
              <Typography variant="h6">北极账本</Typography>
            </Stack>
            {[
              ["/", "财务总览", <SpaceDashboardOutlined />],
              ["/transactions", "交易流水", <ReceiptLongOutlined />],
              ["/accounts", "科目设置", <SettingsOutlined />],
            ].map(([path, label, icon]) => (
              <Button
                key={String(path)}
                component={Link}
                to={String(path)}
                startIcon={icon}
                variant={location.pathname === path ? "contained" : "text"}
                sx={{ justifyContent: "flex-start" }}
              >
                {label}
              </Button>
            ))}
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary">
              让每一笔收支都有去处。
            </Typography>
          </Box>
          <Box sx={{ ml: { md: "216px" } }}>
            <Box
              component="header"
              sx={{
                height: 80,
                px: { xs: 2, sm: 4 },
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Avatar
                  sx={{
                    width: 34,
                    height: 34,
                    bgcolor: "primary.main",
                    fontSize: 14,
                  }}
                >
                  账
                </Avatar>
                <Typography sx={{ fontWeight: 650 }}>个人财务</Typography>
              </Stack>
              <Stack direction="row">
                <IconButton
                  aria-label={hidden ? "显示金额" : "隐藏金额"}
                  onClick={() =>
                    setHidden((v) => {
                      localStorage.setItem("financial.hideAmounts", String(!v));
                      return !v;
                    })
                  }
                >
                  {hidden ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                </IconButton>
                <IconButton
                  aria-label="切换深浅主题"
                  onClick={() => setDark(!(dark ?? systemDark))}
                >
                  {(dark ?? systemDark) ? (
                    <LightModeOutlined />
                  ) : (
                    <DarkModeOutlined />
                  )}
                </IconButton>
                <IconButton
                  aria-label="科目设置设置"
                  component={Link}
                  to="/accounts"
                  sx={{ display: { md: "none" } }}
                >
                  <SettingsOutlined />
                </IconButton>
                <IconButton
                  aria-label="退出登录"
                  onClick={() => {
                    cache.clear();
                    void auth.logout({
                      logoutParams: { returnTo: window.location.origin },
                    });
                  }}
                >
                  <Logout />
                </IconButton>
              </Stack>
            </Box>
            <Container
              component="main"
              maxWidth="lg"
              sx={{
                px: { xs: 2, sm: 4 },
                pt: 1,
                pb: "calc(156px + env(safe-area-inset-bottom))",
              }}
            >
              {!authorized ? (
                <Empty
                  title="当前账号没有访问权限"
                  description="请使用已授权的本人账号登录。"
                />
              ) : (
                <Suspense fallback={<Loading />}>
                  <Routes>
                    <Route
                      path="/"
                      element={<OverviewPage hidden={hidden} />}
                    />
                    <Route
                      path="/transactions/*"
                      element={<TransactionsPage hidden={hidden} />}
                    />
                    <Route path="/accounts" element={<AccountsPage />} />
                    <Route path="/auth/callback" element={<Loading />} />
                    <Route
                      path="*"
                      element={
                        <Empty
                          title="页面不存在"
                          description="返回总览继续查看账本。"
                          action={
                            <Button component={Link} to="/">
                              回到总览
                            </Button>
                          }
                        />
                      }
                    />
                  </Routes>
                </Suspense>
              )}
              {authorized && location.pathname.startsWith("/transactions/") && (
                <Suspense fallback={<Loading />}>
                  <Editor hidden={hidden} />
                </Suspense>
              )}
            </Container>
          </Box>
          {authorized && !location.pathname.startsWith("/transactions/") && (
            <Fab
              variant="extended"
              color="primary"
              onClick={() => nav("/transactions/new")}
              sx={{
                position: "fixed",
                right: { xs: 20, md: 40 },
                bottom: {
                  xs: "calc(88px + env(safe-area-inset-bottom))",
                  md: 32,
                },
                gap: 1,
                zIndex: 1050,
              }}
            >
              <Add />
              记一笔
            </Fab>
          )}
          <BottomNavigation
            showLabels
            value={location.pathname.startsWith("/transactions") ? 1 : 0}
            sx={{
              display: { md: "none" },
              position: "fixed",
              bottom: 0,
              width: "100%",
              height: "calc(68px + env(safe-area-inset-bottom))",
              pb: "env(safe-area-inset-bottom)",
              borderTop: 1,
              borderColor: "divider",
              zIndex: 1100,
            }}
            onChange={(_, v) => nav(v === 0 ? "/" : "/transactions")}
          >
            <BottomNavigationAction
              label="总览"
              icon={<SpaceDashboardOutlined />}
            />
            <BottomNavigationAction
              label="流水"
              icon={<ReceiptLongOutlined />}
            />
          </BottomNavigation>
        </>
      )}
    </ThemeProvider>
  );
}
