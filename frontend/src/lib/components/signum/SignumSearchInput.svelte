<script lang="ts">
  let {
    value = $bindable(''),
    placeholder = 'Search cases…',
  }: {
    value?: string;
    placeholder?: string;
  } = $props();
</script>

<label class="ds-search">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m16.5 16.5 4.5 4.5"></path>
  </svg>
  <span class="sr-only">Search cases</span>
  <input type="search" bind:value {placeholder} />
</label>
