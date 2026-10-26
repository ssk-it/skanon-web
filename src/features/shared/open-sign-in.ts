import { inject } from "../../core/injection";
import { DialogService } from "../../ui/dialog.service";

/**
 * Opens sign-in to GitHub, from the bar as from the home page. Resolves `true` when access has changed.
 *
 * The dialog is loaded on opening, not at startup: it carries the token input, a weight everyone would pay for a button not always clicked. It is wider than the default 560 px: the token creation help holds a table of permissions there, which a narrow panel squeezes.
 */
export async function openSignIn(): Promise<boolean> {
  const { default: TokenDialog } = await import("./TokenDialog.vue");
  const change = await inject(DialogService).open<boolean>(TokenDialog, {
    focus: "dialogue",
    width: "680px",
    maxWidth: "calc(100vw - 32px)",
  });
  return change === true;
}
