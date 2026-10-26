<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import {
  BootstrapService,
  type TargetCheck,
} from "../../core/repo/bootstrap.service";
import { RepoConfig } from "../../core/repo/repo-config";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiButton from "../../ui/UiButton.vue";
import UiIcon from "../../ui/UiIcon.vue";
import UiTextField from "../../ui/UiTextField.vue";
import { createSpecificationMessages } from "./create-specification.messages";

/**
 * Creating a specification from the home page (RG-amorcage-depot, scoping 2026-062).
 *
 * The application does not create the repo: creating one takes a right writing does not, which many accesses lack. It leads to the platform's creation page, checks the repo it is given — existing, empty, writable —, then opens it, where the bootstrap assistant goes on. Nothing is read before the author asks (RG-choix-projet-prealable).
 */
const bootstrap = inject(BootstrapService);
const router = useRouter();
const t = useMessages(createSpecificationMessages);

const opened = ref(false);
const input = ref("");
const checking = ref(false);
// The cause, not the message: the message follows a language switch.
const refusal = ref<Exclude<TargetCheck, "ready"> | "invalid" | null>(null);
const failure = ref<string | null>(null);

const repoRef = computed(() => RepoConfig.parseRepo(input.value));
const creationPage = computed(() =>
  repoRef.value
    ? `https://github.com/new?owner=${encodeURIComponent(repoRef.value.owner)}&name=${encodeURIComponent(repoRef.value.repo)}`
    : "https://github.com/new",
);
const error = computed(() => {
  if (refusal.value === "invalid") return t().invalidRepo;
  if (refusal.value) return t().causes[refusal.value];
  return failure.value;
});

async function check(): Promise<void> {
  const target = repoRef.value;
  refusal.value = null;
  failure.value = null;
  if (!target) {
    refusal.value = "invalid";
    return;
  }
  checking.value = true;
  try {
    const result = await bootstrap.checkTarget(target);
    if (result === "ready") {
      void router.push(
        `/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/referentiel`,
      );
      return;
    }
    refusal.value = result;
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e);
  } finally {
    checking.value = false;
  }
}
</script>

<template>
  <section class="creation">
    <UiButton
      v-if="!opened"
      class="creer"
      variant="outlined"
      @click="opened = true"
    >
      <UiIcon name="add" />
      {{ t().create }}
    </UiButton>
    <form v-else @submit.prevent="check()">
      <h2>{{ t().create }}</h2>
      <p class="aide">{{ t().intro }}</p>
      <p class="aide">
        <ExternalLink :href="creationPage">{{ t().createRepo }}</ExternalLink>
        — {{ t().createEmpty }}
      </p>
      <UiTextField
        v-model="input"
        :label="t().repoField"
        :placeholder="t().repoPlaceholder"
        name="depotACreer"
        autocomplete="off"
        :disabled="checking"
      />
      <p v-if="error" class="echec">{{ error }}</p>
      <div class="actions">
        <UiButton type="button" :disabled="checking" @click="opened = false">
          {{ t().cancel }}
        </UiButton>
        <UiButton variant="filled" type="submit" :disabled="checking">
          {{ checking ? t().checking : t().next }}
        </UiButton>
      </div>
    </form>
  </section>
</template>

<style scoped>
.creation form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.creation h2 {
  margin: 0;
  font-size: 16px;
  color: var(--mat-sys-on-surface);
}
.aide {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.creation .ui-champ {
  width: min(100%, 24rem);
}
.echec {
  margin: 0;
  font-size: 14px;
  color: var(--mat-sys-error);
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
