#!/usr/bin/env bash
# Creates the accounts the load test signs in as (loadtest-N@circlesfera.test)
# and marks their email as verified directly in the database, because the
# disposable environment has no inbox.
#
# Only for a disposable environment: it refuses any API or database that is
# not on localhost.
#
# Usage:
#   API_URL=http://localhost:3005/api/v1 \
#   DATABASE_URL=postgresql://prisma:prisma@localhost:5432/circlesfera_e2e \
#   LOAD_TEST_PASSWORD=... LOAD_TEST_ACCOUNTS=10 \
#     load-tests/create-accounts.sh
set -euo pipefail

: "${API_URL:?API_URL is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${LOAD_TEST_PASSWORD:?LOAD_TEST_PASSWORD is required}"
ACCOUNTS="${LOAD_TEST_ACCOUNTS:-10}"

case "$API_URL" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *) echo "❌ API_URL must be on localhost." >&2; exit 1 ;;
esac
case "$DATABASE_URL" in
  *@localhost:*|*@127.0.0.1:*) ;;
  *) echo "❌ DATABASE_URL must be on localhost." >&2; exit 1 ;;
esac

for index in $(seq 1 "$ACCOUNTS"); do
  # The body goes on stdin so the password never appears on a command line.
  code=$(printf '{"email":"loadtest-%s@circlesfera.test","username":"loadtest_%s","password":"%s","fullName":"Load Test %s","dateOfBirth":"1990-01-01"}' \
      "$index" "$index" "$LOAD_TEST_PASSWORD" "$index" \
    | curl -sS -o /dev/null -w '%{http_code}' \
        -H 'Content-Type: application/json' --data-binary @- \
        "$API_URL/auth/register")
  # 409: the account is already there from an earlier run.
  if [ "$code" != "201" ] && [ "$code" != "409" ]; then
    echo "❌ Could not create account $index (HTTP $code)." >&2
    exit 1
  fi
done

verified=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
  "WITH updated AS (
     UPDATE \"users\" SET \"emailVerified\" = NOW(), \"verificationToken\" = NULL
     WHERE email LIKE 'loadtest-%@circlesfera.test' RETURNING 1
   ) SELECT count(*) FROM updated")
if [ "$verified" -lt "$ACCOUNTS" ]; then
  echo "❌ Only $verified of $ACCOUNTS accounts were found to verify." >&2
  exit 1
fi
echo "✅ $ACCOUNTS load-test accounts are ready."
