<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { TokenService } from "../../core/github/token.service";
import { useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import UiButton from "../../ui/UiButton.vue";
import { passkeyUnlockMessages } from "./passkey-unlock.messages";

/**
 * How locked tokens are opened, without any window forced on load (2026-065, decision 02).
 *
 * Where the browser returns the passkey's key through its autofill, a field marked `webauthn` waits for the author: focusing it lists the passkey, picking it opens the tokens; nothing can be typed in it. Elsewhere, and always next to it, the « Unlock » button of 2026-055. A browser accepts one passkey request at a time: the button withdraws the offer before asking, and offers again if asking did not succeed.
 */
const tokens = inject(TokenService);
const t = useMessages(passkeyUnlockMessages);

/** Null until the browser said whether its autofill can offer the passkey. */
const offered = ref<boolean | null>(null);
let withdraw: AbortController | null = null;

function offer(): void {
  withdraw = new AbortController();
  void tokens.offerUnlock(withdraw.signal);
}

onMounted(async () => {
  offered.value = await tokens.canOffer();
  if (offered.value) offer();
});

onBeforeUnmount(() => withdraw?.abort());

async function unlock(): Promise<void> {
  withdraw?.abort();
  withdraw = null;
  const issue = await tokens.unlock();
  if (issue !== "ouvert" && offered.value) offer();
}

/** The field only lists the passkey: what the browser inserts without a cancellable `beforeinput` — a composition, an autofill — is emptied at once. */
function empty(event: Event): void {
  (event.target as HTMLInputElement).value = "";
}
</script>

<template>
  <!-- RG-accessibilite-aa: the field is reached with the keyboard and named for screen readers; the button stays for whoever does not use the autofill.
       `webauthn` alone, without `username`: the browser lists the passkey there and no saved password — the GitHub tokens it may keep as such. Nothing is typed in it: it is not read-only, which would exclude it from the autofill. -->
  <input
    v-if="offered"
    class="cle-d-acces"
    type="text"
    name="cle-d-acces"
    autocomplete="webauthn"
    spellcheck="false"
    :aria-label="t().field"
    :placeholder="t().placeholder"
    @beforeinput.prevent
    @input="empty"
  />
  <UiButton @click="unlock()">{{ t().unlock }}</UiButton>
  {{ t().whileOpen }}
</template>

<style scoped>
.cle-d-acces {
  width: 14ch;
  padding: 4px 8px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
}
</style>
