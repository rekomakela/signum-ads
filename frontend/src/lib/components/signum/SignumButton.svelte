<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    href,
    variant = 'secondary',
    size = 'md',
    disabled = false,
    fullWidth = false,
    onclick,
  }: {
    children: Snippet;
    href?: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'quiet';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    fullWidth?: boolean;
    onclick?: () => void;
  } = $props();
</script>

{#if href}
  <a
    class={`ds-button ds-button--${variant} ds-button--${size}`}
    class:ds-button--full={fullWidth}
    {href}
    aria-disabled={disabled}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    class={`ds-button ds-button--${variant} ds-button--${size}`}
    class:ds-button--full={fullWidth}
    {disabled}
    {onclick}
  >
    {@render children()}
  </button>
{/if}
