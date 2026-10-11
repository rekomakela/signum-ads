<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    tone = 'neutral',
    variant = 'soft',
    dot = false,
  }: {
    children: Snippet;
    tone?: 'neutral' | 'accent' | 'blue' | 'beginner' | 'intermediate' | 'advanced';
    variant?: 'soft' | 'outline' | 'bare';
    dot?: boolean;
  } = $props();
</script>

<span class={`ds-tag ds-tag--${tone} ds-tag--${variant}`}>
  {#if dot || variant === 'bare'}<span class="ds-tag__dot" aria-hidden="true"></span>{/if}
  {@render children()}
</span>
