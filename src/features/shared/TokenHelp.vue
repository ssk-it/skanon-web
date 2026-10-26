<script setup lang="ts">
import { useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { PLATFORM } from "../../platform/platform-token";
import UiIcon from "../../ui/UiIcon.vue";
import RichText from "./RichText.vue";
import { tokenHelpMessages } from "./token-help.messages";

const onDesktop = inject(PLATFORM).target === "bureau";
const t = useMessages(tokenHelpMessages);

/**
 * How to create a GitHub access token.
 *
 * This content lives in the application rather than in a file of the repo: it is read at the precise moment one needs it, by someone who will not go looking for documentation elsewhere.
 *
 * `pasteWhere` says where to paste the created token: « ici » in sign-in, by default, elsewhere where the help is read without an input field. The caller gives it in the displayed language.
 */
defineProps<{ pasteWhere?: string }>();
</script>

<template>
  <section class="aide-jeton aide">
    <h3>{{ t().title }}</h3>

    <ol class="etapes">
      <li v-for="(step, i) in t().steps(pasteWhere ?? t().here)" :key="i">
        <RichText :parts="step" />
      </li>
    </ol>

    <table class="permissions">
      <thead>
        <tr>
          <th>{{ t().permission }}</th>
          <th>{{ t().toRead }}</th>
          <th>{{ t().toWrite }}</th>
        </tr>
      </thead>
      <tbody>
        <!-- GitHub's permission names and levels, as its page shows them. -->
        <tr>
          <td><strong>Contents</strong></td>
          <td>Read-only</td>
          <td>Read and write</td>
        </tr>
        <tr>
          <td><strong>Issues</strong></td>
          <td>Read-only</td>
          <td>Read-only</td>
        </tr>
        <tr>
          <td><strong>Pull requests</strong></td>
          <td>—</td>
          <td>Read and write</td>
        </tr>
      </tbody>
    </table>

    <div class="note">
      <UiIcon name="help_outline" />
      <div>
        <p>
          <strong>{{ t().whyBothTitle }}</strong
          ><RichText :parts="t().whyBoth" />
        </p>
        <p>{{ t().noUncheckedMerge }}</p>
      </div>
    </div>

    <div class="note">
      <UiIcon name="help_outline" />
      <div>
        <p>
          <strong>{{ t().whyIssuesTitle }}</strong
          ><RichText :parts="t().whyIssues" />
        </p>
      </div>
    </div>

    <div class="note">
      <UiIcon name="shield" />
      <div>
        <p>
          <strong>{{ t().leastTitle }}</strong
          >{{ t().least(onDesktop) }}
        </p>
        <p>{{ t().readOnly }}</p>
      </div>
    </div>

    <div class="note">
      <UiIcon name="help_outline" />
      <div>
        <p>
          <strong>{{ t().publicTitle }}</strong
          >{{ t().public }}
        </p>
        <p><RichText :parts="t().history" /></p>
      </div>
    </div>

    <p class="revoquer"><RichText :parts="t().revoke" /></p>
  </section>
</template>

<style scoped>
/* A line of about 75 characters, that of RG-mesure-de-lecture: the panel hosting it is wider, and the table follows it. */
.aide {
  max-width: 75ch;
}
h3 {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}
.etapes {
  margin: 0 0 20px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
/* The phrases are drawn by `RichText`: their strong words and links are reached through it. */
.etapes :deep(strong) {
  color: var(--mat-sys-on-surface);
  font-weight: 600;
}
.etapes li::marker {
  color: var(--mat-sys-outline);
}
.aide-jeton :deep(a) {
  color: var(--mat-sys-primary);
  text-decoration: none;
  white-space: nowrap;
}
.aide-jeton :deep(a:hover) {
  text-decoration: underline;
}
.aide-jeton :deep(a .material-symbols-outlined) {
  font-size: 13px;
  width: 13px;
  height: 13px;
  vertical-align: -1px;
}
.permissions {
  width: 100%;
  margin: 16px 0;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 7px 10px;
    text-align: left;
    border-bottom: 1px solid var(--mat-sys-outline-variant);
  }
  th {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--mat-sys-on-surface-variant);
  }
  /* The two usage columns have the same width: comparing them at a glance is the whole point of the table. */
  th:not(:first-child),
  td:not(:first-child) {
    width: 30%;
  }
}
.note {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  padding: 13px 15px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container);

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--mat-sys-on-surface-variant);
  }
  p + p {
    margin-top: 8px;
  }
  strong {
    color: var(--mat-sys-on-surface);
  }
  > .material-symbols-outlined {
    flex: none;
    font-size: 19px;
    width: 19px;
    height: 19px;
    color: var(--mat-sys-on-surface-variant);
  }
}
.note :deep(strong) {
  color: var(--mat-sys-on-surface);
}
.revoquer {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
</style>
