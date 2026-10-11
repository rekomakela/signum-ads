<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    active = false,
    count,
    onclick,
  }: {
    children: Snippet;
    active?: boolean;
    count?: number;
    onclick?: () => void;
  } = $props();
</script>

<button class="ds-filter-chip" class:active type="button" aria-pressed={active} {onclick}>
  {@render children()}
  {#if count !== undefined}<span>{count}</span>{/if}
</button>
