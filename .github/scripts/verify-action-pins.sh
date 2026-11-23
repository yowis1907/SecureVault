#!/usr/bin/env bash
# Checks that every action in the workflows is pinned to a full commit SHA,
# and that the SHA is the commit its version comment names in the action's own repository.
#
# A SHA alone proves nothing about where the code came from: GitHub also runs commits that
# are not on any branch or tag of the named repository. The version comment ties the pin
# to a release that can be reviewed.
#
# Usage: verify-action-pins.sh [workflow files...]   (default: .github/workflows/*.yml)
# Needs the GitHub CLI with a token (GH_TOKEN) that can read public repositories.
set -euo pipefail

files=("$@")
if [ ${#files[@]} -eq 0 ]; then
  files=(.github/workflows/*.yml .github/workflows/*.yaml)
fi

failures=0
checked=0
declare -A resolved=()

fail() {
  echo "FAIL $1"
  failures=$((failures + 1))
}

# The commit a tag points to, following an annotated tag to its commit.
tag_commit() {
  local repo=$1 tag=$2 out sha type
  out=$(gh api "repos/$repo/git/ref/tags/$tag" --jq '.object.sha + " " + .object.type' 2>/dev/null) || return 1
  sha=${out% *}
  type=${out#* }
  if [ "$type" = "tag" ]; then
    sha=$(gh api "repos/$repo/git/tags/$sha" --jq '.object.sha') || return 1
  fi
  echo "$sha"
}

for file in "${files[@]}"; do
  [ -f "$file" ] || continue
  while IFS= read -r line; do
    location="$file:${line%%:*}"
    text=${line#*:}
    # The value after "uses:", without quotes.
    value=$(sed -E 's/^[[:space:]]*(-[[:space:]]*)?uses:[[:space:]]*//; s/["'\'']//g' <<<"$text")
    ref=${value%%[[:space:]]*}
    case "$ref" in
      ./* | docker://*) continue ;;
    esac
    checked=$((checked + 1))

    if ! [[ "$ref" =~ ^([^/@]+/[^/@]+)(/[^@]*)?@([0-9a-f]{40})$ ]]; then
      fail "$location: $ref is not pinned to a full commit SHA"
      continue
    fi
    repo=${BASH_REMATCH[1]}
    sha=${BASH_REMATCH[3]}

    if ! [[ "$value" =~ \#[[:space:]]*([^[:space:]]+) ]]; then
      fail "$location: $ref has no version comment, such as '# v1.2.3'"
      continue
    fi
    tag=${BASH_REMATCH[1]}

    key="$repo@$tag"
    if [ -z "${resolved[$key]+set}" ]; then
      resolved[$key]=$(tag_commit "$repo" "$tag" || echo "missing")
    fi
    expected=${resolved[$key]}

    if [ "$expected" = "missing" ]; then
      fail "$location: $repo has no tag $tag"
    elif [ "$expected" != "$sha" ]; then
      fail "$location: $repo $tag is ${expected:0:12}, but the pin is ${sha:0:12}"
    else
      echo "ok   $location: $repo $tag"
    fi
  done < <(grep -nE '^[[:space:]]*(-[[:space:]]*)?uses:' "$file" || true)
done

echo "$checked action reference(s) checked, $failures problem(s)."
[ "$failures" -eq 0 ]
