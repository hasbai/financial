import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowForward,
  FilterList,
  ReceiptLongOutlined,
  Search,
} from "@mui/icons-material";
import { useAccounts, useApi } from "../lib/api";
import { money, statusLabels, kindLabels } from "../lib/finance";
import type { Cursor, Transaction } from "../lib/types";
import { Empty, Failure, Loading } from "../components/State";
export function TransactionCard({
  t,
  hidden,
  to,
}: {
  t: Transaction;
  hidden: boolean;
  to: string;
}) {
  const needs = !t.complete && t.status !== "cancel";
  return (
    <Card className="transaction-card">
      <CardActionArea component={Link} to={to}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  bgcolor: "action.hover",
                  p: 1.25,
                  borderRadius: 3,
                  height: 48,
                }}
              >
                <ReceiptLongOutlined color="primary" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 650, overflowWrap: "anywhere" }}>
                  {t.merchant || t.notes || "未填写交易摘要"}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  {new Date(t.occurred_at).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Shanghai",
                  })}{" "}
                  · {t.payment_method || "未填渠道"}
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ flexShrink: 0, textAlign: "right" }}>
              <Typography className="money" sx={{ fontWeight: 700 }}>
                {t.amount == null ? "金额待补录" : money(t.amount, hidden)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t.entry_count > 2 ? "多分录" : kindLabels[t.kind] || "交易"}
              </Typography>
            </Box>
          </Stack>
          <Stack
            direction="row"
            useFlexGap
            sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.75, mt: 2 }}
          >
            <Chip
              size="small"
              variant="outlined"
              label={statusLabels[t.status] || "状态待确认"}
            />
            <Chip
              size="small"
              color={t.complete ? "success" : "default"}
              label={t.complete ? "信息完整" : "待补录"}
            />
            {t.status !== "cancel" && t.entry_count === 0 && (
              <Chip size="small" color="warning" label="缺少分录" />
            )}
            {t.missing_accounts > 0 && (
              <Chip
                size="small"
                color="warning"
                label={`${t.missing_accounts} 项科目待匹配`}
              />
            )}
            <Box sx={{ flex: 1 }} />
            <Typography
              variant="body2"
              color="primary"
              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
            >
              {needs ? "补全信息" : "查看详情"}
              <ArrowForward sx={{ fontSize: 16 }} />
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
export default function TransactionsPage({ hidden }: { hidden: boolean }) {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState(params.get("search") || "");
  const accounts = useAccounts();
  const filters = Object.fromEntries(params);
  const filterKey = params.toString();
  useEffect(() => setSearch(params.get("search") || ""), [filterKey]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const query = useInfiniteQuery({
    queryKey: ["transactions", filterKey],
    queryFn: ({ pageParam }) => api.list(filters, pageParam),
    initialPageParam: null as Cursor,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) || [];
  useEffect(() => {
    if (location.pathname === "/transactions") {
      const y = sessionStorage.getItem("financial.scroll." + filterKey);
      if (y) requestAnimationFrame(() => window.scrollTo(0, Number(y)));
    }
    return () => {
      if (location.pathname === "/transactions")
        sessionStorage.setItem(
          "financial.scroll." + filterKey,
          String(window.scrollY),
        );
    };
  }, [location.pathname, filterKey]);
  return (
    <Stack spacing={2.5} className="page">
      <Box>
        <Typography variant="h4">交易流水</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          把每一笔，整理清楚。
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        <TextField
          label="搜索商户或摘要"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") update("search", search);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <Search sx={{ mr: 1, color: "text.secondary" }} />
              ),
            },
          }}
        />
        <Button variant="outlined" onClick={() => update("search", search)}>
          搜索
        </Button>
        <Button
          aria-label="展开筛选"
          onClick={() => setExpanded((v) => !v)}
          sx={{ minWidth: 48 }}
        >
          <FilterList />
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {[
          ["", "全部"],
          ["needed", "待补录"],
          ["unmatched", "待匹配"],
        ].map(([v, label]) => (
          <Chip
            key={v}
            label={label}
            color={(params.get("review") || "") === v ? "primary" : "default"}
            variant={(params.get("review") || "") === v ? "filled" : "outlined"}
            onClick={() => update("review", v)}
            sx={{ minHeight: 40 }}
          />
        ))}
      </Stack>
      <Collapse in={expanded}>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="起始日期"
                  type="date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={params.get("start")?.slice(0, 10) || ""}
                  onChange={(e) =>
                    update(
                      "start",
                      e.target.value ? e.target.value + "T00:00:00+08:00" : "",
                    )
                  }
                />
                <TextField
                  label="结束日期（不含）"
                  type="date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={params.get("end")?.slice(0, 10) || ""}
                  onChange={(e) =>
                    update(
                      "end",
                      e.target.value ? e.target.value + "T00:00:00+08:00" : "",
                    )
                  }
                />
              </Stack>
              <Autocomplete
                options={accounts.data || []}
                getOptionLabel={(a) => `${a.type} / ${a.subtype} / ${a.name}`}
                value={
                  accounts.data?.find(
                    (a) => a.id === Number(params.get("account_id")),
                  ) || null
                }
                onChange={(_, a) => update("account_id", a ? String(a.id) : "")}
                renderInput={(p) => <TextField {...p} label="科目" />}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="交易状态"
                  value={params.get("status") || ""}
                  onChange={(e) => update("status", e.target.value)}
                  slotProps={{
                    select: { native: true },
                    inputLabel: { shrink: true },
                  }}
                >
                  <option value="">全部</option>
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </TextField>
                <TextField
                  select
                  label="支付渠道"
                  value={params.get("payment_method") || ""}
                  onChange={(e) => update("payment_method", e.target.value)}
                  slotProps={{
                    select: { native: true },
                    inputLabel: { shrink: true },
                  }}
                >
                  {["", "direct", "支付宝", "微信", "云闪付", "Apple"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v || "全部"}
                      </option>
                    ),
                  )}
                </TextField>
              </Stack>
              <Button onClick={() => setParams({})}>清空全部筛选</Button>
            </Stack>
          </CardContent>
        </Card>
      </Collapse>
      {(params.get("posted") ||
        params.get("account_type") ||
        params.get("cash")) && (
        <Alert severity="info">
          正在查看报表同口径下钻结果。
          <Button onClick={() => setParams({})}>查看全部流水</Button>
        </Alert>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title="这里已经整理好了"
          description="当前筛选没有流水。可切换条件，或记下新的一笔。"
          action={
            <Button component={Link} to="/transactions/new">
              记一笔
            </Button>
          }
        />
      ) : (
        <Stack spacing={1.5}>
          {items.map((t, i) => {
            const date = new Date(t.occurred_at).toLocaleDateString("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            const prev = i
              ? new Date(items[i - 1].occurred_at).toLocaleDateString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : null;
            return (
              <Box key={t.id}>
                {date !== prev && (
                  <Typography
                    color="text.secondary"
                    variant="body2"
                    sx={{ mt: 2, mb: 1.5 }}
                  >
                    {date}
                  </Typography>
                )}
                <TransactionCard
                  t={t}
                  hidden={hidden}
                  to={
                    "/transactions/" + t.id + (filterKey ? "?" + filterKey : "")
                  }
                />
              </Box>
            );
          })}
        </Stack>
      )}
      {query.hasNextPage && (
        <Button
          variant="outlined"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          加载更多流水
        </Button>
      )}
      {items.length > 0 && !query.hasNextPage && (
        <>
          <Divider />
          <Typography align="center" variant="body2" color="text.secondary">
            已显示全部 {items.length} 笔
          </Typography>
        </>
      )}
    </Stack>
  );
}
