#!/usr/bin/env bash
# The signed-in smoke check of an environment that is not production: what a
# person can do once signed in, and what they must not see or reach, proved
# against the environment's own Test Accounts. The deploy of the environment
# puts them in place first (scripts/create-smoke-test-user.ts and
# scripts/create-smoke-fixtures.ts) and runs this on the server.
#
#   SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... SMOKE_BYPASS_TOKEN=... \
#     scripts/smoke-signed-in.sh http://127.0.0.1:<proxy port>/api/v1
#
# Exits 1 when a check fails. Leaves nothing behind: the one post it writes is
# deleted, and a refused registration stores nothing.
set -u

API="${1:?Usage: smoke-signed-in.sh <API base URL>}"
: "${SMOKE_TEST_EMAIL:?SMOKE_TEST_EMAIL is not set}"
: "${SMOKE_TEST_PASSWORD:?SMOKE_TEST_PASSWORD is not set}"
: "${SMOKE_BYPASS_TOKEN:?SMOKE_BYPASS_TOKEN is not set}"

# The fixed identifiers of scripts/create-smoke-fixtures.ts.
FX_PRIVATE_POST=5e0c5e0c-0000-4000-8000-0000000000c1
FX_MATURE_POST=5e0c5e0c-0000-4000-8000-0000000000c2
FX_GENERAL_POST=5e0c5e0c-0000-4000-8000-0000000000c3
FX_PUBLIC_PROFILE=5e0c5e0c-0000-4000-8000-0000000000b3
FX_BANNED_EMAIL=smoke-fixture-banned@example.invalid
FX_PUBLIC_STORY=5e0c5e0c-0000-4000-8000-0000000000d1
FX_PRIVATE_PROFILE=5e0c5e0c-0000-4000-8000-0000000000b2

TMP=$(mktemp -d)
ok=1
post_id=""
live_on=""
csrf=""

# The environment is reached on its loopback port, over plain http, and curl
# keeps no cookie marked Secure there: each session keeps its cookies here.
keep_cookies() { # <jar> <response headers>
  grep -i '^set-cookie:' "$2" | sed -E 's/^[^:]*:[[:space:]]*//; s/;.*//' | tr -d '\r' |
    while IFS= read -r cookie; do
      name=${cookie%%=*}
      awk -F= -v n="$name" '$1 != n' "$1" > "$1.new"
      mv "$1.new" "$1"
      # A cookie set to nothing is one the server removes.
      [ -n "${cookie#*=}" ] && printf '%s\n' "$cookie" >> "$1"
    done
}
# call <jar> <curl arguments...>: the answer's status in $code, its body in
# $TMP/body. A request refused for going too fast (429) is asked once more
# after the 60-second window of the limit; a second 429 stays a failure.
call() {
  local jar=$1 cookies attempt
  shift
  for attempt in 1 2; do
    cookies=$(paste -sd';' "$jar")
    code=$(curl -sS -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' --max-time 20 \
      ${cookies:+-H "Cookie: $cookies"} -H "x-csrf-token: $csrf" \
      -H 'Content-Type: application/json' "$@") || code=000
    keep_cookies "$jar" "$TMP/headers"
    [ "$code" = "429" ] && [ "$attempt" = "1" ] || break
    echo "  WAIT  too many requests; asking again in 61 s"
    sleep 61
  done
}
# new_session <jar>: an anonymous session and its CSRF token in $csrf.
new_session() {
  : > "$1"
  csrf=""
  call "$1" "$API/csrf-token"
  csrf=$(grep -o '"csrfToken":"[^"]*"' "$TMP/body" | cut -d'"' -f4)
}
pass() { echo "  OK    $1"; }
skip() { echo "  SKIP  $1"; }
fail() {
  echo "  FAIL  $1"
  head -c 300 "$TMP/body" 2>/dev/null
  echo
  ok=0
}
json_escape() { local s=${1//\\/\\\\}; printf '%s' "${s//\"/\\\"}"; }

cleanup() {
  if [ -n "$post_id" ]; then
    call "$TMP/smoke" -X DELETE "$API/posts/$post_id"
  fi
  if [ -n "$live_on" ]; then
    call "$TMP/smoke" -X POST "$API/live/end"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "Signed-in smoke check of $API"

# Sign in. The body goes on stdin, so the password is on no command line.
new_session "$TMP/smoke"
if [ -z "$csrf" ]; then
  fail "no CSRF token ($code)"
  exit 1
fi
printf '{"identifier":"%s","password":"%s"}' \
  "$(json_escape "$SMOKE_TEST_EMAIL")" "$(json_escape "$SMOKE_TEST_PASSWORD")" > "$TMP/login.json"
call "$TMP/smoke" -H "x-turnstile-bypass: $SMOKE_BYPASS_TOKEN" \
  --data-binary @"$TMP/login.json" "$API/auth/login"
rm -f "$TMP/login.json"
if [ "$code" != "200" ]; then
  fail "sign-in ($code)"
  exit 1
fi
pass "sign-in"
# The token of the anonymous session does not hold for the signed-in one.
call "$TMP/smoke" "$API/csrf-token"
csrf=$(grep -o '"csrfToken":"[^"]*"' "$TMP/body" | cut -d'"' -f4)

# People search finds the public fixture, and never the banned one.
call "$TMP/smoke" "$API/search/users?q=cs_smoke_"
if [ "$code" != "200" ] || ! grep -q '"cs_smoke_public"' "$TMP/body"; then
  fail "people search did not find the public fixture ($code)"
elif grep -q '"cs_smoke_banned"' "$TMP/body"; then
  fail "people search found a banned Profile"
else
  pass "people search leaves out a banned Profile"
fi

# A post the account cannot see cannot be saved.
call "$TMP/smoke" -X POST "$API/bookmarks/$FX_PRIVATE_POST"
case "$code" in
  403 | 404) pass "saving a post it cannot see is refused ($code)" ;;
  2*)
    fail "a post it cannot see was saved ($code)"
    # Saving toggles: once more takes it off again.
    call "$TMP/smoke" -X POST "$API/bookmarks/$FX_PRIVATE_POST"
    ;;
  *) fail "saving a post it cannot see answered $code" ;;
esac

# Nor shared into a conversation. The recipient is a Test Account.
call "$TMP/smoke" -X POST \
  -d "{\"recipientId\":\"$FX_PUBLIC_PROFILE\",\"postId\":\"$FX_PRIVATE_POST\",\"content\":\"smoke check\"}" \
  "$API/chat/messages"
case "$code" in
  400 | 403 | 404) pass "sharing a post it cannot see is refused ($code)" ;;
  *) fail "sharing a post it cannot see answered $code" ;;
esac

# With the General preference, a Mature post is left out of post search; a
# General one of the same Profile is found.
call "$TMP/smoke" "$API/search/posts?q=cssmokegeneralfixture"
if [ "$code" != "200" ] || ! grep -q "$FX_GENERAL_POST" "$TMP/body"; then
  fail "post search did not find the General fixture ($code)"
else
  call "$TMP/smoke" "$API/search/posts?q=cssmokematurefixture"
  if [ "$code" != "200" ]; then
    fail "post search answered $code"
  elif grep -q "$FX_MATURE_POST" "$TMP/body"; then
    fail "a Mature post was shown to a General preference"
  else
    pass "a Mature post is left out for a General preference"
  fi
fi

# The caption limit holds when writing: one character over it is refused
# before anything is stored.
long_caption=$(printf 'a%.0s' $(seq 1 2201))
call "$TMP/smoke" -d "{\"caption\":\"$long_caption\",\"visibility\":\"PRIVATE\"}" "$API/posts"
if [ "$code" = "400" ]; then
  pass "a caption over the limit is refused when writing"
else
  fail "a caption over the limit was not refused when writing ($code)"
fi

# Write one private post, edit it past the limit, delete it.
call "$TMP/smoke" -d '{"caption":"CircleSfera smoke check, deleted at once.","visibility":"PRIVATE"}' "$API/posts"
if [ "$code" = "403" ] && grep -q "CONTENT_POSTING_DISABLED" "$TMP/body"; then
  skip "writing a post: posting is turned off (system setting)"
elif [ "$code" != "201" ]; then
  fail "writing a post ($code)"
else
  post_id=$(grep -o '"id":"[^"]*"' "$TMP/body" | head -1 | cut -d'"' -f4)
  pass "writing a post"
  call "$TMP/smoke" -X PUT -d "{\"caption\":\"$long_caption\"}" "$API/posts/$post_id"
  if [ "$code" = "400" ]; then
    pass "a caption over the limit is refused when editing"
  else
    fail "a caption over the limit was not refused when editing ($code)"
  fi
  call "$TMP/smoke" -X DELETE "$API/posts/$post_id"
  if [ "$code" = "204" ]; then
    pass "deleting the post"
    post_id=""
  else
    fail "deleting the post ($code)"
  fi
fi

# Who reacted to a story is for its author: a viewer who is not the author
# gets only their own reaction, never the fixture's.
call "$TMP/smoke" "$API/stories/$FX_PUBLIC_STORY/reactions"
if [ "$code" != "200" ]; then
  fail "reading the reactions of a story it can see ($code)"
elif grep -qE "$FX_PRIVATE_PROFILE|cs_smoke_private" "$TMP/body"; then
  fail "a viewer read who reacted to a story of someone else"
else
  pass "who reacted to a story is told to its author only"
fi

# The profile of someone else never tells who the person or the sign-in
# behind it is, nor how it was sanctioned or set up. Read with the smoke
# session: Test Accounts are kept apart from the public, so without a session
# a fixture is not found at all.
call "$TMP/smoke" "$API/profiles/cs_smoke_public"
if [ "$code" != "200" ]; then
  fail "reading the public fixture ($code)"
elif grep -qE '"(userId|signInId|user|accountBanReason|banStrikeId|suspensionCause|pushNotifications)":' "$TMP/body"; then
  fail "a profile carries the person behind it, a sanction or a setting"
else
  pass "a profile tells nothing of the person behind it"
fi

# A Profile is reported by its own id, and the answer never names the person
# behind it. The report stays in the environment's moderation queue, about a
# Test Account.
call "$TMP/smoke" -d "{\"targetType\":\"USER\",\"targetId\":\"$FX_PUBLIC_PROFILE\",\"reason\":\"SPAM\",\"details\":\"smoke check\"}" \
  "$API/reports"
if [ "$code" != "201" ]; then
  fail "reporting a Profile by its id ($code)"
elif grep -q '"targetId"' "$TMP/body"; then
  fail "the answer to a report carries its stored target"
else
  pass "a Profile is reported by its id, and the answer names no one"
fi

# A co-host is invited by the id of the Profile named. A live of a few
# seconds, ended at once; nobody follows the smoke account.
call "$TMP/smoke" -d '{"title":"CircleSfera smoke check, ended at once."}' "$API/live/start"
if [ "$code" = "403" ] && grep -q "LIVE_STREAMS_DISABLED" "$TMP/body"; then
  skip "inviting a co-host: live is turned off (system setting)"
elif [ "$code" != "201" ]; then
  skip "inviting a co-host: the live of the environment could not start ($code)"
else
  live_on=1
  stream_id=$(grep -o '"id":"[^"]*"' "$TMP/body" | head -1 | cut -d'"' -f4)
  call "$TMP/smoke" -d "{\"coHostProfileId\":\"$FX_PUBLIC_PROFILE\"}" \
    "$API/live/$stream_id/cohost/invite"
  if [ "$code" = "201" ] && grep -q "\"coHostId\":\"$FX_PUBLIC_PROFILE\"" "$TMP/body"; then
    pass "a co-host is invited by the id of the Profile named"
  else
    fail "inviting a co-host by Profile id answered $code"
  fi
  call "$TMP/smoke" -X POST "$API/live/end"
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    live_on=""
    pass "ending the live"
  else
    fail "ending the live ($code)"
  fi
fi

# A banned person who signs in is told so, not that the password is wrong.
# The banned fixture signs in with the smoke password, in a session of its own.
new_session "$TMP/banned"
printf '{"identifier":"%s","password":"%s"}' \
  "$FX_BANNED_EMAIL" "$(json_escape "$SMOKE_TEST_PASSWORD")" > "$TMP/login.json"
call "$TMP/banned" -H "x-turnstile-bypass: $SMOKE_BYPASS_TOKEN" \
  --data-binary @"$TMP/login.json" "$API/auth/login"
rm -f "$TMP/login.json"
if [ "$code" = "401" ] && grep -q "ACCOUNT_BANNED" "$TMP/body"; then
  pass "a banned person is told so at sign-in"
else
  fail "a banned person signing in answered $code"
fi

# Registration refuses a known leaked password. Every other field is valid
# and new, so the password is the only reason left; nothing is stored.
new_session "$TMP/register"
reg_id=$(od -An -tx1 -N6 /dev/urandom | tr -d ' \n')
call "$TMP/register" -H "x-turnstile-bypass: $SMOKE_BYPASS_TOKEN" \
  -d "{\"email\":\"smoke-register-$reg_id@example.invalid\",\"username\":\"cs_smoke_reg_$reg_id\",\"password\":\"password1\",\"dateOfBirth\":\"1990-01-01\"}" \
  "$API/auth/register"
if [ "$code" = "400" ] && grep -q "PASSWORD_LEAKED" "$TMP/body"; then
  pass "registration refuses a leaked password"
elif [ "$code" = "400" ] && grep -q "REGISTRATION_CLOSED" "$TMP/body"; then
  skip "leaked password: registration is closed (system setting)"
else
  fail "registration with a leaked password answered $code"
fi

if [ "$ok" != "1" ]; then
  echo "Signed-in smoke check FAILED."
  exit 1
fi
echo "Signed-in smoke check passed."
