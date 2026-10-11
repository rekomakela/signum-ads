<script lang="ts">
  let {
    steps,
    current = 5,
  }: {
    steps: readonly string[];
    current?: number;
  } = $props();
</script>

<nav class="ds-stepper" aria-label="Analysis sequence">
  {#each steps as step, index}
    <div class:current={index === current} class:done={index < current} class="ds-stepper__step">
      <span>{String(index + 1).padStart(2, '0')}</span>
      <strong>{step}</strong>
    </div>
  {/each}
</nav>
