import { createTheme } from "@mui/material/styles";
export const makeTheme = (dark: boolean) =>
  createTheme({
    palette: {
      mode: dark ? "dark" : "light",
      primary: { main: dark ? "#A8C7FA" : "#2458A6" },
      background: {
        default: dark ? "#10141C" : "#F7F9FC",
        paper: dark ? "#1B2230" : "#FFFFFF",
      },
      text: {
        primary: dark ? "#E8EDF5" : "#172033",
        secondary: dark ? "#AEBACC" : "#58677E",
      },
    },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      h4: { fontWeight: 750, letterSpacing: "-.04em" },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700, fontSize: "1.1rem" },
      button: { textTransform: "none", fontWeight: 650 },
    },
    shape: { borderRadius: 16 },
    components: {
      MuiButton: {
        styleOverrides: { root: { minHeight: 48, borderRadius: 12 } },
      },
      MuiIconButton: {
        styleOverrides: { root: { minWidth: 48, minHeight: 48 } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: "1px solid",
            borderColor: dark ? "#313C4E" : "#E3E9F1",
          },
        },
      },
      MuiTextField: { defaultProps: { fullWidth: true } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 24 } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 550 } } },
    },
  });
