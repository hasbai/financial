import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowForward,
  ArrowDownward,
  ArrowUpward,
  AccountBalanceWalletOutlined,
} from "@mui/icons-material";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { useApi, useAccounts } from "../lib/api";
import {
  categoryLabels,
  currentMonth,
  money,
  monthRange,
} from "../lib/finance";

import { Loading, Failure, Empty } from "../components/State";
export default function OverviewPage({ hidden }: { hidden: boolean }) {
  const [month, setMonth] = useState(currentMonth);
  const api = useApi();
  const accounts = useAccounts();
  const cashConfigured = !!accounts.data?.some(
    (a) => a.type === "资产" && a.subtype === "现金及等价物",
  );
  const range = monthRange(month);
  const nav = useNavigate();
  const query = useQuery({
    queryKey: ["overview", month],
    queryFn: () =>
      api.overview(range.start, range.end, new Date().toISOString()),
  });
  const down = (filters: Record<string, string>) =>
    nav(
      "/transactions?" +
        new URLSearchParams({
          start: range.start,
          end: range.end,
          posted: "true",
          ...filters,
        }),
    );
  const data = query.data;
  return (
    <Stack spacing={3} className="page">
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h4">财务总览</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            收支有迹，生活有序。
          </Typography>
        </Box>
        <TextField
          label="报表月份"
          type="month"
          value={month}
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);
          }}
          sx={{ maxWidth: 175 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={() => query.refetch()} />
      ) : (
        data && (
          <>
            {
              <Alert
                severity="info"
                action={
                  <Button
                    component={Link}
                    to="/transactions?review=needed"
                    color="inherit"
                  >
                    去核对
                  </Button>
                }
              >
                {data.quality.pending}{" "}
                笔交易待补录。以下仅反映完整交易的已记录范围，请核对期初覆盖情况。
              </Alert>
            }
            <Card
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                border: 0,
              }}
            >
              <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography>已记录净资产</Typography>
                  <AccountBalanceWalletOutlined />
                </Stack>
                <Typography
                  className="money"
                  sx={{
                    fontSize: { xs: 36, sm: 48 },
                    fontWeight: 700,
                    mt: 1,
                    mb: 1,
                  }}
                >
                  {money(data.net_assets, hidden)}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>
                  截至{" "}
                  {new Date(data.as_of).toLocaleDateString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}{" "}
                  · 人民币 · 账面余额
                </Typography>
                <Divider
                  sx={{ my: 3, borderColor: "currentColor", opacity: 0.2 }}
                />
                <Stack direction="row" spacing={5}>
                  <Box>
                    <Typography variant="body2">资产</Typography>
                    <Button
                      color="inherit"
                      sx={{ px: 0, fontSize: 20 }}
                      onClick={() => down({ account_type: "资产", start: "" })}
                    >
                      {money(data.assets, hidden)}
                    </Button>
                  </Box>
                  <Box>
                    <Typography variant="body2">负债</Typography>
                    <Button
                      color="inherit"
                      sx={{ px: 0, fontSize: 20 }}
                      onClick={() => down({ account_type: "负债", start: "" })}
                    >
                      {money(data.liabilities, hidden)}
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 3,
              }}
            >
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="h6">现金流量</Typography>
                    <Button
                      endIcon={<ArrowForward />}
                      onClick={() => down({ cash: "true" })}
                    >
                      查看流水
                    </Button>
                  </Stack>
                  {!cashConfigured && (
                    <Alert severity="warning" sx={{ my: 1 }}>
                      未找到“资产 / 现金及等价物”科目。
                    </Alert>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    净流入
                  </Typography>
                  <Typography variant="h4" className="money" sx={{ my: 1 }}>
                    {cashConfigured ? money(data.cash_net, hidden) : "待确认"}
                  </Typography>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", my: 2 }}
                  >
                    <Stack spacing={1}>
                      <Typography color="text.secondary">
                        <ArrowDownward sx={{ fontSize: 16 }} /> 对外流入
                      </Typography>
                      <Typography sx={{ fontWeight: 650 }}>
                        {cashConfigured ? money(data.cash_in, hidden) : "—"}
                      </Typography>
                    </Stack>
                    <Stack spacing={1}>
                      <Typography color="text.secondary">
                        <ArrowUpward sx={{ fontSize: 16 }} /> 对外流出
                      </Typography>
                      <Typography sx={{ fontWeight: 650 }}>
                        {cashConfigured ? money(data.cash_out, hidden) : "—"}
                      </Typography>
                    </Stack>
                  </Stack>
                  <Divider sx={{ my: 2 }} />
                  {cashConfigured &&
                    data.cash_categories.map((c) => (
                      <Stack
                        key={c.name}
                        direction="row"
                        sx={{ justifyContent: "space-between", my: 1 }}
                      >
                        <Typography color="text.secondary">
                          {categoryLabels[c.name]}
                        </Typography>
                        <Typography variant="body2">
                          入 {money(c.inflow, hidden)} / 出{" "}
                          {money(c.outflow, hidden)}
                        </Typography>
                      </Stack>
                    ))}
                  <Typography variant="caption" color="text.secondary">
                    现金流按每笔交易现金净变化计算，现金内部转账净额为零。
                  </Typography>
                </CardContent>
              </Card>
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    sx={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography variant="h6">本期损益</Typography>
                    <Chip label="完整记录口径" size="small" />
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2 }}
                  >
                    净收益
                  </Typography>
                  <Typography className="money" variant="h4" sx={{ my: 1 }}>
                    {money(data.profit, hidden)}
                  </Typography>
                  <Stack direction="row" spacing={4} sx={{ my: 2 }}>
                    <Box>
                      <Typography color="text.secondary">收入</Typography>
                      <Button onClick={() => down({ account_type: "收入" })}>
                        {money(data.income, hidden)}
                      </Button>
                    </Box>
                    <Box>
                      <Typography color="text.secondary">支出</Typography>
                      <Button onClick={() => down({ account_type: "支出" })}>
                        {money(data.expense, hidden)}
                      </Button>
                    </Box>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    信用卡消费计入支出，还款不重复计入损益。
                  </Typography>
                </CardContent>
              </Card>
            </Box>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  本月收支趋势
                </Typography>
                {hidden ? (
                  <Box
                    sx={{ height: 200, display: "grid", placeItems: "center" }}
                  >
                    金额已隐藏
                  </Box>
                ) : data.trend.length === 0 ? (
                  <Typography
                    color="text.secondary"
                    sx={{ py: 5, textAlign: "center" }}
                  >
                    本月暂无完整记录交易。先去核对流水。
                  </Typography>
                ) : (
                  <Box
                    sx={{ height: 240 }}
                    role="img"
                    aria-label="本月完整记录收入及支出趋势，明细见下方类别"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.trend.map((d) => ({
                          ...d,
                          income: Number(d.income),
                          expense: Number(d.expense),
                        }))}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => v.slice(5)}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(v, name) => [
                            money(String(v)),
                            name === "income" ? "收入" : "支出",
                          ]}
                        />
                        <Area
                          dataKey="income"
                          name="income"
                          stroke="#2458A6"
                          fill="#2458A6"
                          fillOpacity={0.12}
                          isAnimationActive={false}
                        />
                        <Area
                          dataKey="expense"
                          name="expense"
                          stroke="#A96B29"
                          fill="#A96B29"
                          fillOpacity={0.06}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                )}
                {data.categories.map((c) => (
                  <Stack
                    key={c.type + c.name}
                    direction="row"
                    sx={{ justifyContent: "space-between", py: 1 }}
                  >
                    <Typography>
                      {c.type} · {c.name}
                    </Typography>
                    <Typography>{money(c.amount, hidden)}</Typography>
                  </Stack>
                ))}
              </CardContent>
            </Card>
            <Stack spacing={1}>
              <Typography variant="h6">科目余额</Typography>
              {data.accounts.length === 0 ? (
                <Empty
                  title="等待第一笔正式入账"
                  description="补全历史流水后，资产负债与损益会按统一口径自动更新。"
                />
              ) : (
                data.accounts
                  .filter((a) => ["资产", "负债"].includes(a.type))
                  .map((a) => (
                    <Card key={a.id}>
                      <CardActionArea
                        onClick={() =>
                          down({ account_id: String(a.id), start: "" })
                        }
                      >
                        <CardContent
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 2,
                          }}
                        >
                          <Box>
                            <Typography sx={{ fontWeight: 600 }}>
                              {a.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {a.type} / {a.subtype}
                            </Typography>
                          </Box>
                          <Typography
                            className="money"
                            sx={{ alignSelf: "center" }}
                          >
                            {money(a.balance, hidden)}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ))
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              完整记录 {data.quality.posted} 笔 · 缺少分录{" "}
              {data.quality.missing_entries} 笔 · 缺少科目{" "}
              {data.quality.missing_accounts} 笔
            </Typography>
          </>
        )
      )}
    </Stack>
  );
}
