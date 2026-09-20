<script lang="ts">
  import { untrack } from "svelte";
  import { useQueryClient } from "@tanstack/svelte-query";
  import { Button } from "$lib/components/ui/button";
  import { useApi, useAccounts } from "$lib/context";
  import { accountIdError } from "$lib/accounts";
  import { errorMessage } from "$lib/api";
  import { keepFocusVisible } from "$lib/keep-focus-visible";
  import type { Account, AccountType } from "$lib/types";
  import AccountFields from "./AccountFields.svelte";
  import Notice from "./Notice.svelte";
  let {
    initial,
    types,
    noun,
    busy = $bindable(false),
    oncreated,
    oncancel,
  }: {
    initial: Partial<Account>;
    types: readonly AccountType[];
    noun: string;
    busy?: boolean;
    oncreated: (account: Account) => void;
    oncancel: () => void;
  } = $props();
  const api = useApi();
  const cache = useQueryClient();
  const accounts = useAccounts();
  let account = $state<Partial<Account>>(untrack(() => ({ ...initial })));
  let id = $state("");
  let error = $state("");
  let uncertain = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || uncertain) return;
    error = accountIdError(
      id,
      account.type!,
      account.subtype || "",
      accounts.data || [],
      null,
    );
    if (error) return;
    busy = true;
    try {
      const created = await api.saveAccount(null, {
        ...account,
        id: Number(id),
      });
      // Seed both account caches before selecting. A stale fetch must not remove
      // the new option, and refreshing reports must not replace transaction input.
      await cache.cancelQueries({ queryKey: ["accounts"] });
      for (const key of [["accounts", "source"], ["accounts"]]) {
        cache.setQueryData<Account[]>(key, (previous) => [
          ...(previous || accounts.data || []).filter(
            (a) => a.id !== created.id,
          ),
          created,
        ]);
      }
      void cache.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "accounts",
        refetchType: "none",
      });
      oncreated(created);
    } catch (e) {
      error = errorMessage(e);
      uncertain =
        e instanceof Error &&
        /fetch|network|timeout|Failed|Load failed/i.test(e.message);
    } finally {
      busy = false;
    }
  }
</script>

<form class="flex min-h-0 flex-1 flex-col" onsubmit={submit}>
  <div class="form-sheet-body space-y-4" use:keepFocusVisible>
    {#if error}<Notice variant="error">{error}</Notice>{/if}
    {#if uncertain}<Notice variant="warning"
        >操作待核对<Button
          variant="link"
          onclick={() => {
            void cache.invalidateQueries({ queryKey: ["accounts"] });
            oncancel();
          }}>查看{noun}</Button
        ></Notice
      >{/if}
    <fieldset disabled={busy || uncertain} class="min-w-0 space-y-4">
      <AccountFields
        bind:id
        bind:account
        {types}
        {noun}
        disabled={busy || uncertain}
      />
    </fieldset>
  </div>
  <div class="form-sheet-footer">
    <Button variant="outline" disabled={busy} onclick={oncancel}>取消</Button>
    <Button type="submit" disabled={busy || uncertain}
      >{busy ? "正在保存…" : "保存并选中"}</Button
    >
  </div>
</form>
