#!/bin/bash
#
# Hands the analysis of ssk-it_skanon-web over to CI, with the tests' coverage
# (docs/development.md, "Checks"):
#
#   1. turns off SonarCloud's automatic analysis, which cannot coexist with the one CI runs;
#   2. sets the SONAR_TOKEN secret of ssk-it/skanon-web, read by `.github/workflows/controles.yml`;
#   3. read only: checks the token and what SonarCloud and GitHub now report.
#
# Usage: tools/sonarcloud/setup-sonarcloud.sh
#
# The token — created beforehand in SonarCloud, My Account → Security — is asked for at the
# keyboard, without echo. It never goes through the command line, the process list, the shell
# history or the screen: curl reads it on a descriptor, gh on its standard input.
#
# Each write is announced and confirmed before it is made; what is already in place is left
# as is. The script can therefore be run again.
#
# Prerequisites: curl, jq, gh authenticated with the right to manage the repo's secrets.

set -euo pipefail

API="${API:-https://sonarcloud.io/api}"
PROJECT="ssk-it_skanon-web"
REPO="ssk-it/skanon-web"
SECRET="SONAR_TOKEN"

ok()  { echo "  ✓ $*"; }
ko()  { echo "  ✗ $*" >&2; exit 1; }
say() { echo "  · $*"; }

confirm() {
    local answer
    read -r -p "  → $* [y/N] " answer
    [ "${answer}" = "y" ] || [ "${answer}" = "Y" ]
}

for tool in curl jq gh; do
    command -v "${tool}" >/dev/null || ko "${tool} not found"
done
gh auth status >/dev/null 2>&1 || ko "gh is not authenticated: gh auth login"

# --- Token ------------------------------------------------------------------------------

read -r -s -p "  SonarCloud token (My Account → Security): " TOKEN
echo
[ -n "${TOKEN}" ] || ko "empty token"

# The token goes to curl through a configuration file read on a descriptor, never as an
# argument: an argument shows in the process list. A quote or a backslash is escaped, or it
# would close the string. SonarCloud takes the token as the user, with an empty password.
credentials() {
    local v="$1:"
    v="${v//\\/\\\\}"
    v="${v//\"/\\\"}"
    printf 'user = "%s"\n' "${v}"
}
call() {
    local method="$1" path="$2"; shift 2
    curl -sS -X "${method}" -K <(credentials "${TOKEN}") -w '\n%{http_code}' "$@" "${API}${path}"
}
# Splits the response body from its HTTP code, added as the last line by call().
body() { sed '$d' <<< "$1"; }
code() { tail -n1 <<< "$1"; }

R="$(call GET "/authentication/validate")"
[ "$(code "${R}")" = 200 ] && [ "$(body "${R}" | jq -r .valid)" = true ] \
    || ko "SonarCloud refuses this token"
ok "token accepted by SonarCloud"
echo

# --- 1. Automatic analysis --------------------------------------------------------------

echo "1. Automatic analysis of ${PROJECT}"
R="$(call GET "/autoscan/eligibility?autoEnable=false&projectKey=${PROJECT}")"
[ "$(code "${R}")" = 200 ] \
    || ko "automatic analysis unreadable (HTTP $(code "${R}")): does the token administer ${PROJECT}?"
STATE="$(body "${R}" | jq -r '.isAutoscanEnabled // .autoscanEnabled // .enabled // "unknown"')"
case "${STATE}" in
    false) ok "already off: left as is" ;;
    true)
        say "CI analysis fails while automatic analysis is on"
        if confirm "turn off the automatic analysis of ${PROJECT}?"; then
            R="$(call POST "/autoscan/activation" --data-urlencode "projectKey=${PROJECT}" --data-urlencode "enable=false")"
            case "$(code "${R}")" in 200|204) ok "automatic analysis off" ;;
                *) ko "refused (HTTP $(code "${R}"))" ;; esac
        else
            say "automatic analysis left on"
        fi ;;
    *) ko "SonarCloud did not say whether automatic analysis is on: turn it off in Administration → Analysis Method" ;;
esac
echo

# --- 2. GitHub secret -------------------------------------------------------------------

echo "2. Secret ${SECRET} of ${REPO}"
# A secret cannot be read back: one already set is offered for replacement, not taken for good.
if gh secret list --repo "${REPO}" --json name --jq '.[].name' | grep -qx "${SECRET}"; then
    say "${SECRET} is already set; it cannot be read back to check it"
    WRITE="replace ${SECRET} of ${REPO} with this token?"
else
    WRITE="set ${SECRET} on ${REPO} (Actions secrets, used by the analysis step only)?"
fi
if confirm "${WRITE}"; then
    printf '%s' "${TOKEN}" | gh secret set "${SECRET}" --repo "${REPO}" --app actions
    ok "${SECRET} set"
else
    say "${SECRET} left as is"
fi
unset TOKEN
echo

# --- 3. Read-only checks ----------------------------------------------------------------

echo "3. Checks"
gh secret list --repo "${REPO}" --json name,updatedAt \
    --jq ".[] | select(.name == \"${SECRET}\") | \"  ✓ ${SECRET} set, updated \(.updatedAt)\"" \
    | grep . || say "${SECRET} absent from ${REPO}"
say "the next run of Checks on a branch of ${REPO} says whether the analysis goes through"
echo
echo "Done."
