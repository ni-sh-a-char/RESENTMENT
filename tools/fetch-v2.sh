#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# The website lives on main; the operating system lives on v2.0.0. The site
# renders the OS's docs and ships the OS's desktop, so before building it we
# pull those files out of the version branch into v2/, which is ignored.
#
#   sh tools/fetch-v2.sh            # local branch if present, else origin
#
# Doing this by copy rather than by symlink or submodule keeps main free of
# the OS's build and keeps the docs single-sourced: the page you read on the
# site is the file in the tree, at the commit the site was built from.
set -eu

BRANCH=v2.0.0
if git rev-parse -q --verify "refs/heads/$BRANCH" >/dev/null 2>&1; then
	REF="refs/heads/$BRANCH"
else
	# Fully qualified: a tag shares the branch's name, and a bare name
	# resolves to the tag, which is a release and not the branch head.
	git fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
	REF="refs/remotes/origin/$BRANCH"
fi

rm -rf v2
mkdir -p v2
git archive "$REF" docs CHANGELOG.md os/desktop os/user | tar -x -C v2
echo "  v2/ from $REF at $(git rev-parse --short "$REF")"
git rev-parse "$REF" > v2/COMMIT
