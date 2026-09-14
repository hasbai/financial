<script lang="ts">
  import {
    Coffee,
    Utensils,
    TrainFront,
    ShoppingBag,
    Wallet,
    ReceiptText,
    ArrowLeftRight,
  } from "@lucide/svelte";
  let {
    category = "",
    kind = "expense",
  }: { category?: string; kind?: string } = $props();
  let Icon = $derived(
    /咖啡|饮品/.test(category)
      ? Coffee
      : /餐|食品/.test(category)
        ? Utensils
        : /交通|出行/.test(category)
          ? TrainFront
          : /购物|服饰|日用/.test(category)
            ? ShoppingBag
            : kind === "income" || kind === "refund"
              ? Wallet
              : kind === "transfer"
                ? ArrowLeftRight
                : ReceiptText,
  );
</script>

<span
  class={[
    "grid size-12 shrink-0 place-items-center rounded-full",
    kind === "income" || kind === "refund"
      ? "bg-cash-in/10 text-cash-in"
      : kind === "transfer"
        ? "bg-asset/10 text-asset"
        : "bg-profit/10 text-profit",
  ]}><Icon class="size-6" aria-hidden="true" /></span
>
