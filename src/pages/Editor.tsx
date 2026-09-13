import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { Add, Close, DeleteOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import Decimal from "decimal.js";
import { useAccounts, useApi, errorMessage } from "../lib/api";
import {
  amountSchema,
  fromLocalDateTime,
  localDateTime,
  money,
  statusLabels,
  totals,
  validatePost,
} from "../lib/finance";
import type { Payload, Transaction } from "../lib/types";
import AccountPicker from "../components/AccountPicker";
import { Failure, Loading } from "../components/State";
const fresh = (): Payload => ({
  occurred_at: new Date().toISOString(),
  status: "success",
  payment_method: "direct",
  payment_id: "",
  merchant: "",
  notes: "",
  entries: [
    { account_id: null, direction: "借", amount: "" },
    { account_id: null, direction: "贷", amount: "" },
  ],
});
export default function Editor({ hidden }: { hidden: boolean }) {
  const path = useLocation();
  const segment = path.pathname.split("/")[2];
  const id = segment === "new" ? null : Number(segment);
  const api = useApi();
  const query = useQuery({
    queryKey: ["transaction", id],
    queryFn: () => api.transaction(id!),
    enabled: id !== null && Number.isInteger(id),
  });
  const nav = useNavigate();
  const close = () => nav("/transactions" + path.search);
  if (id !== null && (query.isPending || query.error || !query.data))
    return (
      <Dialog open fullWidth onClose={close}>
        <DialogTitle>
          交易详情
          <IconButton aria-label="关闭" onClick={close} sx={{ float: "right" }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <Failure error={query.error} retry={() => query.refetch()} />
          ) : (
            <Alert severity="error">记录不存在或没有访问权限。</Alert>
          )}
        </DialogContent>
      </Dialog>
    );
  return (
    <EditorForm
      key={id ?? "new"}
      original={query.data ?? null}
      hidden={hidden}
    />
  );
}
function EditorForm({
  original,
  hidden,
}: {
  original: Transaction | null;
  hidden: boolean;
}) {
  const form = useForm<Payload>({
    defaultValues: original
      ? {
          ...original,
          merchant: original.merchant || "",
          notes: original.notes || "",
          payment_id: original.payment_id || "",
        }
      : fresh(),
  });
  const entries = useFieldArray({
    control: form.control,
    name: "entries",
    keyName: "fieldKey",
  });
  const values = form.watch();
  const api = useApi();
  const accounts = useAccounts();
  const nav = useNavigate();
  const path = useLocation();
  const cache = useQueryClient();
  const mobile = useMediaQuery("(max-width:599px)");
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState("");
  const [saved, setSaved] = useState(original);
  const [bypass, setBypass] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = form.formState.isDirty;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !bypass && dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (errors.length) errorRef.current?.focus();
  }, [errors]);
  const sum = totals(values.entries);
  const close = () => nav("/transactions" + path.search);
  const mutation = useMutation({
    mutationFn: async (next: boolean) => ({
      data: await api.save(
        saved?.id ?? null,
        saved?.updated_at ?? null,
        form.getValues(),
      ),
      next,
    }),
    onSuccess: async ({ data, next }) => {
      setSaved(data);
      form.reset(data);
      setErrors([]);
      setSuccess("保存成功");
      setUncertain(false);
      await cache.invalidateQueries({
        predicate: (q) =>
          ["transactions", "transaction", "overview"].includes(
            String(q.queryKey[0]),
          ),
      });
      if (next) {
        setBypass(true);
        const filters = Object.fromEntries(new URLSearchParams(path.search));
        const page = await api.list(
          { ...filters, review: filters.review || "needed" },
          null,
        );
        const other = page.items.find((t) => t.id !== data.id);
        nav(
          other
            ? "/transactions/" + other.id + path.search
            : "/transactions" + path.search,
          { replace: true },
        );
      } else if (!original) {
        setBypass(true);
        nav("/transactions/" + data.id + path.search, { replace: true });
      }
    },
    onError: (e) => {
      setErrors([errorMessage(e)]);
      if (
        /fetch|network|timeout|Failed|Load failed/i.test(
          e instanceof Error ? e.message : "",
        )
      )
        setUncertain(true);
    },
  });
  const submit = (next = false) => {
    setSuccess("");
    const problems = validatePost(form.getValues());
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    mutation.mutate(next);
  };
  const addRefund = () => {
    if (!amountSchema.safeParse(refundAmount).success) {
      setErrors(["退款金额必须为正数，最多两位小数"]);
      return;
    }
    const balances = new Map<number, Decimal>();
    for (const e of values.entries) {
      if (e.account_id && amountSchema.safeParse(e.amount).success)
        balances.set(
          e.account_id,
          (balances.get(e.account_id) || new Decimal(0)).plus(
            e.direction === "借" ? e.amount : new Decimal(e.amount).negated(),
          ),
        );
    }
    const expense = [...balances].find(
      ([id, n]) =>
        n.gt(0) && accounts.data?.find((a) => a.id === id)?.type === "支出",
    );
    const payment = [...balances].find(
      ([id, n]) =>
        n.lt(0) &&
        ["资产", "负债"].includes(
          accounts.data?.find((a) => a.id === id)?.type || "",
        ),
    );
    if (!expense || !payment || balances.size !== 2) {
      setErrors(["这笔交易包含复杂分录，请在同一交易中手工增加退款借贷分录。"]);
      setRefundOpen(false);
      return;
    }
    const amount = new Decimal(refundAmount);
    if (amount.gt(expense[1]) || amount.gt(payment[1].abs())) {
      setErrors(["退款金额不能超过当前净支出"]);
      return;
    }
    entries.append([
      { direction: "借", account_id: payment[0], amount: amount.toFixed(2) },
      { direction: "贷", account_id: expense[0], amount: amount.toFixed(2) },
    ]);
    form.setValue(
      "status",
      amount.eq(expense[1]) ? "refund" : "partial_refund",
      { shouldDirty: true },
    );
    setRefundOpen(false);
    setRefundAmount("");
    setErrors([]);
  };
  return (
    <>
      <Dialog
        open
        fullScreen={mobile}
        maxWidth="sm"
        fullWidth
        onClose={() => {
          if (!mutation.isPending) close();
        }}
        transitionDuration={
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : { enter: 240, exit: 180 }
        }
        slotProps={{
          paper: {
            sx: {
              maxHeight: { xs: "100dvh", sm: "92dvh" },
              borderRadius: { xs: 0, sm: 3 },
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {saved ? "补全交易 #" + saved.id : "记一笔"}
          <IconButton
            aria-label="关闭编辑"
            disabled={mutation.isPending}
            onClick={close}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            {errors.length > 0 && (
              <Alert severity="error" ref={errorRef} tabIndex={-1}>
                {errors.map((e, i) => (
                  <Box key={i}>{e}</Box>
                ))}
                {saved &&
                  errors.some(
                    (e) => e.includes("更新") || e.includes("请求"),
                  ) && (
                    <Button
                      color="inherit"
                      onClick={async () => {
                        const latest = await api.transaction(saved.id);
                        if (
                          latest &&
                          window.confirm("重新载入会替换当前输入，是否继续？")
                        ) {
                          setSaved(latest);
                          form.reset(latest);
                          setUncertain(false);
                          setErrors([]);
                        }
                      }}
                    >
                      重新载入
                    </Button>
                  )}
              </Alert>
            )}
            {uncertain && (
              <Alert severity="warning">
                网络中断，保存结果尚未确认。请先在流水中核对，避免重复新增。
              </Alert>
            )}
            {success && (
              <Alert severity="success" role="status">
                {success}
              </Alert>
            )}
            {hidden && (
              <Alert severity="info">编辑时显示金额，关闭后恢复隐藏。</Alert>
            )}
            <fieldset
              disabled={mutation.isPending}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <Stack spacing={2.5}>
                <TextField
                  type="datetime-local"
                  label="交易时间（北京时间）"
                  value={
                    values.occurred_at ? localDateTime(values.occurred_at) : ""
                  }
                  onChange={(e) => {
                    try {
                      form.setValue(
                        "occurred_at",
                        fromLocalDateTime(e.target.value),
                        { shouldDirty: true },
                      );
                    } catch {
                      form.setValue("occurred_at", "", { shouldDirty: true });
                    }
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="商户 / 交易摘要"
                  {...form.register("merchant")}
                  autoFocus={!saved}
                />
                <TextField
                  label="备注"
                  multiline
                  minRows={2}
                  {...form.register("notes")}
                />
                <Stack direction="row" spacing={2}>
                  <TextField
                    select
                    label="交易状态"
                    {...form.register("status")}
                    slotProps={{ select: { native: true } }}
                  >
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="支付渠道"
                    {...form.register("payment_method")}
                    slotProps={{ select: { native: true } }}
                  >
                    {["direct", "支付宝", "微信", "云闪付", "Apple"].map(
                      (v) => (
                        <option key={v} value={v}>
                          {v === "direct" ? "直接交易" : v}
                        </option>
                      ),
                    )}
                  </TextField>
                </Stack>
                <TextField
                  label="支付流水号（可选）"
                  {...form.register("payment_id")}
                />
                <Divider />
                <Box>
                  <Typography variant="h6">分录与科目</Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    支出：借记支出科目，贷记付款账户；收入则借记收款账户，贷记收入科目。
                  </Typography>
                </Box>
                {accounts.isPending ? (
                  <Loading />
                ) : accounts.error ? (
                  <Failure
                    error={accounts.error}
                    retry={() => accounts.refetch()}
                  />
                ) : (
                  entries.fields.map((f, i) => (
                    <Box
                      key={f.fieldKey}
                      sx={{
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 3,
                        p: 2,
                      }}
                    >
                      <Stack spacing={2}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center" }}
                        >
                          <Typography color="text.secondary" sx={{ flex: 1 }}>
                            分录 {i + 1}
                          </Typography>
                          <TextField
                            select
                            label="方向"
                            {...form.register(`entries.${i}.direction`)}
                            sx={{ width: 105 }}
                            slotProps={{ select: { native: true } }}
                          >
                            <option value="借">借</option>
                            <option value="贷">贷</option>
                          </TextField>
                          <IconButton
                            aria-label={`删除分录 ${i + 1}`}
                            onClick={() => entries.remove(i)}
                          >
                            <DeleteOutlined />
                          </IconButton>
                        </Stack>
                        <AccountPicker
                          accounts={accounts.data || []}
                          value={values.entries[i]?.account_id ?? null}
                          autoFocus={
                            !!saved &&
                            i === values.entries.findIndex((e) => !e.account_id)
                          }
                          onChange={(v) =>
                            form.setValue(`entries.${i}.account_id`, v, {
                              shouldDirty: true,
                            })
                          }
                        />
                        <TextField
                          label="金额（人民币）"
                          {...form.register(`entries.${i}.amount`)}
                          slotProps={{ htmlInput: { inputMode: "decimal" } }}
                        />
                        {i === 0 && entries.fields.length === 2 && (
                          <Button
                            size="small"
                            onClick={() =>
                              form.setValue(
                                "entries.1.amount",
                                values.entries[0].amount,
                                { shouldDirty: true },
                              )
                            }
                          >
                            同步金额到另一条分录
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  ))
                )}
                <Button
                  startIcon={<Add />}
                  onClick={() =>
                    entries.append({
                      direction: "借",
                      account_id: null,
                      amount: "",
                    })
                  }
                >
                  添加分录
                </Button>
                <Alert severity={sum["借"].eq(sum["贷"]) ? "info" : "warning"}>
                  借方 {money(sum["借"].toString())} / 贷方{" "}
                  {money(sum["贷"].toString())}
                  <br />
                  差额 {money(sum["借"].minus(sum["贷"]).toString())}
                </Alert>
                {saved && (
                  <Button
                    variant="outlined"
                    onClick={() => setRefundOpen(true)}
                  >
                    在本笔交易补记退款
                  </Button>
                )}
              </Stack>
            </fieldset>
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            p: 2,
            pb: "max(16px, env(safe-area-inset-bottom))",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          {saved && (
            <Button
              disabled={mutation.isPending || uncertain}
              onClick={() => submit(true)}
            >
              保存并下一笔
            </Button>
          )}
          <Button
            variant="contained"
            disabled={uncertain}
            loading={mutation.isPending}
            onClick={() => submit()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={blocker.state === "blocked"}>
        <DialogTitle>有尚未保存的修改</DialogTitle>
        <DialogContent>离开会丢失当前修改。</DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>继续编辑</Button>
          <Button color="warning" onClick={() => blocker.proceed?.()}>
            放弃并离开
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={refundOpen} onClose={() => setRefundOpen(false)}>
        <DialogTitle>补记退款</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              退款借贷分录添加到当前交易，保留原分录；报表按净额及当前交易日期计算。
            </Typography>
            <TextField
              label="退款金额"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefundOpen(false)}>取消</Button>
          <Button onClick={addRefund}>添加退款分录</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
