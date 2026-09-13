import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { errorMessage, useAccounts, useApi } from "../lib/api";
import type { Account } from "../lib/types";
import { Empty, Failure, Loading } from "../components/State";
export default function AccountsPage() {
  const query = useAccounts();
  const api = useApi();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const save = useMutation({
    mutationFn: () => api.saveAccount(editing?.id ?? null, editing!),
    onSuccess: async () => {
      setEditing(null);
      await cache.invalidateQueries();
    },
  });
  const accounts =
    query.data?.filter((a) =>
      `${a.type}${a.subtype}${a.name}`.includes(search),
    ) || [];
  return (
    <Stack spacing={3} className="page">
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <Typography variant="h4">科目设置</Typography>
        <Button
          startIcon={<Add />}
          variant="contained"
          onClick={() => {
            save.reset();
            setEditing({ type: "资产", name: "", subtype: "", notes: "" });
          }}
        >
          新增科目
        </Button>
      </Stack>
      <Alert severity="info">
        “资产 / 现金及等价物”自动计入现金流，当前共有{" "}
        {query.data?.filter(
          (a) => a.type === "资产" && a.subtype === "现金及等价物",
        ).length ?? 0}{" "}
        个科目。金额统一为人民币。
      </Alert>
      <TextField
        label="搜索科目"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => query.refetch()} />
      ) : accounts.length === 0 ? (
        <Empty
          title="没有匹配的科目"
          description="调整搜索条件或新增一个科目。"
        />
      ) : (
        <Stack spacing={1.5}>
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardActionArea
                onClick={() => {
                  save.reset();
                  setEditing({ ...a });
                }}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 650 }}>{a.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {a.type} / {a.subtype}
                    </Typography>
                  </Box>
                  {a.type === "资产" && a.subtype === "现金及等价物" && (
                    <Chip
                      size="small"
                      label="现金范围"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
      <Dialog
        open={!!editing}
        onClose={() => {
          if (!save.isPending) setEditing(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{editing?.id ? "编辑科目" : "新增科目"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {save.error && (
              <Alert severity="error">{errorMessage(save.error)}</Alert>
            )}
            <TextField
              label="科目名称"
              value={editing?.name || ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              autoFocus
            />
            <TextField
              select
              label="类型"
              value={editing?.type || "资产"}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  type: e.target.value as Account["type"],
                })
              }
              slotProps={{ select: { native: true } }}
            >
              {["资产", "负债", "净资产", "收入", "支出"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </TextField>
            <TextField
              label="子类"
              value={editing?.subtype || ""}
              onChange={(e) =>
                setEditing({ ...editing, subtype: e.target.value })
              }
            />
            <TextField
              label="说明"
              value={editing?.notes || ""}
              onChange={(e) =>
                setEditing({ ...editing, notes: e.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={save.isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            保存科目
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
