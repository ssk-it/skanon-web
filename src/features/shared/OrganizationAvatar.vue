<script setup lang="ts">
import { computed, ref, watch } from "vue";

/**
 * The avatar of the organisation (or account) that owns a repo.
 *
 * Served by `avatars.githubusercontent.com`, which counts against no API quota: a repo's visual identity therefore does not cost one of the sixty hourly requests. `?s=` requests the right size, the CDN taking care of the resizing.
 *
 * An avatar that does not arrive — deleted account, network down, blocker — must break nothing: the fallback is a badge bearing the initial, of the same size, so that the list does not shift.
 */
const props = withDefaults(
  defineProps<{
    owner: string;
    /** Side requested from the CDN, in display pixels. */
    size?: number;
  }>(),
  { size: 18 },
);

const url = computed(() => {
  // Requesting double on a dense screen costs little and avoids a blurry avatar; beyond 3 the gain is no longer visible.
  const side = Math.round(props.size * Math.min(devicePixelRatio || 1, 3));
  return `https://avatars.githubusercontent.com/${encodeURIComponent(props.owner)}?s=${side}`;
});

// Failure belongs to a URL, not to the component: switching repos must give the image another chance rather than keep the previous one's fallback.
const failed = ref(false);
watch(url, () => (failed.value = false));

const initialValue = computed(() => props.owner.charAt(0));
</script>

<template>
  <span class="avatar-organisation">
    <span v-if="failed" class="repli" aria-hidden="true">{{
      initialValue
    }}</span>
    <img
      v-else
      class="avatar"
      :src="url"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
  </span>
</template>

<style scoped>
.avatar-organisation {
  display: inline-flex;
  flex: none;
}
.avatar,
.repli {
  width: var(--taille-avatar, 18px);
  height: var(--taille-avatar, 18px);
  border-radius: 50%;
  object-fit: cover;
}
.repli {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--mat-sys-surface-container-highest);
  color: var(--mat-sys-on-surface-variant);
  font-size: calc(var(--taille-avatar, 18px) * 0.58);
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}
</style>
