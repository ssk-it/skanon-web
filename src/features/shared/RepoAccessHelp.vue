<script setup lang="ts">
import { computed } from "vue";
import { TokenService } from "../../core/github/token.service";
import { useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import UiButton from "../../ui/UiButton.vue";
import UiIcon from "../../ui/UiIcon.vue";
import { repoAccessHelpMessages } from "./repo-access-help.messages";
import RichText from "./RichText.vue";

/**
 * How to give a token access to the repo it does not open.
 *
 * Shown where the failure is observed rather than in the creation help: whoever reads it already has a token, and it is that token which needs correcting. Correcting it on the platform keeps its value — nothing to re-enter here, except when the repo belongs to another owner than the token's.
 */
const props = defineProps<{ repoRef: { owner: string; repo: string } }>();

/** Asks to open the token input. */
const emit = defineEmits<{ replace: [] }>();

const tokens = inject(TokenService);
const t = useMessages(repoAccessHelpMessages);

const fullName = computed(() => `${props.repoRef.owner}/${props.repoRef.repo}`);

/**
 * A classic token has neither a repo selection nor an owner: the steps for a fine-grained token would find nothing to set there.
 */
const classic = computed(() => tokens.value()?.startsWith("ghp_") ?? false);
</script>

<template>
  <section class="aide-acces-depot aide">
    <h3>{{ t().title(fullName) }}</h3>

    <template v-if="classic">
      <p class="intro">{{ t().classicIntro }}</p>
      <ol class="etapes">
        <li
          v-for="(step, i) in t().classicSteps(fullName, repoRef.owner)"
          :key="i"
        >
          <RichText :parts="step" />
        </li>
      </ol>
    </template>
    <template v-else>
      <ol class="etapes">
        <li
          v-for="(step, i) in t().fineGrainedSteps(fullName, repoRef.owner)"
          :key="i"
        >
          <RichText :parts="step" />
        </li>
      </ol>

      <div class="note">
        <UiIcon name="schedule" />
        <p><RichText :parts="t().approval(repoRef.owner)" /></p>
      </div>
    </template>

    <UiButton @click="emit('replace')">
      <UiIcon name="key" />
      {{ t().another }}
    </UiButton>
  </section>
</template>

<style scoped>
.aide {
  max-width: 62ch;
  padding: 16px 18px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container);
  text-align: left;
}
h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--mat-sys-on-surface);
}
.intro {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.etapes {
  margin: 0 0 14px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
/* The phrases are drawn by `RichText`: their strong words and links are reached through it. */
.aide-acces-depot :deep(strong) {
  color: var(--mat-sys-on-surface);
  font-weight: 600;
}
.etapes li::marker {
  color: var(--mat-sys-on-surface-variant);
}
.aide-acces-depot :deep(a) {
  color: var(--mat-sys-primary);
  text-decoration: none;
  white-space: nowrap;
}
.aide-acces-depot :deep(a:hover) {
  text-decoration: underline;
}
.aide-acces-depot :deep(a .material-symbols-outlined) {
  font-size: 13px;
  width: 13px;
  height: 13px;
  vertical-align: -1px;
}
.note {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  margin-bottom: 8px;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--mat-sys-on-surface-variant);
  }
  > .material-symbols-outlined {
    flex: none;
    font-size: 19px;
    width: 19px;
    height: 19px;
    color: var(--mat-sys-on-surface-variant);
  }
}
</style>
