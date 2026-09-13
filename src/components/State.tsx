import {
  Alert,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { errorMessage } from "../lib/api";
export function Loading() {
  return (
    <Stack spacing={2} aria-label="正在加载">
      <Skeleton height={100} variant="rounded" />
      <Skeleton height={180} variant="rounded" />
      <Skeleton height={180} variant="rounded" />
    </Stack>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" onClick={retry}>
          重试
        </Button>
      }
    >
      {errorMessage(error)}
    </Alert>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
        {action}
      </CardContent>
    </Card>
  );
}
