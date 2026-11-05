#!/usr/bin/env bash
# Runs the database security tests against a throwaway Postgres.
#
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres ./scripts/test-db.sh
#
# Creates a fresh database "crm_test", applies tests/db/supabase-shim.sql and
# all supabase/migrations/*.sql, then runs tests/db/security.test.sql.
# Exits non-zero if any check fails.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
TEST_DB="crm_test"
TEST_URL="${ADMIN_URL%/*}/${TEST_DB}"
PSQL=(psql -X -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists ${TEST_DB}" -c "create database ${TEST_DB}" >/dev/null 2>&1

"${PSQL[@]}" "$TEST_URL" -f "$ROOT/tests/db/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! out="$("${PSQL[@]}" "$TEST_URL" -f "$f" 2>&1)"; then
    echo "$out"
    echo "migration failed: $(basename "$f")"
    exit 1
  fi
  echo "applied $(basename "$f")"
done

OUT="$(psql -X "$TEST_URL" -f "$ROOT/tests/db/security.test.sql" 2>&1)"
echo "$OUT" | grep -E "PASS|FAIL|ERROR|^---" | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR): +//; s/^(NOTICE|ERROR): +//'

PASSED=$(echo "$OUT" | grep -c "PASS" || true)
FAILED=$(echo "$OUT" | grep -cE "FAIL|ERROR" || true)
echo
echo "passed: $PASSED, failed: $FAILED"

"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists ${TEST_DB}" >/dev/null 2>&1 || true
[ "$FAILED" -eq 0 ] && [ "$PASSED" -gt 0 ]
