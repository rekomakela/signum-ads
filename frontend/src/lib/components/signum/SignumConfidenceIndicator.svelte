<script lang="ts">
  let {
    level = 'supported',
    label,
  }: {
    level?: 'supported' | 'plural' | 'speculative';
    label?: string;
  } = $props();

  const levels = {
    supported: { bars: 3, label: 'Well-supported interpretation' },
    plural: { bars: 2, label: 'One interpretation among several' },
    speculative: { bars: 1, label: 'Speculative interpretation' },
  } as const;

  const explanation =
    'How strongly the available evidence supports this result. It is not a measure of whether the interpretation is objectively true.';
</script>

<span class={`ds-confidence ds-confidence--${level}`} title={explanation}>
  <span class="ds-confidence__bars" aria-hidden="true">
    {#each [0, 1, 2] as bar}
      <span class:active={bar < levels[level].bars}></span>
    {/each}
  </span>
  <span>{label ?? levels[level].label}</span>
</span>
