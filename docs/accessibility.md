# Accessibility

## The rule in one sentence

**Skanon aims at level AA of WCAG 2.2, in both its deliverables.** The web version and the desktop application render the same interface — WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux, the browser for the web —: an accessibility defect is one everywhere, and is fixed once, in the shared code.

The commitment is a product decision, recorded in the specification by [ssk-canon#2026-064](https://ssk-canon.s3-website.fr-par.scw.cloud/ssk-it/ssk-canon/cadrages/2026-064): `ADR-accessibilite` states the choice, `RG-accessibilite-aa` what every view must hold. This file says how each criterion translates into Skanon's code. The reference text remains the W3C's: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), and its French counterpart, the [RGAA](https://accessibilite.numerique.gouv.fr/), which takes up its A and AA criteria.

## What the kit already does

Before writing a component, check whether `src/ui/` provides it: its components already carry what follows, and a view that uses them inherits it.

| Component                          | What it guarantees                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiIcon`                           | `aria-hidden` by default: the icon is decorative, and a button that has only the icon carries its name in `aria-label`                                                |
| `UiDialogHost`, `UiDialog`         | focus placed in the dialog on opening, trapped while it is open, then returned to the element that had it; the rest `inert`                                           |
| `UiButton`, `UiMenu`, `UiCheckbox` | a focus indicator on `:focus-visible`, distinct from hover                                                                                                            |
| `UiSpinner`                        | `role="progressbar"` named by its `label` (« Chargement en cours » by default, in the displayed language), and the animation suspended under `prefers-reduced-motion` |
| `LocaleService`                    | the document's `lang`, that of the displayed language (`fr` in `index.html` until it is chosen)                                                                       |

A badly dressed native component is better than a well dressed `div`: `<button>`, `<a href>`, `<input>`, `<select>`, `<details>` bring their role, their focus and their keyboard without a line of code.

## Perceivable

**Text alternatives (1.1.1).** Every meaningful image has an `alt` that says what it teaches, not what it shows; a decorative image has `alt=""` — as does a project's symbol, whose name is always written next to it (`RG-identite-affichee`). Icons go through `UiIcon`, decorative. A diagram rendered from a scoping (`diagram.ts`) keeps its source text accessible: the graphic must not be the only carrier of the information.

**Structure (1.3.1, 2.4.6).** A heading is an `<h1>`…`<h6>`, in order, without skipping a level; a list is a `<ul>` or an `<ol>`; a data table has its `<th>` and its `scope`. The shell carries its landmarks (`<header>`, `<nav>`, `<main>`) once each. The rendered Markdown (`RenderedMarkdown.vue`) keeps the scoping's heading hierarchy: do not rewrite it for size, size is set in CSS.

**Order (1.3.2).** The DOM order is the reading order. A layout that moves a block visually (`order`, `grid-area`, absolute positioning) must not make the two diverge.

**Orientation and fields (1.3.4, 1.3.5).** No view locks itself to an orientation. A field that collects the user's data carries its `autocomplete` (`username`, `email`…); a token does not (`autocomplete="off"`), it is not suggested.

**Colour never carries the information alone (1.4.1).** Statuses and impact operations have a semantic colour (`--pc-statut-*`, `--pc-op-*`), but `StatusChip` and `OperationChip` also write their label: colour never replaces the name, and only the families `RG-couleur-porteuse` names use one. A link in a paragraph is underlined, not only coloured.

**Contrast (1.4.3, 1.4.11).** Text reads at 4.5:1 against its background, 3:1 above 18.66 px bold or 24 px. Interface components — a field's border, the focus indicator, a checkbox's state — hold 3:1 against what surrounds them. Colours come from the tokens of `src/styles.css`, never from a hard-coded value; a token added or changed is measured in **both themes** of `RG-theme-choisi`, light and dark, each against the backgrounds where it is used. `--mat-sys-outline-variant` is made to separate, not to delimit a field: it does not hold 3:1. A contrast is measured on the rendered page, not by reasoning on the code that produces it ([ssk-canon#2026-028](https://ssk-canon.s3-website.fr-par.scw.cloud/ssk-it/ssk-canon/cadrages/2026-028), decision 02).

**Resize and reflow (1.4.4, 1.4.10, 1.4.12).** Text sizes are written in `rem`, to follow the user's setting. A view stays usable at 200 % zoom, and at 320 CSS px wide without horizontal scrolling — except code blocks and wide tables, which scroll in their own frame (`CodeBlock.vue`). Nothing breaks if the user forces line height to 1.5, paragraph spacing to twice the text size, letter spacing to 0.12 em and word spacing to 0.16 em: no fixed height on a text container.

**Content on hover or focus (1.4.13).** A tooltip appears on focus as on hover, closes with Escape without moving focus, and stays open while the pointer is over it.

## Operable

**Everything by keyboard (2.1.1, 2.1.2).** Every action can be done by keyboard, in an order that follows the page (2.4.3). A clickable element that is not a `<button>` or an `<a>` is a defect, not a case to patch with `tabindex="0"` and a key listener. No trap: only a modal dialog holds focus, and Escape closes it. A positive `tabindex` is forbidden.

**Shortcuts (2.1.4).** A single printable-key shortcut is forbidden, or can be turned off. Skanon's shortcuts combine a modifier — ⌘K / Ctrl+K for search, doubled by an icon in the bar (`RG-recherche-a-portee-de-clavier`) — and are declared by `aria-keyshortcuts`.

**No time limit (2.2.1, 2.2.2).** A notification that disappears on its own leaves time to read it, or remains reachable elsewhere. Nothing blinks or scrolls on its own for more than five seconds without a way to stop it.

**Motion (2.3.1, and 2.3.3 as good practice).** No animation flashes more than three times a second. Every non-essential animation — smooth scrolling, transitions, rotation — stops under `prefers-reduced-motion: reduce`. Transitions and smooth scrolling do so by default, through a shared rule of `src/styles.css`; a wait that runs forever — `UiSpinner`, `UiProgressBar` — slows down in its component, and `src/styles.test.ts` refuses an infinite animation that does not provide for it.

**Finding one's way (2.4.1, 2.4.2, 2.4.4).** A skip link, first element of the page and visible on the first Tab, leads to the main content (`App.vue`). Each route gives the document a `<title>` that names it — the scoping or the rule displayed, then « Skanon ». A link's text says where it leads; « here » or « see » do not, and a link that opens outside (`ExternalLink.vue`) says so in its accessible name.

**Focus visible, and not obscured (2.4.7, 2.4.11).** The focus indicator is always visible, on `:focus-visible`, and is never removed by an `outline: none` without a replacement. The focused element is never entirely hidden by the top bar, a banner or a sticky panel: `App.vue` publishes the bar's height (`--pc-hauteur-barre`), which `scroll-padding-top` uses, and scrolls the page down under a focus the bar would cover: WebKit, the desktop engine on macOS, does not scroll to an element it believes visible.

**Pointer (2.5.1 to 2.5.3, 2.5.7, 2.5.8).** No multi-finger or path-based gesture is the only means to act; an action triggers on release, not on press. A drag and drop always has a single-click alternative. A button's accessible name contains its visible label, in the same order. A target is at least 24 × 24 CSS px, or leaves around itself a space that brings it there.

## Understandable

**Language (3.1.1, 3.1.2).** The document's `lang` is that of the displayed language. A passage in another language — a quotation, a GitHub error message rendered as is — carries its `lang`.

**No surprise (3.2.1, 3.2.2).** Taking focus or changing a field's value does not navigate, open anything or submit anything: an action needs a button.

**Consistency (3.2.3, 3.2.4, 3.2.6).** Navigation, bar actions and help stay in the same place and under the same name from one view to the next; the shell (`App.vue`) carries them, and the extension points (`toolbarActions`, `help`) add to them without moving them.

**Forms (3.3.1 to 3.3.4).** Each field has a visible, associated `<label>`, not only a `placeholder`; `UiFieldFrame`, on which `UiTextField` rests, sets it as soon as it is given a `label`. An error is written in text, next to the field, tied by `aria-describedby` — `UiTextField` and `UiSelect` do so for their error and their hint —, with `aria-invalid="true"`, and says how to fix it. An action that writes to GitHub — commit, deletion — is confirmed (`ConfirmationDialog`) or can be undone.

**Redundant entry (3.3.7).** Information already given in a flow — the repo, the organization — is carried over or offered, rather than asked again.

**Accessible authentication (3.3.8).** Signing in asks for no copying, memorizing or solving anything. The token field accepts pasting; a password manager can fill it; the passkey that seals tokens on the web is a means the criterion admits.

## Robust

**Name, role, value (4.1.2).** A kit component that is not native — `UiMenu`, `UiSelect`, `UiAutocomplete` — follows the matching [APG](https://www.w3.org/WAI/ARIA/apg/patterns/) pattern: its role, its states (`aria-expanded`, `aria-selected`, `aria-activedescendant`) and its keyboard. No ARIA is better than wrong ARIA: an added role promises a keyboard behaviour that must be kept.

**Status messages (4.1.3).** Information that arrives without moving focus — reload finished, version ready, GitHub quota exhausted — is in a `role="status"` region (or `role="alert"` for a blocking error), present in the DOM before its text enters it: a region created with its message is not announced.

## Checking

**The automatic checks**, on every pull request:

| Check                | File                                                  | What it enforces                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token contrast       | `src/styles.test.ts` (jsdom)                          | 4.5:1 for each text colour on each of its backgrounds, 3:1 for `--mat-sys-outline`, in both themes; a domain's colour at every hue it can take; and that no source writes text with a colour outside this list                                                                                                                                                                                                                     |
| axe-core             | `src/accessibility.browser.test.ts` (headless WebKit) | the WCAG 2.2 A and AA criteria axe can see, on the whole application — shell included — at each page of the test specification (`src/features/test-specification.ts`, pages listed in `src/accessibility-testing.ts`), in both themes; contrast is measured there on the rendered page                                                                                                                                             |
| Dialogs              | same file                                             | axe on each dialog opened over a page — token, repo, link, confirmation, search empty and with results                                                                                                                                                                                                                                                                                                                             |
| Focus not obscured   | same file                                             | at 1280, 800 and 375 px, each focusable element of the content, focused while going back up the page, ends up below the bar and not under it                                                                                                                                                                                                                                                                                       |
| Window controls      | `src/title-bar.browser.test.ts`                       | where the system draws the window's controls over the bar (macOS, on the desktop), the logo starts after them, no bar button goes alone to a second line between 720 and 1280 px, the brand keeps its name for the screen reader, and the focused skip link stays clear of them                                                                                                                                                    |
| Keyboard             | `src/keyboard.browser.test.ts`                        | nothing clickable — link cursor or command role — escapes Tab; no positive `tabindex`; each reachable element changes appearance on focus. The traversal is read rather than replayed: headless WebKit does not tab to links and never considers the document active, so the test replays the `:focus`, `:focus-visible` and `:focus-within` rules on an attribute, and the browser's default outline at the bottom of the cascade |
| Zoom and spacing     | `src/zoom.browser.test.ts`                            | at 640 px wide — a 1280 screen zoomed to 200 % — and under the forced text spacing of 1.4.12, nothing overflows and no text is clipped by its box, unless it can be read whole in a `title`                                                                                                                                                                                                                                        |
| Authoring, signed in | `src/authoring.browser.test.ts`                       | axe on new scoping, resumption and settings, a token in place and the scoping to resume served; the missing fields announced; no overflow at 200 % zoom                                                                                                                                                                                                                                                                            |
| Reduced motion       | `src/styles.test.ts` (jsdom)                          | the shared rule that stops transitions and smooth scrolling, and the slowing of each infinite animation                                                                                                                                                                                                                                                                                                                            |
| Reflow               | `src/accessibility.browser.test.ts`                   | at 320 px wide, no element exceeds the page outside a frame that scrolls; the failure names the overflowing elements                                                                                                                                                                                                                                                                                                               |

A new page is added to `PAGES` in `src/accessibility-testing.ts` — every browser check takes it up —, a form that needs a token to `FORMS` in `src/authoring.browser.test.ts`, a new text colour to `TEXTS` in `src/styles.test.ts` with the backgrounds it is written on. None of these checks hears what a screen reader announces, nor judges the meaning of a text alternative: the rest of this section covers that.

**In the behaviour tests** ([practices.md](practices.md#tests)):

- in jsdom, find elements by their role and accessible name rather than by a class: a test that finds `getByRole("button", { name: "Recharger depuis GitHub" })` also checks the name;
- exercise the keyboard: Tab, Shift+Tab, Escape, Enter and a menu's arrows, focus returned when a dialog closes;
- in the headless browser (`*.browser.test.ts`), what jsdom does not see and axe does not check: target size, focus hidden under a sticky bar.

**By hand, before merging a new or reworked view:** listen to it with the system's screen reader — VoiceOver on macOS, NVDA on Windows, Orca on Linux —, in the desktop application as on the web, and judge whether what it announces is understood, not only whether it announces something. It is the only point the checks do not hold: driving a real screen reader takes the machine's keyboard and voice.

A defect found is fixed in the kit if it comes from the kit, in the view otherwise; it is reported if it comes from a component ported from ssk-canon-pwa, and fixed separately.
