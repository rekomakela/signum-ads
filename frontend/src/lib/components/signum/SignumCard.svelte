<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    tone = 'surface',
    interactive = false,
    class: className = '',
  }: {
    children: Snippet;
    tone?: 'surface' | 'recessed' | 'accent' | 'observation' | 'interpretation';
    interactive?: boolean;
    class?: string;
  } = $props();
</script>

<div class={`ds-card ds-card--${tone} ${interactive ? 'ds-card--interactive' : ''} ${className}`}>
  {@render children()}
</div>
